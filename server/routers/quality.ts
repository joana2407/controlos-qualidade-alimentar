import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  areas,
  bphfInspectionEmployees,
  bphfEmployeeMerges,
  factories,
  checklistAreas,
  checklistItems,
  checklistItemAreas,
  checklistItemFactories,
  controlPlans,
  controlEntries,
  controlTasks,
  dailyIncidenceSummaries,
  dailyReportArchives,
  dailyReportArchiveViews,
  correctiveActions,
  evidences,
  fragileAreas,
  fragileItems,
  nonconformities,
  qualityPanelAccess,
  qualityPinProfiles,
  qualityPinSessions,
  qualityModuleValues,
  resultValues,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  createManualDailyReportArchive,
  createRetroactiveDailyReportRevision,
} from "../daily-report-archive";
import { ensureDailyReportArchiveBackup } from "../daily-report-backup";
import {
  businessDayAfter,
  calculateConformityRate,
  calculateDispatchConformity,
  calculateSensoryScore,
  fragileInspectionDelayDays,
  fragileInspectionDueDate,
  type FragilePeriodicity,
  isBusinessDay,
  isFragileInspectionPending,
  nextBusinessDay,
  shouldCreateCriticalMetalAlert,
} from "../quality.logic";
import {
  calculatePlanCompliance,
  countOpenNonconformities,
  scopeToFactory,
} from "../factory.scope.logic";
import { storageGetSignedUrl, storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import {
  createSessionToken,
  hashPin,
  hashSessionToken,
  QUALITY_OPERATOR_COOKIE,
  QUALITY_SESSION_HOURS,
  QUALITY_TEAM_DEFAULTS,
  validatePin,
  verifyPin,
} from "../team-access";
import { getSessionCookieOptions } from "../_core/cookies";
import {
  protectedProcedure,
  publicProcedure,
  qualityManagerProcedure,
  qualityOperatorProcedure,
  qualitySessionProcedure,
  router,
} from "../_core/trpc";
import { getDispatchProfile } from "../../shared/dispatch-control";
import { QUALITY_EXTERNAL_PANEL_KEYS, QUALITY_PANEL_KEYS, isQualityExternalPanelKey, isQualityPanelKey, type QualityExternalPanelKey, type QualityPanelKey } from "../../shared/quality-panel-access";
import { lisbonCalendarDateToUtc, lisbonDateInputValue, lisbonDayBoundsUtc } from "../../shared/lisbon-time";

const qualityModuleSchema = z.enum(qualityModuleValues);
const resultSchema = z.enum(resultValues);
type FragileState = "Íntegro" | "Danificado" | "Em falta";
const fragileStateFromResult = (
  result: string | null | undefined,
  fallback: FragileState | null = null
): FragileState | null => {
  if (result === "C") return "Íntegro";
  if (result === "NC") return "Danificado";
  return fallback;
};
const qualityProfileRoleSchema = z.enum(["technician", "manager", "viewer"]);
const qualityPanelKeySchema = z.enum(QUALITY_PANEL_KEYS as [QualityPanelKey, ...QualityPanelKey[]]);
const qualityExternalPanelKeySchema = z.enum(QUALITY_EXTERNAL_PANEL_KEYS as [QualityExternalPanelKey, ...QualityExternalPanelKey[]]);
const qualityProfileRoleDetails = {
  technician: { title: "Tec. Qualidade", label: "Técnica/Técnico de Qualidade" },
  manager: { title: "Resp. Qualidade", label: "Responsável de Qualidade" },
  viewer: { title: "Consulta", label: "Consulta" },
} as const;
const retroactiveReasonSchema = z.enum([
  "verified_not_registered",
  "technical_unavailability",
  "other",
]);
const retroactiveReasonLabels: Record<
  z.infer<typeof retroactiveReasonSchema>,
  string
> = {
  verified_not_registered:
    "Controlo verificado no dia agendado, mas não registado",
  technical_unavailability:
    "Adiado por falta de disponibilidade técnica para verificação no dia em que estava agendado",
  other: "Outra opção",
};
const dateInput = z.coerce.date();
const incidenceTreatmentStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
]);
const fragileRiskLevelSchema = z.enum(["1", "2", "3"]);
const fragileTreatmentReviewSchema = z.object({
  periodicity: z.enum(["D", "S", "Q", "M"]),
  riskLevel: fragileRiskLevelSchema,
  rationale: z.string().trim().max(1200).optional(),
});
const TEMPERATURE_EQUIPMENT_IDS_BY_FACTORY: Record<number, string[]> = {
  1: ["f1-freezer-1", "f1-freezer-2"],
  2: ["f2-cold-room", "f2-dispatch-freezer"],
};
const LEGACY_TEMPERATURE_EQUIPMENT_IDS_BY_FACTORY: Record<number, string[]> = {
  1: ["f1-freezer-1", "f1-freezer-2"],
  2: ["f2-cold-room"],
};
const normaliseIncidenceIsoDate = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const portuguese = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return portuguese
    ? `${portuguese[3]}-${portuguese[2].padStart(2, "0")}-${portuguese[1].padStart(2, "0")}`
    : trimmed;
};
const incidenceIsoDateSchema = z.preprocess(
  normaliseIncidenceIsoDate,
  z.string().date().optional()
);
const incidenceTreatmentSchema = z.object({
  status: incidenceTreatmentStatusSchema,
  correction: z.string().max(3000).optional(),
  responsible: z.string().max(160).optional(),
  dueDate: incidenceIsoDateSchema,
  completedAt: incidenceIsoDateSchema,
  notes: z.string().max(3000).optional(),
  evidencePhotos: z
    .array(
      z.object({
        key: z.string().min(1),
        url: z.string().startsWith("/manus-storage/"),
        fileName: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      })
    )
    .max(8)
    .optional(),
});
const followUpReviewAlertSchema = z.object({
  followUpTaskId: z.number().int(),
  title: z.string().min(1).max(180),
  result: resultSchema,
  notes: z.string().max(3000),
  completedAt: z.string().datetime(),
  registeredByProfileId: z.number().int(),
  registeredByName: z.string().min(1).max(160),
  registeredByTitle: z.string().min(1).max(120),
});
function incidenceTreatmentFromPayload(payload: Record<string, unknown>) {
  const parsed = incidenceTreatmentSchema.safeParse(payload.incidenceTreatment);
  return parsed.success ? parsed.data : { status: "pending" as const };
}
function followUpReviewAlertsFromPayload(payload: Record<string, unknown>) {
  const parsed = z.array(followUpReviewAlertSchema).safeParse(
    payload.followUpReviewAlerts
  );
  return parsed.success ? parsed.data : [];
}
function pendingFollowUpReviewAlertsFromPayload(payload: Record<string, unknown>) {
  const acknowledgedAt =
    typeof payload.followUpReviewAcknowledgedAt === "string" &&
    !Number.isNaN(new Date(payload.followUpReviewAcknowledgedAt).getTime())
      ? new Date(payload.followUpReviewAcknowledgedAt)
      : null;
  return followUpReviewAlertsFromPayload(payload).filter(
    alert => !acknowledgedAt || new Date(alert.completedAt) > acknowledgedAt
  );
}
function incidenceDecisionFromPayload(
  payload: Record<string, unknown>,
  generatedNonconformity: boolean
) {
  return generatedNonconformity
    ? ("nc_generated" as const)
    : payload.treatmentDecision === "no_nc"
      ? ("no_nc" as const)
      : ("pending" as const);
}
function controlledPointKey(
  entry: {
    module: string;
    factoryId: number | null;
    title?: string | null;
    area?: string | null;
  },
  payload: Record<string, unknown>
) {
  const pointId = [
    "fragileItemId",
    "checklistItemId",
    "suggestionBoxId",
    "metalDetectorLineId",
    "temperaturePointId",
    "foodDefenseItemId",
  ]
    .map(key => payload[key])
    .find(value => typeof value === "number" || typeof value === "string");
  // Um título, produto ou área em texto livre não identifica de forma segura o
  // mesmo ponto controlado. Sem um identificador persistido não há base para
  // somar incidências distintas e recomendar automaticamente a abertura de NC.
  if (pointId === undefined) return null;
  return `${entry.module}|${entry.factoryId ?? "none"}|id:${String(pointId)}`;
}
const BPHF_AREA_NAMES = ["Produção", "Embalagem", "Limpeza"] as const;
const BPHF_CRITERIA = [
  "Estado de limpeza e conservação do fardamento",
  "Higienização das mãos dos manipuladores",
  "Cumprimento geral das regras de BPHF",
  "Estado de limpeza e organização dos cacifos do pessoal e de trabalho",
] as const;
const SUGGESTION_LOCATIONS_BY_FACTORY: Record<string, readonly string[]> = {
  F1_FATIADO: ["Caixa escritório", "Caixa WC feminino", "Caixa WC masculino"],
  F2_GRANEL: ["Caixa WC feminino", "Caixa WC masculino"],
  F3_SEM_GLUTEN: ["Caixa WC feminino", "Caixa WC masculino"],
};
const REQUIRED_MODULE_FREQUENCIES = [
  { module: "bphf", frequency: "daily", title: "BPHF obrigatório" },
  { module: "shelf_life", frequency: "daily", title: "Shelf-life obrigatório" },
  {
    module: "suggestion_boxes",
    frequency: "weekly",
    title: "Caixas de sugestões obrigatórias",
  },
  {
    module: "sensory",
    frequency: "weekly",
    title: "Controlo sensorial obrigatório",
  },
  {
    module: "monthly_checklist",
    frequency: "monthly",
    title: "Checklist mensal obrigatório",
  },
] as const;
const MONTHLY_CHECKLIST_TEMPLATE = [
  "Cumprimento do plano de higienização",
  "Monitorização do grau de cumprimento do plano de manutenção preventiva",
  "Estado de limpeza de paredes e tectos",
  "Estado de limpeza de todas as superfícies no interior das áreas de laboração (inspecionar zonas ocultas)",
  "Cumprimento dos layouts e circuitos definidos por todos os colaboradores",
  "FT e FS dos produtos de higienização actualizados",
  "Todos os detergentes encontram-se protegidos e com bacias de retenção",
  "As dispensas encontram-se fechadas quando nenhum responsável está na área e apenas os responsáveis têm acesso",
  "MP/ME não conformes separadas de MP/ME conformes, identificadas e em local adequado",
  "Correcta identificação de MP (lote e validade) e materiais utilizados para testes",
  "Protecção de MP e embalagens primárias contra contaminações físicas",
  "Estado de conservação de paredes, tectos, portas, janelas, pavimentos, rodapés, calhas, ralos, redes de escoamento e redes mosquiteiras",
  "Estado de conservação e limpeza de lamelas e fitas",
  "Protecção dos ralos de escoamento",
  "Os cais mantêm-se fechados, sendo abertos apenas quando necessário",
  "Estado de conservação de utensílios e equipamentos de trabalho",
  "Arrumação de utensílios de trabalho",
  "Ausência de objectos não autorizados nas áreas de laboração",
  "Equipamentos e utensílios de limpeza em bom estado de conservação e guardados no devido local",
  "Estado de limpeza do pavimento nos horários de laboração",
  "Caixas plásticas em bom estado de limpeza e conservação",
  "Cumprimento das boas práticas de manipulação e higiene por todos os colaboradores",
  "Higiene pessoal: mãos, luvas e protecção de ferimentos",
  "Higiene pessoal: utilização correta do fardamento e EPI",
  "Arrumação e limpeza de cacifos do pessoal",
  "Zonas de passagem desobstruídas",
  "IT suficientes, adequadas e atualizadas na língua adequada aos colaboradores",
  "Portões e entradas fechados, exceto durante descargas e cargas",
  "Vedação em bom estado de conservação",
  "Estado de conservação e funcionamento de câmaras de vigilância",
  "Cumprimento do Plano de Controlo de Pragas: equipamentos identificados, ligados e sem evidências de pragas",
] as const;
const dispatchOrderExtractionSchema = z.object({
  orderNumber: z.string().max(80),
  customer: z.string().max(160),
  products: z
    .array(
      z.object({
        name: z.string().max(180),
        orderedQuantity: z.number().int().min(0),
      })
    )
    .max(30),
  warnings: z.array(z.string().max(240)).max(12),
});
const verifiedDispatchProductCheckSchema = z.object({
  verificationStatus: z.literal("verified").optional(),
  name: z.string().min(2).max(180),
  orderedQuantity: z.number().int().min(0),
  lots: z
    .array(
      z.object({
        lot: z.string().min(1).max(120),
        dispatchedQuantity: z.number().int().min(0),
      })
    )
    .min(1)
    .max(20),
  productLabelResult: z.enum(["C", "NC"]),
  boxLabelResult: z.enum(["C", "NC"]),
  productTemperature: z.number().min(-100).max(100),
  observations: z.string().max(3000).optional(),
});
const unverifiedDispatchProductCheckSchema = z.object({
  verificationStatus: z.literal("not_verified"),
  name: z.string().min(2).max(180),
  orderedQuantity: z.number().int().min(0),
  notVerifiedReason: z.string().min(3).max(3000),
});
const dispatchProductCheckSchema = z.union([
  verifiedDispatchProductCheckSchema,
  unverifiedDispatchProductCheckSchema,
]);

function asDateRange(date: Date) {
  return lisbonDayBoundsUtc(date);
}

function localDateKey(date: Date) {
  return lisbonDateInputValue(date);
}

function addCalendarDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12, 0, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function calendarDayOfWeek(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

function analyticsPeriodBounds(period: "day" | "week" | "month" | "custom", referenceDate: Date, startDate?: Date, endDate?: Date) {
  const startReferenceKey = lisbonDateInputValue(startDate ?? referenceDate);
  if (startDate && endDate) {
    const startKey = startReferenceKey;
    const endKey = addCalendarDays(lisbonDateInputValue(endDate), 1);
    return { startKey, endKey, ...lisbonDayBoundsUtc(lisbonCalendarDateToUtc(startKey)), end: lisbonDayBoundsUtc(lisbonCalendarDateToUtc(endKey)).start };
  }
  let startKey = startReferenceKey;
  if (period === "week") {
    const mondayOffset = (calendarDayOfWeek(startKey) + 6) % 7;
    startKey = addCalendarDays(startKey, -mondayOffset);
  } else if (period === "month") {
    startKey = `${startKey.slice(0, 8)}01`;
  }
  const endKey = period === "week" ? addCalendarDays(startKey, 7) : period === "month" ? addCalendarDays(startKey, 32).slice(0, 8) + "01" : addCalendarDays(startKey, 1);
  return { startKey, endKey, start: lisbonDayBoundsUtc(lisbonCalendarDateToUtc(startKey)).start, end: lisbonDayBoundsUtc(lisbonCalendarDateToUtc(endKey)).start };
}

function incidenceOccurredOnFromPayload(
  payload: Record<string, unknown>,
  fallback: Date
) {
  const parsed = incidenceIsoDateSchema.safeParse(payload.occurredOn);
  return parsed.success && parsed.data ? parsed.data : localDateKey(fallback);
}

function incidenceOccurredAtFromPayload(
  payload: Record<string, unknown>,
  fallback: Date
) {
  return new Date(`${incidenceOccurredOnFromPayload(payload, fallback)}T12:00:00`);
}

function startOfWorkingWeek(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function isLastBusinessDayOfMonth(date: Date) {
  const candidate = new Date(date);
  candidate.setHours(0, 0, 0, 0);
  candidate.setDate(candidate.getDate() + 1);
  while (!isBusinessDay(candidate)) candidate.setDate(candidate.getDate() + 1);
  return candidate.getMonth() !== date.getMonth();
}

function isPlanDue(frequency: string, date: Date) {
  if (!isBusinessDay(date)) return false;
  if (frequency === "daily" || frequency === "per_shift")
    return isBusinessDay(date);
  if (frequency === "weekly") return date.getDay() === 5;
  if (frequency === "monthly") return false;
  return false;
}

const sharedPlanModules = new Set(["dispatch_control", "internal_analysis"]);
const oneSubmissionPlanModules = new Set<(typeof qualityModuleValues)[number]>([
  "sensory",
  "shelf_life",
  "suggestion_boxes",
  "dispatch_control",
  "internal_analysis",
  "temperature_controls",
]);
const FOOD_DEFENSE_EXPECTED_CRITERIA = 131;

type OperationalProfile = { id: number; role: string; name: string };

function entryPayload(entry: { payload?: unknown }) {
  return entry.payload &&
    typeof entry.payload === "object" &&
    !Array.isArray(entry.payload)
    ? (entry.payload as Record<string, unknown>)
    : {};
}

function entryOperationalDate(entry: { completedAt: Date; payload?: unknown }) {
  const payload = entryPayload(entry);
  const plannedDate = payload.plannedDate;
  if (
    typeof plannedDate === "string" &&
    !Number.isNaN(new Date(plannedDate).getTime())
  )
    return localDateKey(new Date(plannedDate));
  const actualDate = payload.actualVerificationDate;
  if (typeof actualDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(actualDate))
    return actualDate;
  return localDateKey(new Date(entry.completedAt));
}

/**
 * Data do calendário em que o ponto de Quebráveis foi efetivamente verificado.
 *
 * `plannedDate` identifica a tarefa a que o registo pertence; já
 * `actualVerificationDate` é a fonte correta para calcular o próximo ciclo,
 * sobretudo quando o registo foi lançado retroativamente.
 */
function fragileInspectionOperationalDate(entry: {
  completedAt: Date;
  payload?: unknown;
}) {
  const actualDate = entryPayload(entry).actualVerificationDate;
  if (typeof actualDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(actualDate))
    return actualDate;
  return entryOperationalDate(entry);
}

function fragileInspectionAt(entry: { completedAt: Date; payload?: unknown }) {
  return lisbonCalendarDateToUtc(fragileInspectionOperationalDate(entry));
}

function isDeletedControlEntry(entry: { payload?: unknown }) {
  const lifecycle = entryPayload(entry).recordLifecycle;
  return Boolean(
    lifecycle &&
      typeof lifecycle === "object" &&
      !Array.isArray(lifecycle) &&
      (lifecycle as Record<string, unknown>).status === "deleted"
  );
}

function coverageSlot(type: string, ...parts: Array<string | number>) {
  return JSON.stringify([type, ...parts]);
}

export function completedCoverageSlots(
  module: (typeof qualityModuleValues)[number],
  entries: Array<{ area: string; title?: string; payload?: unknown }>
) {
  const completed = new Set<string>();
  entries.forEach(entry => {
    const payload = entryPayload(entry);
    if (module === "bphf") {
      const criterion =
        typeof payload.criterion === "string"
          ? payload.criterion
          : entry.title ?? "";
      if (criterion) completed.add(coverageSlot("bphf", entry.area, criterion));
      return;
    }
    if (module === "metal_detectors") {
      completed.add(coverageSlot("metal", entry.area));
      return;
    }
    if (module === "temperature_controls") {
      if (Array.isArray(payload.equipment))
        payload.equipment.forEach(item => {
          if (
            item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).id === "string"
          )
            completed.add(
              coverageSlot(
                "temperature",
                String((item as Record<string, unknown>).id)
              )
            );
        });
      return;
    }
    if (module === "monthly_checklist") {
      if (typeof payload.checklistItemId === "number")
        completed.add(
          coverageSlot("monthly", payload.checklistItemId, entry.area)
        );
      return;
    }
    if (module === "food_defense") {
      if (typeof payload.foodDefenseCriterionId === "string")
        completed.add(
          coverageSlot("food_defense", payload.foodDefenseCriterionId)
        );
      if (Array.isArray(payload.criteria))
        payload.criteria.forEach(criterion => {
          if (
            criterion &&
            typeof criterion === "object" &&
            typeof (criterion as Record<string, unknown>).id === "string"
          )
            completed.add(
              coverageSlot(
                "food_defense",
                String((criterion as Record<string, unknown>).id)
              )
            );
        });
      return;
    }
    if (module === "fragile_items") {
      if (typeof payload.fragileItemId === "number")
        completed.add(coverageSlot("fragile", payload.fragileItemId));
      return;
    }
    if (module === "suggestion_boxes") {
      completed.add(coverageSlot("suggestion", entry.area));
      return;
    }
    completed.add(coverageSlot("submission"));
  });
  return completed;
}

export function entryMatchesPlannedTask(
  entry: {
    module: string;
    factoryId: number | null;
    completedAt: Date;
    payload?: unknown;
  },
  task: {
    id: number;
    module: (typeof qualityModuleValues)[number];
    factoryId: number | null;
    dueAt: Date;
  }
) {
  if (
    isDeletedControlEntry(entry) ||
    entry.module !== task.module ||
    entry.factoryId !== task.factoryId
  )
    return false;
  const payload = entryPayload(entry);
  return (
    Number(payload.plannedTaskId) === task.id ||
    entryOperationalDate(entry) === localDateKey(new Date(task.dueAt))
  );
}

function expectedMetalDetectorLines(
  task: { factoryId: number | null; metalDetectorLines?: string[] | null },
  areaCatalog: Array<{
    group: string;
    factoryId: number | null;
    active: string;
    name: string;
  }>
) {
  const configuredLines = areaCatalog
    .filter(
      area =>
        area.group === "metal" &&
        area.factoryId === task.factoryId &&
        area.active === "true"
    )
    .map(area => area.name);
  return Array.isArray(task.metalDetectorLines)
    ? configuredLines.filter(line => task.metalDetectorLines!.includes(line))
    : configuredLines;
}

function metalDetectorsTaskComplete(
  task: { factoryId: number | null; metalDetectorLines?: string[] | null },
  entries: Array<{
    area: string;
    module: string;
    factoryId: number | null;
    completedAt: Date;
    payload?: unknown;
  }>,
  areaCatalog: Array<{
    group: string;
    factoryId: number | null;
    active: string;
    name: string;
  }>
) {
  const expectedAreas = expectedMetalDetectorLines(task, areaCatalog);
  if (!expectedAreas.length) return false;
  const completedAreas = new Set(entries.map(entry => entry.area));
  return expectedAreas.every(area => completedAreas.has(area));
}

function expectedTemperatureEquipmentIds(task: {
  factoryId: number | null;
  temperatureEquipmentIds?: string[] | null;
}) {
  if (Array.isArray(task.temperatureEquipmentIds))
    return Array.from(
      new Set(
        task.temperatureEquipmentIds.filter(
          (equipmentId): equipmentId is string =>
            typeof equipmentId === "string" && Boolean(equipmentId)
        )
      )
    );
  if (!task.factoryId) return [];
  return LEGACY_TEMPERATURE_EQUIPMENT_IDS_BY_FACTORY[task.factoryId] ?? [];
}

function temperatureControlsTaskComplete(
  task: {
    factoryId: number | null;
    temperatureEquipmentIds?: string[] | null;
  },
  entries: Array<{ payload?: unknown }>
) {
  const expectedEquipmentIds = expectedTemperatureEquipmentIds(task);
  if (!expectedEquipmentIds.length) return false;
  const registeredEquipmentIds = new Set<string>();
  entries.forEach(entry => {
    const equipment = entryPayload(entry).equipment;
    if (!Array.isArray(equipment)) return;
    equipment.forEach(item => {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string"
      )
        registeredEquipmentIds.add(
          (item as Record<string, string>).id
        );
    });
  });
  return expectedEquipmentIds.every(equipmentId =>
    registeredEquipmentIds.has(equipmentId)
  );
}

function expectedBphfAreas(
  task: { factoryId: number | null },
  areaCatalog: Array<{
    group: string;
    factoryId: number | null;
    active: string;
    name: string;
  }>
) {
  const configuredAreas = areaCatalog
    .filter(
      area =>
        area.group === "bphf" &&
        area.factoryId === task.factoryId &&
        area.active === "true" &&
        BPHF_AREA_NAMES.includes(area.name as (typeof BPHF_AREA_NAMES)[number])
    )
    .map(area => area.name);
  return configuredAreas.length ? configuredAreas : [...BPHF_AREA_NAMES];
}

function bphfTaskComplete(
  task: { factoryId: number | null; bphfCriteria?: string[] | null },
  entries: Array<{ area: string; title?: string }>,
  areaCatalog: Array<{
    group: string;
    factoryId: number | null;
    active: string;
    name: string;
  }>
) {
  const expectedAreas = expectedBphfAreas(task, areaCatalog);
  const expectedCriteria = Array.isArray(task.bphfCriteria)
    ? BPHF_CRITERIA.filter(criterion => task.bphfCriteria!.includes(criterion))
    : BPHF_CRITERIA;
  if (!expectedCriteria.length) return false;
  const completedSlots = new Set(
    entries.map(entry => `${entry.area}::${entry.title ?? ""}`)
  );
  return expectedAreas.every(area =>
    expectedCriteria.every(criterion =>
      completedSlots.has(`${area}::${criterion}`)
    )
  );
}

function suggestionLocationsForFactory(factoryCode: string | undefined) {
  return factoryCode
    ? (SUGGESTION_LOCATIONS_BY_FACTORY[factoryCode] ?? [])
    : [];
}

function suggestionBoxesTaskComplete(
  task: { factoryId: number | null },
  entries: Array<{ area: string; factoryId: number | null }>,
  factoryCatalog: Array<{ id: number; code: string }>
) {
  const factory = factoryCatalog.find(item => item.id === task.factoryId);
  const expectedLocations = suggestionLocationsForFactory(factory?.code);
  if (!expectedLocations.length) return false;
  const completedLocations = new Set(entries.map(entry => entry.area));
  return expectedLocations.every(location => completedLocations.has(location));
}

function monthlyChecklistTaskComplete(
  task: { factoryId: number | null },
  entries: Array<{ payload?: unknown; area?: string }>,
  items: Array<{ id: number; active: string; area?: string }>,
  assignments: Array<{ checklistItemId: number; factoryId: number }>,
  areaAssignments: Array<{ checklistItemId: number; checklistAreaId: number }> = [],
  areaRows: Array<{ id: number; name: string; active?: string }> = []
) {
  const areaNameById = new Map(
    areaRows
      .filter(area => area.active !== "false")
      .map(area => [area.id, area.name])
  );
  const expectedChecks = items
    .filter(
      item =>
        item.active === "true" &&
        (assignments.some(assignment => assignment.checklistItemId === item.id)
          ? assignments.some(
              assignment =>
                assignment.checklistItemId === item.id &&
                assignment.factoryId === task.factoryId
            )
          : true)
    )
    .flatMap(item => {
      const areaNames = areaAssignments
        .filter(assignment => assignment.checklistItemId === item.id)
        .map(assignment => areaNameById.get(assignment.checklistAreaId))
        .filter((area): area is string => Boolean(area));
      return (areaNames.length ? areaNames : [item.area ?? "Geral"]).map(
        area => `${item.id}:${area}`
      );
    });
  if (!expectedChecks.length) return false;
  const completedChecks = new Set(
    entries
      .map(entry => {
        const itemId = entryPayload(entry).checklistItemId;
        return typeof itemId === "number" && entry.area
          ? `${itemId}:${entry.area}`
          : null;
      })
      .filter((check): check is string => Boolean(check))
  );
  return expectedChecks.every(check => completedChecks.has(check));
}

function foodDefenseTaskComplete(entries: Array<{ payload?: unknown }>) {
  const completedCriterionIds = new Set<string>();
  entries.forEach(entry => {
    const payload = entryPayload(entry);
    if (typeof payload.foodDefenseCriterionId === "string")
      completedCriterionIds.add(payload.foodDefenseCriterionId);
    if (Array.isArray(payload.criteria))
      payload.criteria.forEach(criterion => {
        if (
          criterion &&
          typeof criterion === "object" &&
          !Array.isArray(criterion) &&
          typeof (criterion as Record<string, unknown>).id === "string"
        )
          completedCriterionIds.add(
            (criterion as Record<string, string>).id
          );
      });
  });
  return completedCriterionIds.size >= FOOD_DEFENSE_EXPECTED_CRITERIA;
}

function fragileItemsTaskComplete(
  task: { id: number; factoryId: number | null; dueAt: Date },
  taskEntries: Array<{ payload?: unknown }>,
  entries: Array<{ module: string; factoryId: number | null; completedAt: Date; payload?: unknown }>,
  items: Array<{
    id: number;
    factoryId: number | null;
    periodicity: FragilePeriodicity;
    status: string;
  }>
) {
  if (!task.factoryId) return false;
  const dueDate = new Date(task.dueAt);
  const dueDateKey = localDateKey(dueDate);
  const lastInspectionsBeforePlan = new Map<number, Date>();
  entries
    .filter(
      entry =>
        entry.module === "fragile_items" &&
        entry.factoryId === task.factoryId &&
        fragileInspectionOperationalDate(entry) < dueDateKey
    )
    .forEach(entry => {
      const itemId = entryPayload(entry).fragileItemId;
      if (typeof itemId === "number" && !lastInspectionsBeforePlan.has(itemId))
        lastInspectionsBeforePlan.set(itemId, fragileInspectionAt(entry));
    });
  const expectedItemIds = items
    .filter(
      item =>
        item.factoryId === task.factoryId &&
        item.status === "active" &&
        isFragileInspectionPending(
          item.periodicity,
          lastInspectionsBeforePlan.get(item.id),
          dueDate
        )
    )
    .map(item => item.id);
  // Uma tarefa pode existir no Plano do Dia sem pontos aplicáveis, por exemplo
  // quando um ponto semanal/mensal não vence nesse dia. Essa tarefa não deve
  // transformar um ciclo não aplicável numa pendência histórica.
  if (!expectedItemIds.length) return true;
  const completedItemIds = new Set(
    taskEntries
      .map(entry => entryPayload(entry).fragileItemId)
      .filter((itemId): itemId is number => typeof itemId === "number")
  );
  return expectedItemIds.every(itemId => completedItemIds.has(itemId));
}

export function buildPlannedCoverage(
  task: {
    module: (typeof qualityModuleValues)[number];
    factoryId: number | null;
    dueAt: Date;
    bphfCriteria?: string[] | null;
    metalDetectorLines?: string[] | null;
    temperatureEquipmentIds?: string[] | null;
  },
  entries: Array<{
    area: string;
    module: string;
    factoryId: number | null;
    completedAt: Date;
    payload?: unknown;
  }>,
  areaCatalog: Array<{
    group: string;
    factoryId: number | null;
    active: string;
    name: string;
  }>,
  monthlyItems: Array<{ id: number; active: string; area?: string }>,
  monthlyAssignments: Array<{ checklistItemId: number; factoryId: number }>,
  factoryCatalog: Array<{ id: number; code: string }>,
  monthlyAreaAssignments: Array<{
    checklistItemId: number;
    checklistAreaId: number;
  }>,
  monthlyAreaRows: Array<{ id: number; name: string; active?: string }>,
  fragileCatalog: Array<{
    id: number;
    factoryId: number | null;
    periodicity: FragilePeriodicity;
    status: string;
  }>
) {
  if (task.module === "bphf") {
    const criteria = Array.isArray(task.bphfCriteria)
      ? BPHF_CRITERIA.filter(criterion => task.bphfCriteria!.includes(criterion))
      : BPHF_CRITERIA;
    return expectedBphfAreas(task, areaCatalog).flatMap(area =>
      criteria.map(criterion => coverageSlot("bphf", area, criterion))
    );
  }
  if (task.module === "metal_detectors")
    return expectedMetalDetectorLines(task, areaCatalog).map(line =>
      coverageSlot("metal", line)
    );
  if (task.module === "temperature_controls")
    return expectedTemperatureEquipmentIds(task).map(equipmentId =>
      coverageSlot("temperature", equipmentId)
    );
  if (task.module === "suggestion_boxes") {
    const factory = factoryCatalog.find(item => item.id === task.factoryId);
    return suggestionLocationsForFactory(factory?.code).map(location =>
      coverageSlot("suggestion", location)
    );
  }
  if (task.module === "monthly_checklist") {
    const areaNameById = new Map(
      monthlyAreaRows
        .filter(area => area.active !== "false")
        .map(area => [area.id, area.name])
    );
    return monthlyItems
      .filter(
        item =>
          item.active === "true" &&
          (monthlyAssignments.some(
            assignment => assignment.checklistItemId === item.id
          )
            ? monthlyAssignments.some(
                assignment =>
                  assignment.checklistItemId === item.id &&
                  assignment.factoryId === task.factoryId
              )
            : true)
      )
      .flatMap(item => {
        const areaNames = monthlyAreaAssignments
          .filter(assignment => assignment.checklistItemId === item.id)
          .map(assignment => areaNameById.get(assignment.checklistAreaId))
          .filter((area): area is string => Boolean(area));
        return (areaNames.length ? areaNames : [item.area ?? "Geral"]).map(area =>
          coverageSlot("monthly", item.id, area)
        );
      });
  }
  if (task.module === "food_defense")
    return Array.from({ length: FOOD_DEFENSE_EXPECTED_CRITERIA }, (_, index) =>
      coverageSlot("food_defense", `fd-${index + 1}`)
    );
  if (task.module === "fragile_items") {
    if (!task.factoryId) return [];
    const dueDateKey = localDateKey(task.dueAt);
    const lastInspectionsBeforePlan = new Map<number, Date>();
    entries
      .filter(
        entry =>
          !isDeletedControlEntry(entry) &&
          entry.module === "fragile_items" &&
          entry.factoryId === task.factoryId &&
          fragileInspectionOperationalDate(entry) < dueDateKey
      )
      .forEach(entry => {
        const itemId = entryPayload(entry).fragileItemId;
        if (typeof itemId === "number" && !lastInspectionsBeforePlan.has(itemId))
          lastInspectionsBeforePlan.set(itemId, fragileInspectionAt(entry));
      });
    return fragileCatalog
      .filter(
        item =>
          item.factoryId === task.factoryId &&
          item.status === "active" &&
          isFragileInspectionPending(
            item.periodicity,
            lastInspectionsBeforePlan.get(item.id),
            task.dueAt
          )
      )
      .map(item => coverageSlot("fragile", item.id));
  }
  return [coverageSlot("submission")];
}

export function isHistoricalPlanTaskSatisfied(
  task: {
    id: number;
    module: (typeof qualityModuleValues)[number];
    factoryId: number | null;
    dueAt: Date;
    bphfCriteria?: string[] | null;
    metalDetectorLines?: string[] | null;
    temperatureEquipmentIds?: string[] | null;
    plannedCoverage?: string[] | null;
  },
  entries: Array<{
    area: string;
    module: string;
    factoryId: number | null;
    completedAt: Date;
    payload?: unknown;
  }>,
  areaCatalog: Array<{
    group: string;
    factoryId: number | null;
    active: string;
    name: string;
  }>,
  monthlyItems: Array<{ id: number; active: string }> = [],
  monthlyAssignments: Array<{
    checklistItemId: number;
    factoryId: number;
  }> = [],
  factoryCatalog: Array<{ id: number; code: string }> = [],
  monthlyAreaAssignments: Array<{
    checklistItemId: number;
    checklistAreaId: number;
  }> = [],
  monthlyAreaRows: Array<{ id: number; name: string; active?: string }> = [],
  fragileCatalog: Array<{
    id: number;
    factoryId: number | null;
    periodicity: FragilePeriodicity;
    status: string;
  }> = []
) {
  const taskEntries = entries.filter(entry =>
    entryMatchesPlannedTask(entry, task)
  );
  if (Array.isArray(task.plannedCoverage) && task.plannedCoverage.length) {
    const completedSlots = completedCoverageSlots(task.module, taskEntries);
    return task.plannedCoverage.every(slot => completedSlots.has(slot));
  }
  if (task.module === "bphf")
    return bphfTaskComplete(task, taskEntries, areaCatalog);
  if (task.module === "metal_detectors")
    return metalDetectorsTaskComplete(task, taskEntries, areaCatalog);
  if (task.module === "temperature_controls")
    return temperatureControlsTaskComplete(task, taskEntries);
  if (task.module === "monthly_checklist")
    return monthlyChecklistTaskComplete(
      task,
      taskEntries,
      monthlyItems,
      monthlyAssignments,
      monthlyAreaAssignments,
      monthlyAreaRows
    );
  if (task.module === "food_defense")
    return foodDefenseTaskComplete(taskEntries);
  if (task.module === "fragile_items")
    return fragileItemsTaskComplete(task, taskEntries, entries, fragileCatalog);
  if (task.module === "suggestion_boxes")
    return suggestionBoxesTaskComplete(task, taskEntries, factoryCatalog);
  return oneSubmissionPlanModules.has(task.module) && taskEntries.length > 0;
}

function isPlanTaskResolved(
  task: {
    status?: string | null;
    id: number;
    module: (typeof qualityModuleValues)[number];
    factoryId: number | null;
    dueAt: Date;
    bphfCriteria?: string[] | null;
    metalDetectorLines?: string[] | null;
    temperatureEquipmentIds?: string[] | null;
    plannedCoverage?: string[] | null;
  },
  entries: Parameters<typeof isHistoricalPlanTaskSatisfied>[1],
  areaCatalog: Parameters<typeof isHistoricalPlanTaskSatisfied>[2],
  monthlyItems: Parameters<typeof isHistoricalPlanTaskSatisfied>[3],
  monthlyAssignments: Parameters<typeof isHistoricalPlanTaskSatisfied>[4],
  factoryCatalog: Parameters<typeof isHistoricalPlanTaskSatisfied>[5],
  monthlyAreaAssignments: Parameters<typeof isHistoricalPlanTaskSatisfied>[6],
  monthlyAreaRows: Parameters<typeof isHistoricalPlanTaskSatisfied>[7],
  fragileCatalog: Parameters<typeof isHistoricalPlanTaskSatisfied>[8]
) {
  const isHistoricalTask = localDateKey(new Date(task.dueAt)) < localDateKey(new Date());
  return (
    (task.status === "completed" && isHistoricalTask) ||
    isHistoricalPlanTaskSatisfied(
    task,
    entries,
    areaCatalog,
    monthlyItems,
    monthlyAssignments,
    factoryCatalog,
    monthlyAreaAssignments,
    monthlyAreaRows,
    fragileCatalog
    )
  );
}

async function assessControlAuthorization(
  db: any,
  input: {
    module: (typeof qualityModuleValues)[number];
    factoryId?: number | null;
    plannedTaskId?: number;
    plannedDate?: Date;
    profile: OperationalProfile;
  }
) {
  const isShared = sharedPlanModules.has(input.module);
  if (!isShared && !input.factoryId)
    return {
      allowed: false,
      reason:
        "Selecione a fábrica ou linha antes de consultar ou preencher este controlo.",
      task: null,
      isPreviousPending: false,
      isFuturePlanned: false,
    };
  const today = localDateKey(new Date());
  const [
    tasks,
    entries,
    areaCatalog,
    monthlyItems,
    monthlyAssignments,
    monthlyAreaAssignments,
    monthlyAreaRows,
    factoryCatalog,
    fragileCatalog,
  ] = await Promise.all([
    db.select().from(controlTasks).orderBy(controlTasks.dueAt),
    db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
    db.select().from(areas).orderBy(areas.name),
    db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
    db
      .select()
      .from(checklistItemFactories)
      .orderBy(checklistItemFactories.factoryId),
    db.select().from(checklistItemAreas),
    db.select().from(checklistAreas),
    db.select().from(factories).orderBy(factories.name),
    db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
  ]);
  const allowsSupplementaryDailyEntries =
    input.module === "bphf" ||
    input.module === "internal_analysis" ||
    input.module === "shelf_life" ||
    input.module === "temperature_controls" ||
    input.module === "sensory" ||
    input.module === "suggestion_boxes" ||
    input.module === "metal_detectors" ||
    input.module === "dispatch_control";
  const eligibleTasks = tasks.filter((item: any) => {
    const isCurrentDay = localDateKey(new Date(item.dueAt)) === today;
    const plannedCoverageSatisfied =
      item.status !== "cancelled" &&
      isPlanTaskResolved(
        item,
        entries,
        areaCatalog,
        monthlyItems,
        monthlyAssignments,
        factoryCatalog,
        monthlyAreaAssignments,
        monthlyAreaRows,
        fragileCatalog
      );
    const hasIncompletePlannedCoverage = !plannedCoverageSatisfied;
    const isExplicitDispatchSupplement =
      input.module === "dispatch_control" && Boolean(input.plannedTaskId);
    const isCompletedPlanOpenForSupplement =
      allowsSupplementaryDailyEntries &&
      plannedCoverageSatisfied &&
      (isCurrentDay || isExplicitDispatchSupplement);
    return (
      (hasIncompletePlannedCoverage || isCompletedPlanOpenForSupplement) &&
      item.area === "Plano do Dia" &&
      item.module === input.module &&
      item.status !== "cancelled" &&
      isBusinessDay(new Date(item.dueAt)) &&
      (isShared
        ? item.factoryId === null
        : item.factoryId === input.factoryId)
    );
  });
  const matchingTasks = input.plannedTaskId
    ? eligibleTasks
    : input.plannedDate
      ? eligibleTasks.filter(
          (item: any) =>
            localDateKey(new Date(item.dueAt)) ===
            localDateKey(input.plannedDate!)
        )
      : eligibleTasks.filter(
          (item: any) => localDateKey(new Date(item.dueAt)) <= today
        );
  const task = input.plannedTaskId
    ? matchingTasks.find((item: any) => item.id === input.plannedTaskId)
    : [...matchingTasks].sort(
        (left: any, right: any) =>
          Number(localDateKey(new Date(right.dueAt)) === today) -
            Number(localDateKey(new Date(left.dueAt)) === today) ||
          new Date(right.dueAt).getTime() - new Date(left.dueAt).getTime()
      )[0];
  if (!task)
    return {
      allowed: false,
      reason:
        "Este controlo não está incluído num Plano do Dia publicado para hoje nem existem pendências anteriores atribuídas.",
      task: null,
      isPreviousPending: false,
      isFuturePlanned: false,
    };
  const assignees = Array.isArray(task.assigneeProfileIds)
    ? task.assigneeProfileIds
    : [];
  if (input.profile.role !== "manager" && !assignees.includes(input.profile.id))
    return {
      allowed: false,
      reason:
        "Este controlo foi agendado para outro colaborador. Apenas os responsáveis designados ou a Responsável de Qualidade podem preenchê-lo.",
      task,
      isPreviousPending: false,
      isFuturePlanned: false,
    };
  const isPreviousPending = localDateKey(new Date(task.dueAt)) < today;
  const isFuturePlanned = localDateKey(new Date(task.dueAt)) > today;
  const plannedDate = new Date(task.dueAt).toLocaleDateString("pt-PT");
  const reason = isPreviousPending
    ? `Preenchimento autorizado para a pendência do Plano do Dia de ${plannedDate}. A data prevista será mantida no registo.`
    : isFuturePlanned
      ? `Antecipação autorizada para o controlo previsto no Plano do Dia de ${plannedDate}. A data prevista e a data efetiva ficarão ambas registadas.`
      : input.profile.role === "manager"
        ? "Preenchimento autorizado como Responsável de Qualidade."
        : "Preenchimento autorizado pelo Plano do Dia.";
  const relatedBphfTasks =
    task.module === "bphf"
      ? (() => {
          const rootTaskId = task.parentTaskId ?? task.id;
          const rootTask = tasks.find((item: any) => item.id === rootTaskId) ?? task;
          const dueDate = localDateKey(new Date(rootTask.dueAt));
          return tasks.filter(
            (item: any) =>
              item.module === "bphf" &&
              item.area === "Plano do Dia" &&
              item.factoryId === rootTask.factoryId &&
              localDateKey(new Date(item.dueAt)) === dueDate &&
              (item.id === rootTask.id || item.parentTaskId === rootTask.id) &&
              item.status !== "cancelled"
          );
        })()
      : [];
  const bphfCriteria = relatedBphfTasks.length
    ? BPHF_CRITERIA.filter(criterion =>
        relatedBphfTasks.some((item: any) =>
          Array.isArray(item.bphfCriteria) && item.bphfCriteria.includes(criterion)
        )
      )
    : task.bphfCriteria ?? null;
  const bphfCriterionTaskIds = Object.fromEntries(
    relatedBphfTasks.flatMap((item: any) =>
      (Array.isArray(item.bphfCriteria) ? item.bphfCriteria : []).map(
        (criterion: string) => [criterion, item.id]
      )
    )
  );
  return {
    allowed: true,
    reason,
    task,
    bphfCriteria,
    bphfCriterionTaskIds,
    isPreviousPending,
    isFuturePlanned,
  };
}

async function requireControlAuthorization(
  db: any,
  input: {
    module: (typeof qualityModuleValues)[number];
    factoryId?: number | null;
    plannedTaskId?: number;
    profile: OperationalProfile;
  }
) {
  const access = await assessControlAuthorization(db, input);
  if (!access.allowed)
    throw new TRPCError({ code: "FORBIDDEN", message: access.reason });
  return access;
}

async function reconcilePlannedControlTaskStatus(
  db: any,
  plannedTaskId: number | null | undefined
) {
  if (!plannedTaskId) return;
  const task = (
    await db
      .select()
      .from(controlTasks)
      .where(eq(controlTasks.id, plannedTaskId))
      .limit(1)
  )[0];
  if (!task || task.area !== "Plano do Dia" || task.status === "cancelled")
    return;
  const [entries, areaCatalog, monthlyItems, monthlyAssignments, monthlyAreaAssignments, monthlyAreaRows, factoryCatalog, fragileCatalog] =
    await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(areas).orderBy(areas.name),
      db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
      db
        .select()
        .from(checklistItemFactories)
        .orderBy(checklistItemFactories.factoryId),
      db.select().from(checklistItemAreas),
      db.select().from(checklistAreas),
      db.select().from(factories).orderBy(factories.name),
      db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
    ]);
  const completed = isHistoricalPlanTaskSatisfied(
    task,
    entries,
    areaCatalog,
    monthlyItems,
    monthlyAssignments,
    factoryCatalog,
    monthlyAreaAssignments,
    monthlyAreaRows,
    fragileCatalog
  );
  const latestMatchingEntry = entries.find((entry: any) =>
    entryMatchesPlannedTask(entry, task)
  );
  await db
    .update(controlTasks)
    .set(
      completed
        ? {
            status: "completed",
            completedAt: latestMatchingEntry?.completedAt ?? task.dueAt,
            completedByProfileId:
              latestMatchingEntry?.registeredByProfileId ?? null,
            completedByName: latestMatchingEntry?.registeredByName ?? null,
            completedByTitle: latestMatchingEntry?.registeredByTitle ?? null,
          }
        : {
            status: "pending",
            completedAt: null,
            completedByProfileId: null,
            completedByName: null,
            completedByTitle: null,
          }
    )
    .where(eq(controlTasks.id, task.id));
}

async function requireDb() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "A base de dados não está disponível.",
    });
  return db;
}

function normalizeChecklistAreaName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

async function ensureChecklistArea(db: any, name: string, createdBy: string) {
  const normalizedName = normalizeChecklistAreaName(name);
  const existing = await db
    .select()
    .from(checklistAreas)
    .where(eq(checklistAreas.name, normalizedName))
    .limit(1);
  if (existing[0]) {
    if (existing[0].active !== "true")
      await db
        .update(checklistAreas)
        .set({ active: "true" })
        .where(eq(checklistAreas.id, existing[0].id));
    return existing[0].id;
  }
  const inserted = await db
    .insert(checklistAreas)
    .values({ name: normalizedName, active: "true", createdBy })
    .$returningId();
  return Number(inserted[0]!.id);
}

export const qualityRouter = router({
  accessStatus: publicProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const existing = await db
      .select()
      .from(qualityPinProfiles)
      .orderBy(qualityPinProfiles.id);
    const existingCodes = new Set(existing.map(profile => profile.code));
    const missing = QUALITY_TEAM_DEFAULTS.filter(
      profile => !existingCodes.has(profile.code)
    );
    if (missing.length) {
      await db
        .insert(qualityPinProfiles)
        .values(
          missing.map(profile => ({
            ...profile,
            active: "true" as const,
            pinHash: null,
            createdBy: ctx.user?.openId ?? "system-quality",
          }))
        );
    }
    const profiles = missing.length
      ? await db
          .select()
          .from(qualityPinProfiles)
          .orderBy(qualityPinProfiles.id)
      : existing;
    const managerProfile = profiles.find(profile => profile.role === "manager");
    const panelAccessRows = await db.select().from(qualityPanelAccess);
    const panelAccessByProfileId = new Map(panelAccessRows.map(row => [row.profileId, { internal: row.allowedPanels.filter(isQualityPanelKey), external: row.allowedExternalPanels?.filter(isQualityExternalPanelKey) ?? QUALITY_EXTERNAL_PANEL_KEYS }]));
    return {
      profiles: profiles.map(profile => ({
        id: profile.id,
        code: profile.code,
        name: profile.name,
        title: profile.title,
        role: profile.role,
        isConfigured: Boolean(profile.pinHash),
        active: profile.active === "true",
        panelAccess: profile.role === "manager" ? QUALITY_PANEL_KEYS : (panelAccessByProfileId.get(profile.id)?.internal ?? QUALITY_PANEL_KEYS),
        externalPanelAccess: profile.role === "manager" ? QUALITY_EXTERNAL_PANEL_KEYS : (panelAccessByProfileId.get(profile.id)?.external ?? QUALITY_EXTERNAL_PANEL_KEYS),
      })),
      activeProfile: ctx.operatorProfile ? {
        ...ctx.operatorProfile,
        panelAccess: ctx.operatorProfile.role === "manager" ? QUALITY_PANEL_KEYS : (panelAccessByProfileId.get(ctx.operatorProfile.id)?.internal ?? QUALITY_PANEL_KEYS),
        externalPanelAccess: ctx.operatorProfile.role === "manager" ? QUALITY_EXTERNAL_PANEL_KEYS : (panelAccessByProfileId.get(ctx.operatorProfile.id)?.external ?? QUALITY_EXTERNAL_PANEL_KEYS),
      } : null,
      canManage: ctx.operatorProfile?.role === "manager",
      canBootstrap: ctx.user?.role === "admin" && !managerProfile?.pinHash,
      needsInitialSetup: !profiles.every(profile => Boolean(profile.pinHash)),
    };
  }),

  configureTeamPins: protectedProcedure
    .input(
      z.object({
        pins: z
          .array(
            z.object({
              code: z.string().min(3).max(48),
              pin: z.string().regex(/^\d{4,8}$/),
            })
          )
          .min(1)
          .max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const profiles = await db.select().from(qualityPinProfiles);
      const managerConfigured = profiles.some(
        profile => profile.role === "manager" && Boolean(profile.pinHash)
      );
      if (
        ctx.operatorProfile?.role !== "manager" &&
        !(ctx.user.role === "admin" && !managerConfigured)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas a Responsável de Qualidade pode definir PINs.",
        });
      }
      for (const { code, pin } of input.pins) {
        if (!validatePin(pin))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cada PIN deve ter entre 4 e 8 algarismos.",
          });
        const profile = profiles.find(item => item.code === code);
        if (!profile)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Perfil de equipa não encontrado.",
          });
        await db
          .update(qualityPinProfiles)
          .set({ pinHash: hashPin(pin) })
          .where(eq(qualityPinProfiles.id, profile.id));
      }
      return { success: true };
    }),

  createPinProfile: qualityManagerProcedure
    .input(z.object({
      name: z.string().trim().min(2).max(160),
      role: qualityProfileRoleSchema,
      pin: z.string().regex(/^\d{4,8}$/),
      allowedPanels: z.array(qualityPanelKeySchema).max(QUALITY_PANEL_KEYS.length),
      allowedExternalPanels: z.array(qualityExternalPanelKeySchema).max(QUALITY_EXTERNAL_PANEL_KEYS.length),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const existing = await db.select().from(qualityPinProfiles).where(eq(qualityPinProfiles.name, input.name)).limit(1);
      if (existing[0]) throw new TRPCError({ code: "CONFLICT", message: "Já existe um utilizador com este nome." });
      const profileDetails = qualityProfileRoleDetails[input.role];
      const inserted = await db.insert(qualityPinProfiles).values({
        code: `USR_${createSessionToken().slice(0, 24).toUpperCase()}`,
        name: input.name,
        title: profileDetails.title,
        role: input.role,
        pinHash: hashPin(input.pin),
        active: "true",
        createdBy: ctx.user!.openId,
      }).$returningId();
      const profile = (await db.select().from(qualityPinProfiles).where(eq(qualityPinProfiles.id, Number(inserted[0]!.id))).limit(1))[0]!;
      const allowedPanels = input.role === "manager" ? QUALITY_PANEL_KEYS : input.allowedPanels;
      const allowedExternalPanels = input.role === "manager" ? QUALITY_EXTERNAL_PANEL_KEYS : input.allowedExternalPanels;
      await db.insert(qualityPanelAccess).values({ profileId: profile.id, allowedPanels, allowedExternalPanels, updatedBy: ctx.user!.openId });
      return { id: profile.id, name: profile.name, title: profile.title, role: profile.role, active: profile.active === "true", isConfigured: Boolean(profile.pinHash), panelAccess: allowedPanels, externalPanelAccess: allowedExternalPanels };
    }),

  updatePinProfileAccess: qualityManagerProcedure
    .input(z.object({
      profileId: z.number().int(),
      role: qualityProfileRoleSchema,
      active: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const profiles = await db.select().from(qualityPinProfiles);
      const target = profiles.find(profile => profile.id === input.profileId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Utilizador não encontrado." });
      if (target.id === ctx.operatorProfile!.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Não pode alterar as suas próprias autorizações a partir desta sessão." });
      const activeManagerRemains = profiles.some(profile => {
        const role = profile.id === target.id ? input.role : profile.role;
        const active = profile.id === target.id ? input.active : profile.active === "true";
        return role === "manager" && active;
      });
      if (!activeManagerRemains) throw new TRPCError({ code: "BAD_REQUEST", message: "Tem de permanecer pelo menos uma Responsável de Qualidade ativa." });
      const profileDetails = qualityProfileRoleDetails[input.role];
      await db.update(qualityPinProfiles).set({ role: input.role, title: profileDetails.title, active: input.active ? "true" : "false" }).where(eq(qualityPinProfiles.id, target.id));
      return { success: true };
    }),

  updatePinProfilePanels: qualityManagerProcedure
    .input(z.object({
      profileId: z.number().int(),
      allowedPanels: z.array(qualityPanelKeySchema).max(QUALITY_PANEL_KEYS.length),
      allowedExternalPanels: z.array(qualityExternalPanelKeySchema).max(QUALITY_EXTERNAL_PANEL_KEYS.length),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const profile = (await db.select().from(qualityPinProfiles).where(eq(qualityPinProfiles.id, input.profileId)).limit(1))[0];
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Utilizador não encontrado." });
      if (profile.role === "manager") throw new TRPCError({ code: "BAD_REQUEST", message: "A Responsável de Qualidade mantém acesso integral aos painéis." });
      await db.insert(qualityPanelAccess).values({ profileId: profile.id, allowedPanels: input.allowedPanels, allowedExternalPanels: input.allowedExternalPanels, updatedBy: ctx.user!.openId }).onDuplicateKeyUpdate({ set: { allowedPanels: input.allowedPanels, allowedExternalPanels: input.allowedExternalPanels, updatedBy: ctx.user!.openId } });
      return { success: true };
    }),

  activatePinProfile: publicProcedure
    .input(
      z.object({
        profileId: z.number().int(),
        pin: z.string().regex(/^\d{4,8}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const profile = (
        await db
          .select()
          .from(qualityPinProfiles)
          .where(eq(qualityPinProfiles.id, input.profileId))
          .limit(1)
      )[0];
      if (
        !profile ||
        profile.active !== "true" ||
        !verifyPin(input.pin, profile.pinHash)
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "PIN inválido ou perfil indisponível.",
        });
      }
      const token = createSessionToken();
      const expiresAt = new Date(
        Date.now() + QUALITY_SESSION_HOURS * 60 * 60 * 1000
      );
      await db
        .insert(qualityPinSessions)
        .values({
          profileId: profile.id,
          tokenHash: hashSessionToken(token),
          oauthOpenId: ctx.user?.openId ?? "pin-only",
          expiresAt,
        });
      ctx.res.cookie(QUALITY_OPERATOR_COOKIE, token, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: QUALITY_SESSION_HOURS * 60 * 60 * 1000,
      });
      return {
        success: true,
        profile: {
          id: profile.id,
          name: profile.name,
          title: profile.title,
          role: profile.role,
        },
      };
    }),

  deactivatePinProfile: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(QUALITY_OPERATOR_COOKIE, {
      ...getSessionCookieOptions(ctx.req),
      maxAge: -1,
    });
    return { success: true };
  }),

  metadata: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const [persistedAreas, persistedFactories, persistedProfiles] =
      await Promise.all([
        db.select().from(areas).orderBy(areas.group, areas.name),
        db.select().from(factories).orderBy(factories.name),
        db.select().from(qualityPinProfiles).orderBy(qualityPinProfiles.name),
      ]);
    return {
      areas: persistedAreas.map(area => ({
        id: area.id,
        name: area.name,
        group: area.group,
        factoryId: area.factoryId,
      })),
      factories: persistedFactories.map(factory => ({
        id: factory.id,
        code: factory.code,
        name: factory.name,
      })),
      collaborators: persistedProfiles
        .filter(profile => profile.active === "true")
        .map(profile => ({
          id: profile.id,
          name: profile.name,
          title: profile.title,
        })),
      modules: [
        { id: "bphf", label: "Verificação de BPHF" },
        { id: "metal_detectors", label: "Verificação de detetores de metais" },
        { id: "sensory", label: "Controlo sensorial de produto acabado" },
        { id: "shelf_life", label: "Controlo de amostras em shelf-life" },
        { id: "monthly_checklist", label: "Checklist mensal por área" },
        { id: "suggestion_boxes", label: "Verificação de caixas de sugestões" },
        { id: "fragile_items", label: "Verificação de quebráveis" },
        { id: "dispatch_control", label: "Controlo à expedição" },
        { id: "internal_analysis", label: "Análises internas" },
      ],
    };
  }),

  listAreas: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(areas).orderBy(areas.group, areas.name);
  }),

  listBphfInspectionEmployees: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const employees = await db
      .select()
      .from(bphfInspectionEmployees)
      .where(eq(bphfInspectionEmployees.active, "true"))
      .orderBy(bphfInspectionEmployees.name);
    return employees.map(employee => ({
      id: employee.id,
      name: employee.name,
    }));
  }),

  listBphfInspectionEmployeesAdmin: qualityManagerProcedure.query(async () => {
    const db = await requireDb();
    const employees = await db
      .select()
      .from(bphfInspectionEmployees)
      .orderBy(bphfInspectionEmployees.active, bphfInspectionEmployees.name);
    return employees.map(employee => ({
      id: employee.id,
      name: employee.name,
      active: employee.active === "true",
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    }));
  }),

  createBphfInspectionEmployee: qualityManagerProcedure
    .input(z.object({ name: z.string().trim().min(2).max(160) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const name = input.name.replace(/\s+/g, " ").trim();
      const existing = await db
        .select()
        .from(bphfInspectionEmployees)
        .where(eq(bphfInspectionEmployees.name, name))
        .limit(1);
      if (existing[0]) {
        if (existing[0].active !== "true") {
          await db
            .update(bphfInspectionEmployees)
            .set({ active: "true", updatedAt: new Date() })
            .where(eq(bphfInspectionEmployees.id, existing[0].id));
          return { id: existing[0].id, name: existing[0].name, reactivated: true };
        }
        throw new TRPCError({ code: "CONFLICT", message: "Já existe um colaborador com este nome." });
      }
      const result = await db.insert(bphfInspectionEmployees).values({
        name,
        active: "true",
        createdBy: ctx.user?.openId ?? `quality-profile-${ctx.operatorProfile!.id}`,
      });
      return { id: Number(result[0].insertId), name, reactivated: false };
    }),

  updateBphfInspectionEmployee: qualityManagerProcedure
    .input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(160) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const name = input.name.replace(/\s+/g, " ").trim();
      const target = (await db.select().from(bphfInspectionEmployees).where(eq(bphfInspectionEmployees.id, input.id)).limit(1))[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
      const duplicate = (await db.select().from(bphfInspectionEmployees).where(eq(bphfInspectionEmployees.name, name)).limit(1))[0];
      if (duplicate && duplicate.id !== target.id) throw new TRPCError({ code: "CONFLICT", message: "Já existe um colaborador com este nome." });
      await db.update(bphfInspectionEmployees).set({ name, active: "true", updatedAt: new Date() }).where(eq(bphfInspectionEmployees.id, target.id));
      return { success: true, id: target.id, name };
    }),

  deleteBphfInspectionEmployee: qualityManagerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const target = (await db.select().from(bphfInspectionEmployees).where(eq(bphfInspectionEmployees.id, input.id)).limit(1))[0];
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
      await db.update(bphfInspectionEmployees).set({ active: "false", updatedAt: new Date() }).where(eq(bphfInspectionEmployees.id, target.id));
      return { success: true, id: target.id };
    }),

  previewBphfEmployeeMerge: qualityManagerProcedure
    .input(z.object({ sourceEmployeeId: z.number().int().positive(), targetEmployeeId: z.number().int().positive() }))
    .query(async ({ input }) => {
      if (input.sourceEmployeeId === input.targetEmployeeId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha dois colaboradores diferentes." });
      const db = await requireDb();
      const [source, target] = await Promise.all([
        db.select().from(bphfInspectionEmployees).where(eq(bphfInspectionEmployees.id, input.sourceEmployeeId)).limit(1),
        db.select().from(bphfInspectionEmployees).where(eq(bphfInspectionEmployees.id, input.targetEmployeeId)).limit(1),
      ]);
      if (!source[0] || !target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
      if (source[0].active !== "true" || target[0].active !== "true")
        throw new TRPCError({ code: "BAD_REQUEST", message: "A fusão requer dois colaboradores ativos." });
      const entries = await db.select().from(controlEntries);
      const affected = entries.filter(entry => {
        const payload = entry.payload as Record<string, unknown>;
        return payload.collaboratorId === input.sourceEmployeeId;
      });
      return {
        source: { id: source[0].id, name: source[0].name },
        target: { id: target[0].id, name: target[0].name },
        affectedEntries: affected.length,
        byModule: Object.entries(affected.reduce<Record<string, number>>((acc, entry) => { acc[entry.module] = (acc[entry.module] ?? 0) + 1; return acc; }, {})).map(([module, total]) => ({ module, total })),
        sample: affected.slice(0, 5).map(entry => ({ id: entry.id, module: entry.module, title: entry.title, completedAt: entry.completedAt })),
      };
    }),

  listBphfEmployeeMerges: qualityManagerProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(bphfEmployeeMerges).orderBy(desc(bphfEmployeeMerges.mergedAt));
  }),

  mergeBphfInspectionEmployees: qualityManagerProcedure
    .input(z.object({ sourceEmployeeId: z.number().int().positive(), targetEmployeeId: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceEmployeeId === input.targetEmployeeId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha dois colaboradores diferentes." });
      const db = await requireDb();
      const [sourceRows, targetRows] = await Promise.all([
        db.select().from(bphfInspectionEmployees).where(eq(bphfInspectionEmployees.id, input.sourceEmployeeId)).limit(1),
        db.select().from(bphfInspectionEmployees).where(eq(bphfInspectionEmployees.id, input.targetEmployeeId)).limit(1),
      ]);
      const source = sourceRows[0];
      const target = targetRows[0];
      if (!source || !target) throw new TRPCError({ code: "NOT_FOUND", message: "Colaborador não encontrado." });
      if (source.active !== "true" || target.active !== "true")
        throw new TRPCError({ code: "BAD_REQUEST", message: "A fusão requer dois colaboradores ativos." });
      const entries = await db.select().from(controlEntries);
      const affected = entries.filter(entry => (entry.payload as Record<string, unknown>).collaboratorId === source.id);
      const mergedAt = new Date();
      for (const entry of affected) {
        const payload = entry.payload as Record<string, unknown>;
        await db.update(controlEntries).set({ payload: {
          ...payload,
          collaboratorId: target.id,
          collaboratorName: target.name,
          collaboratorMerge: { fromId: source.id, fromName: source.name, toId: target.id, toName: target.name, mergedAt: mergedAt.toISOString() },
        } }).where(eq(controlEntries.id, entry.id));
      }
      await db.update(bphfInspectionEmployees).set({ active: "false", updatedAt: mergedAt }).where(eq(bphfInspectionEmployees.id, source.id));
      const audit = await db.insert(bphfEmployeeMerges).values({ sourceEmployeeId: source.id, targetEmployeeId: target.id, sourceName: source.name, targetName: target.name, reason: input.reason.trim(), affectedEntries: affected.length, mergedBy: ctx.user?.openId ?? `quality-profile-${ctx.operatorProfile!.id}`, mergedAt });
      return { success: true, auditId: Number(audit[0].insertId), sourceEmployeeId: source.id, targetEmployeeId: target.id, affectedEntries: affected.length };
    }),

  addBphfInspectionEmployee: qualityOperatorProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(160),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const name = input.name.replace(/\s+/g, " ").trim();
      const existing = await db
        .select()
        .from(bphfInspectionEmployees)
        .where(eq(bphfInspectionEmployees.name, name))
        .limit(1);
      if (existing[0]) {
        if (existing[0].active !== "true")
          await db
            .update(bphfInspectionEmployees)
            .set({ active: "true" })
            .where(eq(bphfInspectionEmployees.id, existing[0].id));
        return {
          id: existing[0].id,
          name: existing[0].name,
          alreadyExists: true,
        };
      }
      const result = await db
        .insert(bphfInspectionEmployees)
        .values({
          name,
          active: "true",
          createdBy:
            ctx.user?.openId ?? `quality-profile-${ctx.operatorProfile!.id}`,
        });
      return { id: Number(result[0].insertId), name, alreadyExists: false };
    }),

  listBphfCollaboratorInspections: qualitySessionProcedure
    .input(
      z
        .object({
          collaboratorId: z.number().int().optional(),
          factoryId: z.number().int().optional(),
          result: resultSchema.optional(),
          operationalDate: dateInput.optional(),
          plannedTaskId: z.number().int().optional(),
          plannedTaskIds: z.array(z.number().int()).min(1).max(20).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [eq(controlEntries.module, "bphf")];
      if (input?.factoryId)
        conditions.push(eq(controlEntries.factoryId, input.factoryId));
      const entries = await db
        .select()
        .from(controlEntries)
        .where(and(...conditions))
        .orderBy(desc(controlEntries.completedAt))
        .limit(150);
      return entries.flatMap(entry => {
        const payload =
          entry.payload &&
          typeof entry.payload === "object" &&
          !Array.isArray(entry.payload)
            ? (entry.payload as Record<string, unknown>)
            : {};
        const collaboratorId = Number(payload.collaboratorId);
        const collaboratorName =
          typeof payload.collaboratorName === "string"
            ? payload.collaboratorName
            : "";
        const hasCollaborator = collaboratorId > 0 && Boolean(collaboratorName);
        const isNotApplicable = entry.result === "N/A";
        if (!hasCollaborator && !isNotApplicable) return [];
        if (input?.collaboratorId && collaboratorId !== input.collaboratorId)
          return [];
        if (input?.result && entry.result !== input.result) return [];
        const plannedTaskId = Number(payload.plannedTaskId);
        if (input?.plannedTaskId && plannedTaskId !== input.plannedTaskId)
          return [];
        if (input?.plannedTaskIds && !input.plannedTaskIds.includes(plannedTaskId))
          return [];
        if (
          input?.operationalDate &&
          entryOperationalDate(entry) !== localDateKey(input.operationalDate)
        )
          return [];
        return [
          {
            id: entry.id,
            collaboratorId: hasCollaborator ? collaboratorId : null,
            collaboratorName: hasCollaborator
              ? collaboratorName
              : "Não aplicável",
            criterion:
              typeof payload.criterion === "string"
                ? payload.criterion
                : entry.title,
            area: entry.area,
            result: entry.result,
            notes: entry.notes,
            completedAt: entry.completedAt,
            factoryId: entry.factoryId,
          },
        ];
      });
    }),

  controlAuthorization: qualitySessionProcedure
    .input(
      z.object({
        module: qualityModuleSchema,
        factoryId: z.number().int().optional(),
        plannedTaskId: z.number().int().optional(),
        plannedDate: z.date().optional(),
        viewerProfileId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const access = await assessControlAuthorization(db, {
        module: input.module,
        factoryId: input.factoryId ?? null,
        plannedTaskId: input.plannedTaskId,
        plannedDate: input.plannedDate,
        profile: ctx.operatorProfile!,
      });
      return {
        allowed: access.allowed,
        reason: access.reason,
        taskId: access.task?.id ?? null,
        assignedTo: access.task?.responsible ?? null,
        dueAt: access.task?.dueAt ?? null,
        bphfCriteria: (access as any).bphfCriteria ?? access.task?.bphfCriteria ?? null,
        bphfCriterionTaskIds: (access as any).bphfCriterionTaskIds ?? {},
        metalDetectorLines: access.task?.metalDetectorLines ?? null,
        isPreviousPending: access.isPreviousPending ?? false,
        isFuturePlanned: access.isFuturePlanned ?? false,
      };
    }),

  pendingControlTasks: qualitySessionProcedure
    .input(
      z.object({
        module: qualityModuleSchema,
        factoryId: z.number().int().nullable().optional(),
        viewerProfileId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const isShared = sharedPlanModules.has(input.module);
      if (!isShared && input.factoryId === undefined) return [];
      const today = localDateKey(new Date());
      const [
        tasks,
        entries,
        areaCatalog,
        monthlyItems,
        monthlyAssignments,
        factoryCatalog,
        monthlyAreaAssignments,
        monthlyAreaRows,
        fragileCatalog,
      ] = await Promise.all([
        db.select().from(controlTasks).orderBy(controlTasks.dueAt),
        db
          .select()
          .from(controlEntries)
          .orderBy(desc(controlEntries.completedAt)),
        db.select().from(areas).orderBy(areas.name),
        db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
        db
          .select()
          .from(checklistItemFactories)
          .orderBy(checklistItemFactories.factoryId),
        db.select().from(factories).orderBy(factories.name),
        db.select().from(checklistItemAreas),
        db.select().from(checklistAreas),
        db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
      ]);
      return tasks
        .filter(task => {
          const assignedProfiles = Array.isArray(task.assigneeProfileIds)
            ? task.assigneeProfileIds
            : [];
          const taskDate = localDateKey(new Date(task.dueAt));
          const inScope = isShared
            ? task.factoryId === null
            : task.factoryId === input.factoryId;
          return (
            task.area === "Plano do Dia" &&
            task.module === input.module &&
            task.status !== "cancelled" &&
            inScope &&
            taskDate < today &&
            isBusinessDay(new Date(task.dueAt)) &&
            !isPlanTaskResolved(
              task,
              entries,
              areaCatalog,
              monthlyItems,
              monthlyAssignments,
              factoryCatalog,
              monthlyAreaAssignments,
              monthlyAreaRows,
              fragileCatalog
            ) &&
            (ctx.operatorProfile!.role === "manager" ||
              assignedProfiles.includes(ctx.operatorProfile!.id))
          );
        })
        .map(task => ({
          id: task.id,
          dueAt: task.dueAt,
          responsible: task.responsible,
          factoryId: task.factoryId,
        }))
        .sort(
          (left, right) =>
            new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
        );
    }),

  listFactories: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(factories).orderBy(factories.name);
  }),

  addArea: qualityManagerProcedure
    .input(
      z.object({
        name: z.string().min(2).max(120),
        group: z.enum(["bphf", "metal", "general"]),
        factoryId: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .insert(areas)
        .values({
          ...input,
          factoryId: input.factoryId ?? null,
          active: "true",
          createdBy: ctx.user!.openId,
        });
      return { success: true };
    }),

  listPlans: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    return db
      .select()
      .from(controlPlans)
      .orderBy(controlPlans.module, controlPlans.title);
  }),

  addPlan: qualityManagerProcedure
    .input(
      z.object({
        title: z.string().min(2).max(180),
        module: qualityModuleSchema,
        areaId: z.number().int(),
        factoryId: z.number().int().optional(),
        frequency: z.enum([
          "daily",
          "weekly",
          "monthly",
          "per_shift",
          "per_lot",
        ]),
        critical: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .insert(controlPlans)
        .values({
          ...input,
          factoryId: input.factoryId ?? null,
          critical: input.critical ? "true" : "false",
          active: "true",
          createdBy: ctx.user!.openId,
        });
      return { success: true };
    }),

  initializeMasterData: qualityManagerProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const [existingAreas, existingFactories] = await Promise.all([
      db.select().from(areas).limit(1),
      db.select().from(factories).limit(1),
    ]);
    const defaultAreas = [
      { name: "Embalagem T", group: "bphf" as const },
      { name: "Produção T", group: "bphf" as const },
      { name: "Embalagem SG", group: "bphf" as const },
      { name: "Produção SG", group: "bphf" as const },
      { name: "SG", group: "metal" as const },
      { name: "Tradicional 1", group: "metal" as const },
      { name: "Tradicional 2", group: "metal" as const },
      { name: "Granel", group: "metal" as const },
      { name: "Fábrica II", group: "metal" as const },
    ];
    const defaultFactories = [
      { code: "F1_FATIADO", name: "Fábrica 1 (Fatiado)" },
      { code: "F2_GRANEL", name: "Fábrica 2 (granel)" },
      { code: "F3_SEM_GLUTEN", name: "Fabrica 3 (Sem Gluten)" },
      { code: "LINHA_CROUTONS", name: "Linha Croutons" },
    ];
    let created = 0;
    if (!existingAreas.length) {
      await db
        .insert(areas)
        .values(
          defaultAreas.map(area => ({
            ...area,
            factoryId: null,
            active: "true" as const,
            createdBy: ctx.user!.openId,
          }))
        );
      created += defaultAreas.length;
    }
    if (!existingFactories.length) {
      await db
        .insert(factories)
        .values(
          defaultFactories.map(factory => ({
            ...factory,
            active: "true" as const,
            createdBy: ctx.user!.openId,
          }))
        );
      created += defaultFactories.length;
    }
    const currentFactories = await db.select().from(factories);
    const existingBphfAreas = await db
      .select()
      .from(areas)
      .where(eq(areas.group, "bphf"));
    const existingMetalAreas = await db
      .select()
      .from(areas)
      .where(eq(areas.group, "metal"));
    const bphfAreasToCreate = currentFactories.flatMap(factory =>
      BPHF_AREA_NAMES.filter(
        name =>
          !existingBphfAreas.some(
            area => area.factoryId === factory.id && area.name === name
          )
      ).map(name => ({
        name,
        group: "bphf" as const,
        factoryId: factory.id,
        active: "true" as const,
        createdBy: ctx.user!.openId,
      }))
    );
    if (bphfAreasToCreate.length) {
      await db.insert(areas).values(bphfAreasToCreate);
      created += bphfAreasToCreate.length;
    }
    const metalLinesByFactory: Record<string, string[]> = {
      F1_FATIADO: ["Linha 1", "Linha 2", "Linha Croutons"],
      F2_GRANEL: ["Linha principal"],
      F3_SEM_GLUTEN: ["Linha principal SG"],
    };
    const metalAreasToCreate = currentFactories.flatMap(factory =>
      (metalLinesByFactory[factory.code] ?? [])
        .filter(
          name =>
            !existingMetalAreas.some(
              area => area.factoryId === factory.id && area.name === name
            )
        )
        .map(name => ({
          name,
          group: "metal" as const,
          factoryId: factory.id,
          active: "true" as const,
          createdBy: ctx.user!.openId,
        }))
    );
    if (metalAreasToCreate.length) {
      await db.insert(areas).values(metalAreasToCreate);
      created += metalAreasToCreate.length;
    }
    return { success: true, created };
  }),

  dashboard: qualitySessionProcedure
    .input(
      z
          .object({
            factoryId: z.number().int().optional(),
            date: dateInput.optional(),
            viewerProfileId: z.number().int().optional(),
          })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const [
        tasks,
        ncs,
        entries,
        actions,
        fragileCatalog,
        factoryCatalog,
        areaCatalog,
        monthlyItems,
        monthlyAssignments,
        monthlyAreaAssignments,
        monthlyAreaRows,
      ] = await Promise.all([
        db.select().from(controlTasks).orderBy(controlTasks.dueAt),
        db
          .select()
          .from(nonconformities)
          .orderBy(desc(nonconformities.detectedAt)),
        db
          .select()
          .from(controlEntries)
          .orderBy(desc(controlEntries.completedAt)),
        db.select().from(correctiveActions).orderBy(correctiveActions.dueAt),
        db
          .select()
          .from(fragileItems)
          .orderBy(
            fragileItems.location,
            fragileItems.sortOrder,
            fragileItems.name
          ),
        db.select().from(factories).orderBy(factories.name),
        db.select().from(areas).orderBy(areas.name),
        db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
        db
          .select()
          .from(checklistItemFactories)
          .orderBy(checklistItemFactories.factoryId),
        db.select().from(checklistItemAreas),
        db.select().from(checklistAreas),
      ]);
      const scopedTasks = scopeToFactory(tasks, input?.factoryId);
      const scopedNcs = scopeToFactory(ncs, input?.factoryId);
      const scopedEntries = scopeToFactory(entries, input?.factoryId);
      const scopedActions = scopeToFactory(actions, input?.factoryId);
      const scopedFragileCatalog = scopeToFactory(
        fragileCatalog,
        input?.factoryId
      );
      const now = new Date();
      const operationalDate = input?.date
        ? new Date(
            input.date.getFullYear(),
            input.date.getMonth(),
            input.date.getDate()
          )
        : nextBusinessDay(now);
      const { start, end } = asDateRange(operationalDate);
      const tomorrowDate = businessDayAfter(operationalDate);
      const { start: tomorrowStart, end: tomorrowEnd } =
        asDateRange(tomorrowDate);
      const workingWeekStart = startOfWorkingWeek(operationalDate);
      const workingWeekEnd = new Date(workingWeekStart);
      workingWeekEnd.setDate(workingWeekEnd.getDate() + 5);
      const businessTasks = scopedTasks.filter(
        task => isBusinessDay(task.dueAt) && task.status !== "cancelled"
      );
      const completedToday = scopedEntries.filter(
        entry => entryOperationalDate(entry) === localDateKey(operationalDate)
      );
      const todayTasks = businessTasks.filter(
        task => task.dueAt >= start && task.dueAt < end
      );
      const plannedControls = todayTasks.filter(
        task => task.area === "Plano do Dia"
      );
      const adHocTasks = businessTasks.filter(
        task => task.area !== "Plano do Dia"
      );
      const hasScheduleForSelectedDate = todayTasks.length > 0;
      const visibleAdHocTasks = hasScheduleForSelectedDate
        ? adHocTasks.filter(task => task.dueAt >= start && task.dueAt < end)
        : [];
      const completedTasksToday = todayTasks.filter(
        task => task.area !== "Plano do Dia" && task.status === "completed"
      );
      const monthlyChecklistPlannedThisMonth = businessTasks.some(
        task =>
          task.module === "monthly_checklist" &&
          task.dueAt.getFullYear() === operationalDate.getFullYear() &&
          task.dueAt.getMonth() === operationalDate.getMonth()
      );
      const monthlyChecklistReminder =
        !input?.factoryId &&
        operationalDate.getDate() >= 20 &&
        !monthlyChecklistPlannedThisMonth;
      const foodDefensePlannedThisYear = businessTasks.some(
        task =>
          task.module === "food_defense" &&
          task.dueAt.getFullYear() === operationalDate.getFullYear()
      );
      const foodDefenseReminder =
        !input?.factoryId && !foodDefensePlannedThisYear;
      const payloadFor = (entry: (typeof entries)[number]) =>
        entryPayload(entry);
      const lastFragileInspections = new Map<number, Date>();
      const lastFragileInspectionsBeforeDay = new Map<number, Date>();
      scopedEntries
        .filter(entry => entry.module === "fragile_items")
        .forEach(entry => {
          const payload = entry.payload;
          const fragileItemId =
            payload && typeof payload === "object" && !Array.isArray(payload)
              ? (payload as { fragileItemId?: unknown }).fragileItemId
              : null;
          if (typeof fragileItemId === "number" && !isDeletedControlEntry(entry)) {
            const inspectionDate = fragileInspectionOperationalDate(entry);
            const inspectionAt = fragileInspectionAt(entry);
            const latestInspection = lastFragileInspections.get(fragileItemId);
            if (!latestInspection || inspectionAt > latestInspection)
              lastFragileInspections.set(fragileItemId, inspectionAt);
            if (
              inspectionDate < localDateKey(operationalDate) &&
              (!lastFragileInspectionsBeforeDay.has(fragileItemId) ||
                inspectionAt > lastFragileInspectionsBeforeDay.get(fragileItemId)!)
            )
              lastFragileInspectionsBeforeDay.set(fragileItemId, inspectionAt);
          }
        });
      const isPlannedControlCompleted = (
        task: (typeof plannedControls)[number]
      ) =>
        isPlanTaskResolved(
          task,
          entries,
          areaCatalog,
          monthlyItems,
          monthlyAssignments,
          factoryCatalog,
          monthlyAreaAssignments,
          monthlyAreaRows,
          scopedFragileCatalog
        );
      const completedPlannedControls = plannedControls.filter(
        isPlannedControlCompleted
      );
      const missingVerificationsForPlannedControl = (
        task: (typeof plannedControls)[number]
      ) => {
        const taskEntries = entries.filter(entry =>
          entryMatchesPlannedTask(entry, task)
        );
        if (Array.isArray(task.plannedCoverage) && task.plannedCoverage.length) {
          const completedSlots = completedCoverageSlots(task.module, taskEntries);
          const missingSlots = task.plannedCoverage.filter(
            slot => !completedSlots.has(slot)
          );
          if (task.module === "food_defense")
            return {
              count: missingSlots.length,
              labels: missingSlots.length
                ? [`${missingSlots.length} ponto(s) da checklist Food Defense`]
                : [],
            };
          const itemById = new Map(monthlyItems.map(item => [item.id, item]));
          const fragileById = new Map(
            scopedFragileCatalog.map(item => [item.id, item])
          );
          const equipmentNameById: Record<string, string> = {
            "f1-freezer-1": "Equipamento de congelação 1",
            "f1-freezer-2": "Equipamento de congelação 2",
            "f2-cold-room": "Câmara de Frio",
            "f2-dispatch-freezer": "Arca de Congelação expedição",
          };
          const labels = missingSlots.map(slot => {
            const [type, first, second] = JSON.parse(slot) as [
              string,
              string | number | undefined,
              string | undefined,
            ];
            if (type === "bphf") return `${first} · ${second}`;
            if (type === "metal" || type === "suggestion") return String(first);
            if (type === "temperature")
              return equipmentNameById[String(first)] ?? String(first);
            if (type === "monthly")
              return `${itemById.get(Number(first))?.label ?? "Ponto da checklist"} · ${second}`;
            if (type === "fragile")
              return fragileById.get(Number(first))?.name ?? `Ponto de Quebráveis ${first}`;
            return "Registo mínimo do controlo";
          });
          return { count: missingSlots.length, labels };
        }
        if (task.module === "temperature_controls") {
          const equipmentNameById: Record<string, string> = {
            "f1-freezer-1": "Equipamento de congelação 1",
            "f1-freezer-2": "Equipamento de congelação 2",
            "f2-cold-room": "Câmara de Frio",
            "f2-dispatch-freezer": "Arca de Congelação expedição",
          };
          const registeredEquipmentIds = new Set(
            taskEntries.flatMap(entry => {
              const equipment = entryPayload(entry).equipment;
              return Array.isArray(equipment)
                ? equipment
                    .map(item =>
                      item && typeof item === "object"
                        ? (item as Record<string, unknown>).id
                        : null
                    )
                    .filter((id): id is string => typeof id === "string")
                : [];
            })
          );
          const missing = expectedTemperatureEquipmentIds(task).filter(
            equipmentId => !registeredEquipmentIds.has(equipmentId)
          );
          return {
            count: missing.length,
            labels: missing.map(
              equipmentId => equipmentNameById[equipmentId] ?? equipmentId
            ),
          };
        }
        if (task.module === "metal_detectors") {
          const expected = expectedMetalDetectorLines(task, areaCatalog);
          const completed = new Set(taskEntries.map(entry => entry.area));
          const missing = expected.filter(line => !completed.has(line));
          return { count: missing.length, labels: missing };
        }
        if (task.module === "bphf") {
          const expectedAreas = expectedBphfAreas(task, areaCatalog);
          const expectedCriteria = Array.isArray(task.bphfCriteria)
            ? BPHF_CRITERIA.filter(criterion =>
                task.bphfCriteria!.includes(criterion)
              )
            : BPHF_CRITERIA;
          const completed = new Set(
            taskEntries.map(entry => `${entry.area}::${entry.title ?? ""}`)
          );
          const missing = expectedAreas.flatMap(area =>
            expectedCriteria
              .filter(criterion => !completed.has(`${area}::${criterion}`))
              .map(criterion => `${area} · ${criterion}`)
          );
          return { count: missing.length, labels: missing };
        }
        if (task.module === "suggestion_boxes") {
          const factory = factoryCatalog.find(
            item => item.id === task.factoryId
          );
          const completed = new Set(taskEntries.map(entry => entry.area));
          const missing = suggestionLocationsForFactory(factory?.code).filter(
            location => !completed.has(location)
          );
          return { count: missing.length, labels: missing };
        }
        if (task.module === "monthly_checklist") {
          const areaNameById = new Map(
            monthlyAreaRows
              .filter(area => area.active !== "false")
              .map(area => [area.id, area.name])
          );
          const itemById = new Map(monthlyItems.map(item => [item.id, item]));
          const expected = monthlyItems
            .filter(
              item =>
                item.active === "true" &&
                (monthlyAssignments.some(
                  assignment => assignment.checklistItemId === item.id
                )
                  ? monthlyAssignments.some(
                      assignment =>
                        assignment.checklistItemId === item.id &&
                        assignment.factoryId === task.factoryId
                    )
                  : true)
            )
            .flatMap(item => {
              const areas = monthlyAreaAssignments
                .filter(assignment => assignment.checklistItemId === item.id)
                .map(assignment =>
                  areaNameById.get(assignment.checklistAreaId)
                )
                .filter((area): area is string => Boolean(area));
              return (areas.length ? areas : [item.area ?? "Geral"]).map(
                area => `${item.id}:${area}`
              );
            });
          const completed = new Set(
            taskEntries
              .map(entry => {
                const itemId = entryPayload(entry).checklistItemId;
                return typeof itemId === "number" && entry.area
                  ? `${itemId}:${entry.area}`
                  : null;
              })
              .filter((key): key is string => Boolean(key))
          );
          const missing = expected.filter(key => !completed.has(key));
          return {
            count: missing.length,
            labels: missing.map(key => {
              const [itemId, area] = key.split(":");
              const item = itemById.get(Number(itemId));
              return `${item?.label ?? "Ponto da checklist"} · ${area}`;
            }),
          };
        }
        if (task.module === "fragile_items") {
          const completed = new Set(
            taskEntries
              .map(entry => entryPayload(entry).fragileItemId)
              .filter((itemId): itemId is number => typeof itemId === "number")
          );
          const missing = scopedFragileCatalog
            .filter(
              item =>
                item.factoryId === task.factoryId &&
                item.status === "active" &&
                isFragileInspectionPending(
                  item.periodicity,
                  lastFragileInspectionsBeforeDay.get(item.id),
                  operationalDate
                ) &&
                !completed.has(item.id)
            )
            .map(item => item.name);
          return { count: missing.length, labels: missing };
        }
        if (task.module === "food_defense") {
          const completedIds = new Set<string>();
          taskEntries.forEach(entry => {
            const payload = entryPayload(entry);
            if (typeof payload.foodDefenseCriterionId === "string")
              completedIds.add(payload.foodDefenseCriterionId);
            if (Array.isArray(payload.criteria))
              payload.criteria.forEach(criterion => {
                if (
                  criterion &&
                  typeof criterion === "object" &&
                  !Array.isArray(criterion) &&
                  typeof (criterion as Record<string, unknown>).id === "string"
                )
                  completedIds.add(
                    (criterion as Record<string, string>).id
                  );
              });
          });
          const count = Math.max(
            0,
            FOOD_DEFENSE_EXPECTED_CRITERIA - completedIds.size
          );
          return {
            count,
            labels: count ? [`${count} ponto(s) da checklist Food Defense`] : [],
          };
        }
        return taskEntries.length
          ? { count: 0, labels: [] }
          : { count: 1, labels: ["Registo mínimo do controlo"] };
      };
      const resolvedPending = businessTasks.filter(task =>
        task.area === "Plano do Dia"
          ? !isPlannedControlCompleted(task)
          : task.status === "pending"
      );
      const resolvedOverdue = resolvedPending.filter(task => task.dueAt < start);
      const visiblePending = hasScheduleForSelectedDate ? resolvedPending : [];
      const visibleOverdue = hasScheduleForSelectedDate ? resolvedOverdue : [];
      const dailyExpectedCount = todayTasks.length;
      const dailyCompletedCount =
        completedTasksToday.length + completedPlannedControls.length;
      const effectiveDailyExpectedCount = dailyExpectedCount;
      const visibleFactories = input?.factoryId
        ? factoryCatalog.filter(factory => factory.id === input.factoryId)
        : factoryCatalog;
      const moduleProgressByFactory = Object.fromEntries(
        qualityModuleValues.map(module => [
          module,
          visibleFactories.map(factory => {
            const factoryControls = plannedControls.filter(
              task => task.module === module && task.factoryId === factory.id
            );
            const isAnnualFoodDefense = module === "food_defense";
            if (!factoryControls.length)
              return {
                factoryId: factory.id,
                expected: 0,
                completed: 0,
                registeredToday: 0,
                percentage: 0,
              };
            const pendingControl = factoryControls.find(
              task => !isPlannedControlCompleted(task)
            );
            const factoryEntriesToday =
              module === "food_defense"
                ? scopedEntries.filter(
                    entry =>
                      entry.module === module &&
                      entry.factoryId === factory.id &&
                      entry.completedAt.getFullYear() ===
                        operationalDate.getFullYear()
                  )
                : completedToday.filter(
                    entry =>
                      entry.module === module && entry.factoryId === factory.id
                  );
            let expected = isAnnualFoodDefense ? 1 : factoryControls.length;
            let completed = isAnnualFoodDefense
              ? 0
              : factoryControls.filter(isPlannedControlCompleted).length;
            if (module === "fragile_items") {
              const applicablePoints = fragileCatalog.filter(
                item =>
                  item.factoryId === factory.id &&
                  item.status === "active" &&
                  isFragileInspectionPending(
                    item.periodicity,
                    lastFragileInspectionsBeforeDay.get(item.id),
                    operationalDate
                  )
              );
              expected = applicablePoints.length;
              const completedPointIds = new Set(
                factoryEntriesToday
                  .map(entry => payloadFor(entry).fragileItemId)
                  .filter((id): id is number => typeof id === "number")
              );
              completed = applicablePoints.filter(item =>
                completedPointIds.has(item.id)
              ).length;
            } else if (module === "bphf") {
              const expectedAreas = expectedBphfAreas(
                { factoryId: factory.id },
                areaCatalog
              );
              const plannedCriteria = new Set(
                factoryControls.flatMap(task =>
                  Array.isArray(task.bphfCriteria)
                    ? task.bphfCriteria
                    : [...BPHF_CRITERIA]
                )
              );
              const expectedCriteria = BPHF_CRITERIA.filter(criterion =>
                plannedCriteria.has(criterion)
              );
              expected = expectedAreas.length * expectedCriteria.length;
              const completedSlots = new Set(
                factoryEntriesToday.map(
                  entry => `${entry.area}::${entry.title}`
                )
              );
              completed = expectedAreas.reduce(
                (total, area) =>
                  total +
                  expectedCriteria.filter(criterion =>
                    completedSlots.has(`${area}::${criterion}`)
                  ).length,
                0
              );
            } else if (module === "suggestion_boxes") {
              const expectedLocations = suggestionLocationsForFactory(
                factory.code
              );
              expected = expectedLocations.length;
              const completedLocations = new Set(
                factoryEntriesToday.map(entry => entry.area)
              );
              completed = expectedLocations.filter(location =>
                completedLocations.has(location)
              ).length;
            } else if (module === "metal_detectors") {
              const expectedLines = expectedMetalDetectorLines(
                {
                  factoryId: factory.id,
                  metalDetectorLines: factoryControls[0]?.metalDetectorLines,
                },
                areaCatalog
              );
              expected = expectedLines.length;
              const completedLines = new Set(
                factoryEntriesToday.map(entry => entry.area)
              );
              completed = expectedLines.filter(line =>
                completedLines.has(line)
              ).length;
            } else if (module === "monthly_checklist") {
              const activeItems = monthlyItems.filter(
                item =>
                  item.active === "true" &&
                  (monthlyAssignments.some(
                    assignment => assignment.checklistItemId === item.id
                  )
                    ? monthlyAssignments.some(
                        assignment =>
                          assignment.checklistItemId === item.id &&
                          assignment.factoryId === factory.id
                      )
                    : true)
              );
              const currentMonthStart = new Date(
                operationalDate.getFullYear(),
                operationalDate.getMonth(),
                1
              );
              const currentMonthEnd = new Date(
                operationalDate.getFullYear(),
                operationalDate.getMonth() + 1,
                1
              );
              const activeAreaNames = new Map(
                monthlyAreaRows
                  .filter(area => area.active !== "false")
                  .map(area => [area.id, area.name])
              );
              const expectedChecks = activeItems.flatMap(item => {
                const areaNames = monthlyAreaAssignments
                  .filter(assignment => assignment.checklistItemId === item.id)
                  .map(assignment => activeAreaNames.get(assignment.checklistAreaId))
                  .filter((area): area is string => Boolean(area));
                return (areaNames.length ? areaNames : [item.area ?? "Geral"]).map(
                  area => `${item.id}:${area}`
                );
              });
              expected = expectedChecks.length;
              const completedChecks = new Set(
                scopedEntries
                  .filter(
                    entry =>
                      entry.module === "monthly_checklist" &&
                      entry.factoryId === factory.id &&
                      entry.completedAt >= currentMonthStart &&
                      entry.completedAt < currentMonthEnd
                  )
                  .map(entry => {
                    const itemId = payloadFor(entry).checklistItemId;
                    return typeof itemId === "number" && entry.area
                      ? `${itemId}:${entry.area}`
                      : null;
                  })
                  .filter((check): check is string => Boolean(check))
              );
              completed = expectedChecks.filter(check =>
                completedChecks.has(check)
              ).length;
            } else if (module === "temperature_controls") {
              const expectedEquipmentIds = Array.from(
                new Set(
                  factoryControls.flatMap(task =>
                    expectedTemperatureEquipmentIds(task)
                  )
                )
              );
              expected = expectedEquipmentIds.length;
              const completedEquipmentIds = new Set(
                factoryEntriesToday
                  .flatMap(entry =>
                    Array.isArray(payloadFor(entry).equipment)
                      ? payloadFor(entry).equipment
                      : []
                  )
                  .map(item =>
                    item && typeof item === "object"
                      ? (item as Record<string, unknown>).id
                      : null
                  )
                  .filter((id): id is string => typeof id === "string")
              );
              completed = expectedEquipmentIds.filter(equipmentId =>
                completedEquipmentIds.has(equipmentId)
              ).length;
            } else if (module === "food_defense") {
              expected = FOOD_DEFENSE_EXPECTED_CRITERIA;
              const completedCriterionIds = new Set<string>();
              factoryEntriesToday.forEach(entry => {
                const payload = payloadFor(entry);
                if (typeof payload.foodDefenseCriterionId === "string")
                  completedCriterionIds.add(payload.foodDefenseCriterionId);
                if (Array.isArray(payload.criteria))
                  payload.criteria.forEach(criterion => {
                    if (
                      criterion &&
                      typeof criterion === "object" &&
                      !Array.isArray(criterion) &&
                      typeof (criterion as Record<string, unknown>).id ===
                        "string"
                    )
                      completedCriterionIds.add(
                        (criterion as Record<string, string>).id
                      );
                  });
              });
              completed = completedCriterionIds.size;
            }
            completed = Math.min(completed, expected);
            return {
              factoryId: factory.id,
              expected,
              completed,
              registeredToday: expected ? completed : 0,
              percentage: expected
                ? Number(((completed / expected) * 100).toFixed(1))
                : 0,
              ...(pendingControl && completed < expected
                ? { pendingTaskId: pendingControl.id }
                : {}),
            };
          }),
        ])
      );
      const moduleProgress = Object.fromEntries(
        qualityModuleValues.map(module => {
          const factoryProgress = moduleProgressByFactory[module] ?? [];
          const moduleControls = plannedControls.filter(
            task => task.module === module
          );
          const isSharedModule = sharedPlanModules.has(module);
          const expected = isSharedModule
            ? moduleControls.length
            : factoryProgress.reduce((sum, item) => sum + item.expected, 0);
          const completed = isSharedModule
            ? moduleControls.filter(isPlannedControlCompleted).length
            : factoryProgress.reduce((sum, item) => sum + item.completed, 0);
          const pendingTaskTitles = moduleControls
            .filter(task => !isPlannedControlCompleted(task))
            .map(task => task.title);
          const completionTimes = completedToday
            .filter(
              entry =>
                entry.module === module &&
                moduleControls.some(
                  task =>
                    task.factoryId === null ||
                    task.factoryId === entry.factoryId
                )
            )
            .map(entry => entry.completedAt);
          const lastCompletedAt = completionTimes.reduce<Date | undefined>(
            (latest, date) => (!latest || date > latest ? date : latest),
            undefined
          );
          return [
            module,
            {
              expected,
              completed,
              registeredToday: expected ? completed : 0,
              pending: Array.from(new Set(pendingTaskTitles)),
              percentage: expected
                ? Number(((completed / expected) * 100).toFixed(1))
                : 0,
              lastCompletedAt,
            },
          ];
        })
      );
      const critical = scopedNcs.filter(
        nc => nc.status !== "closed" && nc.severity === "critical"
      );
      const openActions = scopedActions.filter(
        action => action.status !== "verified"
      );
      const fragilePending = plannedControls.some(
        task => task.module === "fragile_items"
      )
        ? scopedFragileCatalog.filter(
            item =>
              item.status === "active" &&
              isFragileInspectionPending(
                item.periodicity,
                lastFragileInspections.get(item.id),
                now
              )
          )
        : [];

      return {
        tasks: visibleAdHocTasks.slice(0, 20),
        plannedControls: plannedControls.map(task => {
          const completed = isPlannedControlCompleted(task);
          const missing = completed
            ? { count: 0, labels: [] }
            : missingVerificationsForPlannedControl(task);
          return {
            ...task,
            completed,
            missingVerificationCount: missing.count,
            missingVerifications: missing.labels,
          };
        }),
        operationalDate,
        taskGroups: {
          today: visibleAdHocTasks,
          tomorrow: hasScheduleForSelectedDate
            ? adHocTasks.filter(
                task => task.dueAt >= tomorrowStart && task.dueAt < tomorrowEnd
              )
            : [],
          thisWeek: hasScheduleForSelectedDate
            ? adHocTasks.filter(
                task =>
                  task.dueAt >= workingWeekStart &&
                  task.dueAt < workingWeekEnd &&
                  !(task.dueAt >= start && task.dueAt < tomorrowEnd)
              )
            : [],
        },
        criticalNcs: critical.slice(0, 6),
        dueActions: openActions
          .filter(action => action.dueAt && action.dueAt < now)
          .slice(0, 6),
        metrics: {
          pending: visiblePending.length,
          overdue: visibleOverdue.length,
          criticalOpen: critical.length,
          completedToday: completedToday.length,
          fragilePending: fragilePending.length,
          dailyExecutionRate: effectiveDailyExpectedCount
            ? Number(
                (
                  (dailyCompletedCount / effectiveDailyExpectedCount) *
                  100
                ).toFixed(1)
              )
            : 0,
        },
        moduleProgress,
        moduleProgressByFactory,
        monthlyChecklistReminder,
        foodDefenseReminder,
      };
    }),

  controlObservations: qualitySessionProcedure
    .input(
      z.object({ module: qualityModuleSchema, factoryId: z.number().int() })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const operationalDate = nextBusinessDay(new Date());
      const { start, end } = asDateRange(operationalDate);
      const entries = await db
        .select()
        .from(controlEntries)
        .orderBy(desc(controlEntries.completedAt));
      return {
        operationalDate,
        entries: entries
          .filter(
            entry =>
              entry.module === input.module &&
              entry.factoryId === input.factoryId &&
              entry.completedAt >= start &&
              entry.completedAt < end
          )
          .map(entry => ({
            id: entry.id,
            title: entry.title,
            area: entry.area,
            result: entry.result,
            notes: entry.notes,
            payload: entry.payload,
            completedAt: entry.completedAt,
            registeredByName: entry.registeredByName,
            registeredByTitle: entry.registeredByTitle,
          })),
      };
    }),

  dailyControlResults: qualitySessionProcedure
    .input(
      z.object({
        module: qualityModuleSchema,
        operationalDate: z.coerce.date(),
        factoryId: z.number().int().nullable().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const { start, end } = asDateRange(input.operationalDate);
      const entries = await db
        .select()
        .from(controlEntries)
        .orderBy(desc(controlEntries.completedAt));
      const asPayload = (entry: (typeof entries)[number]) =>
        entry.payload &&
        typeof entry.payload === "object" &&
        !Array.isArray(entry.payload)
          ? (entry.payload as Record<string, unknown>)
          : {};
      return {
        operationalDate: input.operationalDate,
        entries: entries
          .filter(entry => {
            const payload = asPayload(entry);
            const lifecycle =
              payload.recordLifecycle &&
              typeof payload.recordLifecycle === "object" &&
              !Array.isArray(payload.recordLifecycle)
                ? (payload.recordLifecycle as Record<string, unknown>)
                : {};
            const plannedDate =
              typeof payload.plannedDate === "string"
                ? new Date(payload.plannedDate)
                : entry.completedAt;
            return (
              entry.module === input.module &&
              (input.factoryId === undefined ||
                entry.factoryId === input.factoryId) &&
              lifecycle.status !== "deleted" &&
              plannedDate >= start &&
              plannedDate < end
            );
          })
          .map(entry => ({
            id: entry.id,
            title: entry.title,
            area: entry.area,
            factoryId: entry.factoryId,
            result: entry.result,
            notes: entry.notes,
            payload: asPayload(entry),
            completedAt: entry.completedAt,
            registeredByProfileId: entry.registeredByProfileId,
            registeredByName: entry.registeredByName,
            registeredByTitle: entry.registeredByTitle,
          })),
      };
    }),

  temperatureHistory: qualitySessionProcedure
    .input(
      z
        .object({
          startDate: dateInput.optional(),
          endDate: dateInput.optional(),
          equipmentId: z.string().trim().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const entries = await db
        .select()
        .from(controlEntries)
        .orderBy(desc(controlEntries.completedAt));
      const start = input?.startDate
        ? asDateRange(input.startDate).start
        : null;
      const end = input?.endDate ? asDateRange(input.endDate).end : null;
      return entries
        .filter(entry => {
          const payload =
            typeof entry.payload === "string"
              ? (() => {
                  try {
                    return JSON.parse(entry.payload) as Record<string, unknown>;
                  } catch {
                    return {};
                  }
                })()
              : entry.payload && typeof entry.payload === "object"
                ? (entry.payload as Record<string, unknown>)
                : {};
          if (entry.module !== "temperature_controls" || payload.deletedAt)
            return false;
          if (start && entry.completedAt < start) return false;
          if (end && entry.completedAt > end) return false;
          return true;
        })
        .flatMap(entry => {
          const payload =
            typeof entry.payload === "string"
              ? (() => {
                  try {
                    return JSON.parse(entry.payload) as Record<string, unknown>;
                  } catch {
                    return {};
                  }
                })()
              : entry.payload && typeof entry.payload === "object"
                ? (entry.payload as Record<string, unknown>)
                : {};
          const equipment = Array.isArray(payload.equipment)
            ? payload.equipment
            : [];
          return equipment.flatMap((item: unknown) => {
            const value =
              item && typeof item === "object"
                ? (item as Record<string, unknown>)
                : {};
            const equipmentId = typeof value.id === "string" ? value.id : "";
            if (
              !equipmentId ||
              (input?.equipmentId && equipmentId !== input.equipmentId)
            )
              return [];
            return [
              {
                entryId: entry.id,
                equipmentId,
                name:
                  typeof value.name === "string" ? value.name : "Equipamento",
                area: typeof value.area === "string" ? value.area : entry.area,
                limit: typeof value.limit === "number" ? value.limit : null,
                temperature:
                  typeof value.temperature === "number"
                    ? value.temperature
                    : null,
                result:
                  typeof value.result === "string"
                    ? value.result
                    : entry.result,
                notes: typeof value.notes === "string" ? value.notes : null,
                completedAt: entry.completedAt,
                factoryId: entry.factoryId,
                registeredByName: entry.registeredByName,
                registeredByTitle: entry.registeredByTitle,
              },
            ];
          });
        });
    }),

  listTasks: qualitySessionProcedure
    .input(
      z
        .object({
          factoryId: z.number().int().optional(),
          viewerProfileId: z.number().int().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [
        tasks,
        entries,
        areaCatalog,
        monthlyItems,
        monthlyAssignments,
        monthlyAreaAssignments,
        monthlyAreaRows,
        factoryCatalog,
        fragileCatalog,
      ] = await Promise.all([
        db.select().from(controlTasks).orderBy(controlTasks.dueAt),
        db
          .select()
          .from(controlEntries)
          .orderBy(desc(controlEntries.completedAt)),
        db.select().from(areas).orderBy(areas.name),
        db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
        db
          .select()
          .from(checklistItemFactories)
          .orderBy(checklistItemFactories.factoryId),
        db.select().from(checklistItemAreas),
        db.select().from(checklistAreas),
        db.select().from(factories).orderBy(factories.name),
        db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
      ]);
      const profile = ctx.operatorProfile!;
      return scopeToFactory(tasks, input?.factoryId)
        .filter(task => {
          const assignees = Array.isArray(task.assigneeProfileIds)
            ? task.assigneeProfileIds
            : [];
          const completedFromPreviousRegistration =
            task.area === "Plano do Dia" &&
            isPlanTaskResolved(
              task,
              entries,
              areaCatalog,
              monthlyItems,
              monthlyAssignments,
              factoryCatalog,
              monthlyAreaAssignments,
              monthlyAreaRows,
              fragileCatalog
            );
          return (
            isBusinessDay(task.dueAt) &&
            task.status !== "cancelled" &&
            !(task.status === "pending" && completedFromPreviousRegistration) &&
            (profile.role === "manager" || assignees.includes(profile.id))
          );
        })
        .map(task => {
          const completedFromRegisteredControls =
            task.area === "Plano do Dia" &&
            isPlanTaskResolved(
              task,
              entries,
              areaCatalog,
              monthlyItems,
              monthlyAssignments,
              factoryCatalog,
              monthlyAreaAssignments,
              monthlyAreaRows,
              fragileCatalog
            );
          const reconciledTask =
            task.area === "Plano do Dia"
              ? {
                  ...task,
                  status: completedFromRegisteredControls
                    ? ("completed" as const)
                    : ("pending" as const),
                }
              : task;
          const report = entries.find(
            entry => entry.payload?.taskId === task.id
          );
          const storedPhotos =
            report?.payload &&
            typeof report.payload.executionReport === "object" &&
            report.payload.executionReport &&
            !Array.isArray(report.payload.executionReport)
              ? (report.payload.executionReport as { evidencePhotos?: unknown })
                  .evidencePhotos
              : [];
          const evidencePhotos = Array.isArray(storedPhotos)
            ? storedPhotos.filter(
                (
                  photo
                ): photo is {
                  url: string;
                  fileName: string;
                  mimeType: string;
                } =>
                  Boolean(
                    photo &&
                      typeof photo === "object" &&
                      typeof (photo as { url?: unknown }).url === "string" &&
                      typeof (photo as { fileName?: unknown }).fileName ===
                        "string" &&
                      typeof (photo as { mimeType?: unknown }).mimeType ===
                        "string"
                  )
              )
            : [];
          const qualityModule =
            task.area === "Plano do Dia" ? task.module : null;
          return report
            ? {
                ...reconciledTask,
                qualityModule,
                executionReport: {
                  result: report.result,
                  notes: report.notes,
                  completedAt: report.completedAt,
                  registeredByName: report.registeredByName,
                  registeredByTitle: report.registeredByTitle,
                  evidencePhotos,
                },
              }
            : { ...reconciledTask, qualityModule, executionReport: null };
        });
    }),

  createTask: qualityManagerProcedure
    .input(
      z.object({
        title: z.string().min(2).max(180),
        description: z.string().max(3000).optional(),
        factoryId: z.number().int().optional(),
        dueAt: dateInput,
        assigneeProfileIds: z.array(z.number().int()).min(1).max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isBusinessDay(input.dueAt))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "As tarefas de controlo só podem ser agendadas em dias úteis, de segunda a sexta-feira.",
        });
      const db = await requireDb();
      const selectedProfiles = await db
        .select()
        .from(qualityPinProfiles)
        .where(inArray(qualityPinProfiles.id, input.assigneeProfileIds))
        .orderBy(qualityPinProfiles.id);
      const profiles = selectedProfiles.filter(profile =>
        input.assigneeProfileIds.includes(profile.id)
      );
      if (
        profiles.length !== input.assigneeProfileIds.length ||
        profiles.some(profile => profile.active !== "true")
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione utilizadores ativos para a tarefa.",
        });
      await db
        .insert(controlTasks)
        .values({
          title: input.title,
          description: input.description?.trim() || null,
          module: "bphf",
          area: "Sem área",
          factoryId: input.factoryId ?? null,
          dueAt: input.dueAt,
          responsible: profiles.map(profile => profile.name).join(", "),
          assigneeProfileIds: input.assigneeProfileIds,
          createdBy: ctx.user!.openId,
        });
      return { success: true };
    }),

  createIncidenceFollowUpTask: qualityManagerProcedure
    .input(
      z.object({
        sourceEntryId: z.number().int(),
        title: z.string().trim().min(3).max(180),
        description: z.string().trim().min(3).max(3000),
        dueAt: dateInput,
        assigneeProfileIds: z.array(z.number().int()).min(1).max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isBusinessDay(input.dueAt))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A tarefa de seguimento deve ser agendada num dia útil, de segunda a sexta-feira.",
        });
      const db = await requireDb();
      const sourceEntry = (
        await db
          .select()
          .from(controlEntries)
          .where(eq(controlEntries.id, input.sourceEntryId))
          .limit(1)
      )[0];
      const sourcePayload =
        sourceEntry?.payload &&
        typeof sourceEntry.payload === "object" &&
        !Array.isArray(sourceEntry.payload)
          ? (sourceEntry.payload as Record<string, unknown>)
          : {};
      const lifecycle =
        sourcePayload.recordLifecycle &&
        typeof sourcePayload.recordLifecycle === "object" &&
        !Array.isArray(sourcePayload.recordLifecycle)
          ? (sourcePayload.recordLifecycle as Record<string, unknown>)
          : {};
      if (!sourceEntry || sourceEntry.result !== "NC" || lifecycle.status === "deleted")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A tarefa de seguimento só pode ser criada a partir de uma incidência ativa de uma verificação não conforme.",
        });
      const selectedProfiles = await db
        .select()
        .from(qualityPinProfiles)
        .where(inArray(qualityPinProfiles.id, input.assigneeProfileIds))
        .orderBy(qualityPinProfiles.id);
      const profiles = selectedProfiles.filter(profile =>
        input.assigneeProfileIds.includes(profile.id)
      );
      if (
        profiles.length !== input.assigneeProfileIds.length ||
        profiles.some(profile => profile.active !== "true")
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione utilizadores ativos para a tarefa de seguimento.",
        });
      await db.insert(controlTasks).values({
        title: input.title,
        description: input.description,
        module: sourceEntry.module,
        area: sourceEntry.area,
        factoryId: sourceEntry.factoryId,
        dueAt: input.dueAt,
        responsible: profiles.map(profile => profile.name).join(", "),
        assigneeProfileIds: input.assigneeProfileIds,
        sourceEntryId: sourceEntry.id,
        createdBy: ctx.user!.openId,
      });
      return { success: true };
    }),

  listIncidenceFollowUpTasks: qualitySessionProcedure
    .input(z.object({ sourceEntryId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const profile = ctx.operatorProfile!;
      const [tasks, entries] = await Promise.all([
        db
          .select()
          .from(controlTasks)
          .where(eq(controlTasks.sourceEntryId, input.sourceEntryId))
          .orderBy(controlTasks.dueAt),
        db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      ]);
      return tasks.filter(task => {
        const assignees = Array.isArray(task.assigneeProfileIds)
          ? task.assigneeProfileIds
          : [];
        return profile.role === "manager" || assignees.includes(profile.id);
      }).map(task => {
        const report = entries.find(entry => entry.payload?.taskId === task.id);
        return report
          ? {
              ...task,
              executionReport: {
                result: report.result,
                notes: report.notes,
                completedAt: report.completedAt,
                registeredByName: report.registeredByName,
                registeredByTitle: report.registeredByTitle,
              },
            }
          : { ...task, executionReport: null };
      });
    }),

  publishDailyPlan: qualityManagerProcedure
    .input(
      z
        .object({
          date: dateInput.optional(),
          dates: z.array(dateInput).min(1).max(31).optional(),
          factoryIds: z.array(z.number().int()).min(1).max(10),
          assigneeProfileIds: z.array(z.number().int()).min(1).max(10),
          modules: z.array(qualityModuleSchema).min(1).max(8),
          bphfCriteria: z.array(z.enum(BPHF_CRITERIA)).min(1).max(BPHF_CRITERIA.length).optional(),
          metalDetectorLinesByFactory: z.record(z.string(), z.array(z.string()).min(1).max(25)).optional(),
          priority: z.enum(["normal", "critical"]).default("normal"),
        })
        .refine(input => Boolean(input.date || input.dates?.length), {
          message: "Selecione pelo menos uma data para o Plano do Dia.",
        })
    )
    .mutation(async ({ ctx, input }) => {
      const selectedDates = Array.from(
        new Map(
          (input.dates?.length
            ? input.dates
            : input.date
              ? [input.date]
              : []
          ).map(date => [localDateKey(date), date])
        ).values()
      );
      if (selectedDates.some(date => !isBusinessDay(date)))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Todos os Planos do Dia têm de ser publicados para dias úteis.",
        });
      const db = await requireDb();
      const profiles = await db
        .select()
        .from(qualityPinProfiles)
        .where(inArray(qualityPinProfiles.id, input.assigneeProfileIds))
        .orderBy(qualityPinProfiles.id);
      if (
        profiles.length !== input.assigneeProfileIds.length ||
        profiles.some(profile => profile.active !== "true")
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione responsáveis ativos para o Plano do Dia.",
        });
      const [existing, areaCatalog, monthlyItems, monthlyAssignments, factoryCatalog, monthlyAreaAssignments, monthlyAreaRows, fragileCatalog, existingEntries] =
        await Promise.all([
          db.select().from(controlTasks),
          db.select().from(areas).orderBy(areas.name),
          db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
          db
            .select()
            .from(checklistItemFactories)
            .orderBy(checklistItemFactories.factoryId),
          db.select().from(factories).orderBy(factories.name),
          db.select().from(checklistItemAreas),
          db.select().from(checklistAreas),
          db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
          db
            .select()
            .from(controlEntries)
            .orderBy(desc(controlEntries.completedAt)),
        ]);
      const selectedFactories = Array.from(new Set(input.factoryIds));
      const plannedBphfCriteria = input.modules.includes("bphf")
        ? Array.from(new Set(input.bphfCriteria ?? BPHF_CRITERIA))
        : null;
      const temperatureFactories = selectedFactories.filter(factoryId =>
        [1, 2].includes(factoryId)
      );
      const plannedMetalDetectorLinesByFactory = input.modules.includes("metal_detectors")
        ? Object.fromEntries(selectedFactories.map(factoryId => {
            const configuredLines = areaCatalog
              .filter(area => area.group === "metal" && area.factoryId === factoryId && area.active === "true")
              .map(area => area.name);
            const requestedLines = Array.from(new Set(input.metalDetectorLinesByFactory?.[String(factoryId)] ?? configuredLines));
            if (requestedLines.some(line => !configuredLines.includes(line)))
              throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione apenas linhas de Detetores configuradas para cada fábrica." });
            if (configuredLines.length && !requestedLines.length)
              throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione pelo menos uma linha de Detetores para cada fábrica incluída." });
            return [factoryId, requestedLines];
          }))
        : null;
      if (
        input.modules.includes("temperature_controls") &&
        !temperatureFactories.length
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Selecione a Fábrica 1 ou a Fábrica 2 para publicar os Controlos de Temperatura.",
        });
      const plannedControls: {
        module: (typeof qualityModuleValues)[number];
        factoryId: number | null;
      }[] = [];
      for (const module of Array.from(new Set(input.modules))) {
        if (sharedPlanModules.has(module))
          plannedControls.push({ module, factoryId: null });
        else
          (module === "monthly_checklist"
            ? [1, 2, 3]
            : module === "temperature_controls"
            ? temperatureFactories
            : selectedFactories
          ).forEach(factoryId => plannedControls.push({ module, factoryId }));
      }
      const plannedDateKeys = new Set(selectedDates.map(localDateKey));
      const existingPlans = existing.filter(
        task =>
          task.area === "Plano do Dia" &&
          task.status !== "cancelled" &&
          plannedDateKeys.has(localDateKey(new Date(task.dueAt)))
      );
      const controlsByDate = selectedDates.map(date => {
        const controls = plannedControls.filter(
          ({ module, factoryId }) =>
            !existingPlans.some(
              task =>
                localDateKey(new Date(task.dueAt)) === localDateKey(date) &&
                task.module === module &&
                task.factoryId === factoryId
            )
        );
        return { date, controls };
      });
      const controlsToCreate = controlsByDate.flatMap(({ date, controls }) =>
        controls.map(({ module, factoryId }) => ({
          title: `Plano do Dia — ${module.replace(/_/g, " ")}`,
          description:
            input.priority === "critical"
              ? "Controlo prioritário publicado pela Responsável de Qualidade."
              : "Controlo publicado no Plano do Dia.",
          module,
          area: "Plano do Dia",
          factoryId,
          dueAt: date,
          responsible: profiles.map(profile => profile.name).join(", "),
          assigneeProfileIds: input.assigneeProfileIds,
            bphfCriteria: module === "bphf" ? plannedBphfCriteria : null,
            metalDetectorLines:
              module === "metal_detectors"
                ? plannedMetalDetectorLinesByFactory?.[factoryId ?? -1] ?? null
                : null,
            temperatureEquipmentIds:
              module === "temperature_controls" && factoryId
                ? [...(TEMPERATURE_EQUIPMENT_IDS_BY_FACTORY[factoryId] ?? [])]
                : null,
            plannedCoverage: buildPlannedCoverage(
              {
                module,
                factoryId,
                dueAt: date,
                bphfCriteria: module === "bphf" ? plannedBphfCriteria : null,
                metalDetectorLines:
                  module === "metal_detectors"
                    ? plannedMetalDetectorLinesByFactory?.[factoryId ?? -1] ?? null
                    : null,
                temperatureEquipmentIds:
                  module === "temperature_controls" && factoryId
                    ? [...(TEMPERATURE_EQUIPMENT_IDS_BY_FACTORY[factoryId] ?? [])]
                    : null,
              },
              existingEntries,
              areaCatalog,
              monthlyItems,
              monthlyAssignments,
              factoryCatalog,
              monthlyAreaAssignments,
              monthlyAreaRows,
              fragileCatalog
            ),
            createdBy: ctx.user!.openId,
        }))
      );
      const bphfAddendaToCreate = input.modules.includes("bphf") && plannedBphfCriteria
        ? selectedDates.flatMap(date => selectedFactories.flatMap(factoryId => {
            const sameScopePlans = existingPlans.filter(task =>
              task.module === "bphf" &&
              task.factoryId === factoryId &&
              localDateKey(new Date(task.dueAt)) === localDateKey(date)
            );
            const originalPlan = sameScopePlans.find(task => !task.parentTaskId);
            if (!originalPlan) return [];
            const relatedPlans = sameScopePlans.filter(task => task.id === originalPlan.id || task.parentTaskId === originalPlan.id);
            const alreadyPlanned = new Set(relatedPlans.flatMap(task => Array.isArray(task.bphfCriteria) ? task.bphfCriteria : []));
            const additionalCriteria = plannedBphfCriteria.filter(criterion => !alreadyPlanned.has(criterion));
            if (!additionalCriteria.length) return [];
            const planRevision = Math.max(...relatedPlans.map(task => task.planRevision ?? 1)) + 1;
            return [{
              title: "Adenda ao Plano do Dia — bphf",
              description: `Adenda automática ao plano BPHF original #${originalPlan.id}, acrescentando ${additionalCriteria.join(", ")}.`,
              module: "bphf" as const,
              area: "Plano do Dia",
              factoryId,
              dueAt: date,
              responsible: profiles.map(profile => profile.name).join(", "),
              assigneeProfileIds: input.assigneeProfileIds,
              bphfCriteria: additionalCriteria,
              bphfCriteriaPeriodicities: null,
              metalDetectorLines: null,
              temperatureEquipmentIds: null,
              plannedCoverage: buildPlannedCoverage({ module: "bphf", factoryId, dueAt: date, bphfCriteria: additionalCriteria }, existingEntries, areaCatalog, monthlyItems, monthlyAssignments, factoryCatalog, monthlyAreaAssignments, monthlyAreaRows, fragileCatalog),
              status: "pending" as const,
              completedAt: null,
              completedByProfileId: null,
              completedByName: null,
              completedByTitle: null,
              sourceEntryId: null,
              parentTaskId: originalPlan.id,
              planRevision,
              createdBy: ctx.user!.openId,
            }];
          }))
        : [];
      const allControlsToCreate = [...controlsToCreate, ...bphfAddendaToCreate];
      if (allControlsToCreate.length)
        await db.insert(controlTasks).values(allControlsToCreate);
      const dateSummary = controlsByDate.map(({ date, controls }) => ({
        date: localDateKey(date),
        created: controls.length,
        alreadyPresent: plannedControls.length - controls.length,
      }));
      return {
        success: true,
        created: allControlsToCreate.length,
        addendaCreated: bphfAddendaToCreate.length,
        alreadyPresent: dateSummary.reduce(
          (total, item) => total + item.alreadyPresent,
          0
        ),
        dates: dateSummary,
      };
    }),

  addBphfPlanAddendum: qualityManagerProcedure
    .input(z.object({
      parentTaskId: z.number().int(),
      bphfCriteria: z.array(z.enum(BPHF_CRITERIA)).min(1).max(BPHF_CRITERIA.length),
      assigneeProfileIds: z.array(z.number().int()).min(1).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const parent = (await db.select().from(controlTasks).where(eq(controlTasks.id, input.parentTaskId)).limit(1))[0];
      if (!parent || parent.area !== "Plano do Dia" || parent.module !== "bphf")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um plano BPHF válido para criar a adenda." });
      if (parent.status === "cancelled")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível criar uma adenda a um plano cancelado." });
      const selectedCriteria = Array.from(new Set(input.bphfCriteria));
      const relatedTasks = await db.select().from(controlTasks).where(eq(controlTasks.parentTaskId, parent.id));
      const alreadyPlanned = new Set<string>([
        ...(Array.isArray(parent.bphfCriteria) ? parent.bphfCriteria : []),
        ...relatedTasks.flatMap(task => Array.isArray(task.bphfCriteria) ? task.bphfCriteria : []),
      ]);
      const additionalCriteria = selectedCriteria.filter(criterion => !alreadyPlanned.has(criterion));
      if (!additionalCriteria.length)
        throw new TRPCError({ code: "CONFLICT", message: "As verificações selecionadas já fazem parte deste plano ou de uma adenda anterior." });
      const assigneeProfileIds = input.assigneeProfileIds ?? parent.assigneeProfileIds ?? [];
      if (!assigneeProfileIds.length)
        throw new TRPCError({ code: "BAD_REQUEST", message: "O plano original não tem responsáveis ativos atribuídos." });
      const profiles = await db.select().from(qualityPinProfiles).where(inArray(qualityPinProfiles.id, assigneeProfileIds)).orderBy(qualityPinProfiles.id);
      if (profiles.length !== assigneeProfileIds.length || profiles.some(profile => profile.active !== "true"))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione responsáveis ativos para a adenda." });
      const [areaCatalog, monthlyItems, monthlyAssignments, factoryCatalog, monthlyAreaAssignments, monthlyAreaRows, fragileCatalog, existingEntries] = await Promise.all([
        db.select().from(areas).orderBy(areas.name),
        db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
        db.select().from(checklistItemFactories).orderBy(checklistItemFactories.factoryId),
        db.select().from(factories).orderBy(factories.name),
        db.select().from(checklistItemAreas),
        db.select().from(checklistAreas),
        db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
        db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      ]);
      const planRevision = Math.max(parent.planRevision ?? 1, ...relatedTasks.map(task => task.planRevision ?? 1)) + 1;
      const addendum = {
        title: "Adenda ao Plano do Dia — bphf",
        description: `Adenda ao plano BPHF original #${parent.id}, acrescentando ${additionalCriteria.join(", ")}.`,
        module: "bphf" as const,
        area: "Plano do Dia",
        factoryId: parent.factoryId,
        dueAt: parent.dueAt,
        responsible: profiles.map(profile => profile.name).join(", "),
        assigneeProfileIds,
        bphfCriteria: additionalCriteria,
        bphfCriteriaPeriodicities: null,
        metalDetectorLines: null,
        temperatureEquipmentIds: null,
        plannedCoverage: buildPlannedCoverage({ module: "bphf", factoryId: parent.factoryId, dueAt: parent.dueAt, bphfCriteria: additionalCriteria }, existingEntries, areaCatalog, monthlyItems, monthlyAssignments, factoryCatalog, monthlyAreaAssignments, monthlyAreaRows, fragileCatalog),
        status: "pending" as const,
        completedAt: null,
        completedByProfileId: null,
        completedByName: null,
        completedByTitle: null,
        sourceEntryId: null,
        parentTaskId: parent.id,
        planRevision,
        createdBy: ctx.user!.openId,
      };
      const inserted = await db.insert(controlTasks).values(addendum);
      return { success: true, id: Number(inserted[0].insertId), parentTaskId: parent.id, planRevision, bphfCriteria: additionalCriteria };
    }),

  updateTask: qualityManagerProcedure
    .input(
      z.object({
        id: z.number().int(),
        title: z.string().min(2).max(180),
        description: z.string().max(3000).optional(),
        factoryId: z.number().int().optional(),
        dueAt: dateInput,
        assigneeProfileIds: z.array(z.number().int()).min(1).max(10),
      })
    )
    .mutation(async ({ input }) => {
      if (!isBusinessDay(input.dueAt))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "As tarefas de controlo só podem ser agendadas em dias úteis, de segunda a sexta-feira.",
        });
      const db = await requireDb();
      const task = (
        await db
          .select()
          .from(controlTasks)
          .where(eq(controlTasks.id, input.id))
          .limit(1)
      )[0];
      if (!task)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tarefa não encontrada.",
        });
      if (task.status !== "pending")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Só é possível editar tarefas ainda pendentes.",
        });
      const selectedProfiles = await db
        .select()
        .from(qualityPinProfiles)
        .where(inArray(qualityPinProfiles.id, input.assigneeProfileIds))
        .orderBy(qualityPinProfiles.id);
      const profiles = selectedProfiles.filter(profile =>
        input.assigneeProfileIds.includes(profile.id)
      );
      if (
        profiles.length !== input.assigneeProfileIds.length ||
        profiles.some(profile => profile.active !== "true")
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione utilizadores ativos para a tarefa.",
        });
      await db
        .update(controlTasks)
        .set({
          title: input.title.trim(),
          description: input.description?.trim() || null,
          factoryId: input.factoryId ?? null,
          dueAt: input.dueAt,
          responsible: profiles.map(profile => profile.name).join(", "),
          assigneeProfileIds: input.assigneeProfileIds,
        })
        .where(eq(controlTasks.id, input.id));
      return { success: true };
    }),

  deleteTask: qualityManagerProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const task = (
        await db
          .select()
          .from(controlTasks)
          .where(eq(controlTasks.id, input.id))
          .limit(1)
      )[0];
      if (!task)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tarefa não encontrada.",
        });
      if (task.status !== "pending")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Só é possível eliminar tarefas ainda pendentes.",
        });
      await db
        .update(controlTasks)
        .set({ status: "cancelled" })
        .where(eq(controlTasks.id, input.id));
      return { success: true };
    }),

  uploadTaskReportPhoto: qualityOperatorProcedure
    .input(
      z.object({
        taskId: z.number().int(),
        fileName: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        dataUrl: z.string().min(20).max(7_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const task = (
        await db
          .select()
          .from(controlTasks)
          .where(eq(controlTasks.id, input.taskId))
          .limit(1)
      )[0];
      if (!task || task.status !== "pending")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tarefa pendente não encontrada.",
        });
      const assignees = Array.isArray(task.assigneeProfileIds)
        ? task.assigneeProfileIds
        : [];
      if (
        ctx.operatorProfile!.role !== "manager" &&
        (!assignees.length || !assignees.includes(ctx.operatorProfile!.id))
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Esta tarefa está atribuída a outro utilizador.",
        });
      const base64 = input.dataUrl.split(",")[1];
      if (!base64)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Imagem inválida.",
        });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { key, url } = await storagePut(
        `task-reports/${input.taskId}/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`,
        Buffer.from(base64, "base64"),
        input.mimeType
      );
      return { key, url, fileName: input.fileName, mimeType: input.mimeType };
    }),

  uploadInternalAnalysisPhoto: qualityOperatorProcedure
    .input(
      z.object({
        fileName: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        dataUrl: z.string().min(20).max(7_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireControlAuthorization(db, {
        module: "internal_analysis",
        factoryId: null,
        profile: ctx.operatorProfile!,
      });
      const base64 = input.dataUrl.split(",")[1];
      if (!base64)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Imagem inválida.",
        });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { key, url } = await storagePut(
        `internal-analysis/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`,
        Buffer.from(base64, "base64"),
        input.mimeType
      );
      return { key, url, fileName: input.fileName, mimeType: input.mimeType };
    }),

  completeTask: qualityOperatorProcedure
    .input(
      z.object({
        id: z.number().int(),
        result: resultSchema,
        notes: z.string().trim().min(3).max(3000),
        evidencePhotos: z
          .array(
            z.object({
              url: z.string().startsWith("/manus-storage/task-reports/"),
              fileName: z.string().min(1).max(255),
              mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
            })
          )
          .max(5)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const task = (
        await db
          .select()
          .from(controlTasks)
          .where(eq(controlTasks.id, input.id))
          .limit(1)
      )[0];
      const assignees = Array.isArray(task?.assigneeProfileIds)
        ? task.assigneeProfileIds
        : [];
      if (
        task &&
        ctx.operatorProfile!.role !== "manager" &&
        (!assignees.length || !assignees.includes(ctx.operatorProfile!.id))
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Esta tarefa está atribuída a outro utilizador.",
        });
      if (!task)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tarefa não encontrada.",
        });
      if (task.status !== "pending")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esta tarefa já não está pendente.",
        });
      const completedAt = new Date();
      await db
        .update(controlTasks)
        .set({
          status: "completed",
          completedAt,
          completedByProfileId: ctx.operatorProfile!.id,
          completedByName: ctx.operatorProfile!.name,
          completedByTitle: ctx.operatorProfile!.title,
        })
        .where(eq(controlTasks.id, input.id));
      await db.insert(controlEntries).values({
        module: task.module,
        title: task.title,
        area: task.area,
        factoryId: task.factoryId,
        result: input.result,
        notes: input.notes,
        payload: {
          taskId: task.id,
          executionReport: { evidencePhotos: input.evidencePhotos ?? [] },
        },
        completedAt,
        registeredByProfileId: ctx.operatorProfile!.id,
        registeredByName: ctx.operatorProfile!.name,
        registeredByTitle: ctx.operatorProfile!.title,
        createdBy: ctx.user!.openId,
      });
      const isFollowUpTask = Boolean(task.sourceEntryId);
      let incidenceReviewRequired = false;
      if (task.sourceEntryId) {
        const sourceEntry = (
          await db
            .select()
            .from(controlEntries)
            .where(eq(controlEntries.id, task.sourceEntryId))
            .limit(1)
        )[0];
        if (sourceEntry && sourceEntry.result === "NC" && !isDeletedControlEntry(sourceEntry)) {
          const sourcePayload = entryPayload(sourceEntry);
          const completedFollowUps = followUpReviewAlertsFromPayload(sourcePayload)
            .filter(alert => alert.followUpTaskId !== task.id);
          sourcePayload.followUpReviewAlerts = [
            ...completedFollowUps,
            {
              followUpTaskId: task.id,
              title: task.title,
              result: input.result,
              notes: input.notes,
              completedAt: completedAt.toISOString(),
              registeredByProfileId: ctx.operatorProfile!.id,
              registeredByName: ctx.operatorProfile!.name,
              registeredByTitle: ctx.operatorProfile!.title,
            },
          ];
          await db
            .update(controlEntries)
            .set({ payload: sourcePayload })
            .where(eq(controlEntries.id, sourceEntry.id));
          const sourcePlannedTaskId = Number(sourcePayload.plannedTaskId);
          await reconcilePlannedControlTaskStatus(
            db,
            Number.isInteger(sourcePlannedTaskId) && sourcePlannedTaskId > 0
              ? sourcePlannedTaskId
              : null
          );
          incidenceReviewRequired = true;
        }
      }
      // A conclusão do seguimento gera apenas o alerta interno na incidência.
      // Não enviar e-mails/notificações externas: a revisão é feita no painel.
      const managerAlerted = false;
      return {
        success: true,
        critical: shouldCreateCriticalMetalAlert(task.module, input.result),
        incidence: input.result === "NC",
        followUpCompleted: isFollowUpTask,
        incidenceReviewRequired,
        managerAlerted,
      };
    }),

  updateControlEntry: qualityOperatorProcedure
    .input(
      z.object({
        id: z.number().int(),
        title: z.string().trim().min(2).max(180),
        area: z.string().trim().min(1).max(120),
        factoryId: z.number().int().nullable().optional(),
        result: resultSchema,
        notes: z.string().trim().max(3000).optional(),
        productName: z.string().trim().max(180).optional(),
        lot: z.string().trim().max(120).optional(),
        validity: z.string().trim().max(40).optional(),
        collaboratorId: z.number().int().positive().nullable().optional(),
        fragileState: z.enum(["Íntegro", "Danificado", "Em falta"]).optional(),
        fragileContainmentAction: z.string().trim().max(3000).optional(),
        fragilePeriodicity: z.enum(["D", "S", "Q", "M"]).optional(),
        fragileReferenceImageUrl: z.string().max(1024).nullable().optional(),
        fragileEvidencePhotos: z
          .array(
            z.object({
              key: z.string().min(1),
              url: z.string().startsWith("/manus-storage/"),
              fileName: z.string().min(1).max(255),
              mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
            })
          )
          .max(8)
          .optional(),
        dispatchProductChecks: z.array(dispatchProductCheckSchema).min(1).max(30).optional(),
        dispatchVehicleTemperature: z.number().min(-100).max(100).optional(),
        dispatchVehicleObservations: z.string().trim().max(3000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const entry = (
        await db
          .select()
          .from(controlEntries)
          .where(eq(controlEntries.id, input.id))
          .limit(1)
      )[0];
      if (!entry)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registo de controlo não encontrado.",
        });
      const isManager = ctx.operatorProfile!.role === "manager";
      const isAuthor =
        entry.registeredByProfileId === ctx.operatorProfile!.id ||
        (!entry.registeredByProfileId &&
          entry.registeredByName === ctx.operatorProfile!.name);
      if (!isManager && !isAuthor)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Apenas o técnico que registou este controlo ou a Responsável de Qualidade o pode editar.",
        });
      const payload =
        entry.payload &&
        typeof entry.payload === "object" &&
        !Array.isArray(entry.payload)
          ? ({ ...entry.payload } as Record<string, unknown>)
          : {};
      const history = Array.isArray(payload.editHistory)
        ? payload.editHistory
        : [];
      const editedAt = new Date().toISOString();
      const nextPayload = { ...payload };
      const previousCollaboratorId = Number(payload.collaboratorId);
      const previousCollaboratorName =
        typeof payload.collaboratorName === "string"
          ? payload.collaboratorName
          : null;
      let nextCollaboratorId =
        Number.isInteger(previousCollaboratorId) && previousCollaboratorId > 0
          ? previousCollaboratorId
          : null;
      let nextCollaboratorName = previousCollaboratorName;
      const previousFragileState =
        typeof payload.state === "string" ? payload.state : null;
      const previousFragileContainmentAction =
        typeof payload.containmentAction === "string"
          ? payload.containmentAction
          : null;
      const previousFragilePeriodicity =
        typeof payload.periodicity === "string" ? payload.periodicity : null;
      const previousFragileReferenceImageUrl =
        typeof payload.referenceImageUrl === "string"
          ? payload.referenceImageUrl
          : null;
      const previousFragileEvidencePhotos = Array.isArray(
        payload.evidencePhotos
      )
        ? payload.evidencePhotos
        : [];
      let nextFragileState = previousFragileState;
      let nextFragileContainmentAction = previousFragileContainmentAction;
      let nextFragilePeriodicity = previousFragilePeriodicity;
      let nextFragileReferenceImageUrl = previousFragileReferenceImageUrl;
      let nextFragileEvidencePhotos = previousFragileEvidencePhotos;
      let recalculatedFragileResult: "C" | "NC" | undefined;
      const fragileFieldsWereSent = [
        input.fragileState,
        input.fragileContainmentAction,
        input.fragilePeriodicity,
        input.fragileReferenceImageUrl,
        input.fragileEvidencePhotos,
      ].some(value => value !== undefined);
      if (
        fragileFieldsWereSent &&
        entry.module !== "fragile_items"
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Os dados específicos de Quebráveis só podem ser editados nesse controlo.",
        });
      if (entry.module === "fragile_items") {
        const stateFromInput = input.fragileState;
        const resultState = fragileStateFromResult(input.result);
        const effectiveFragileState =
          resultState ??
          stateFromInput ??
          (previousFragileState === "Íntegro" ||
          previousFragileState === "Danificado" ||
          previousFragileState === "Em falta"
            ? previousFragileState
            : null) ??
          fragileStateFromResult(entry.result, "Íntegro")!;
        const resultDeterminesState = input.result === "C" || input.result === "NC";
        nextFragileState = effectiveFragileState;
        nextPayload.state = effectiveFragileState;
        if (input.fragileContainmentAction !== undefined) {
          nextFragileContainmentAction =
            input.fragileContainmentAction.trim() || null;
        }
        if (effectiveFragileState === "Íntegro") {
          nextFragileContainmentAction = null;
          nextFragileEvidencePhotos = [];
          delete nextPayload.containmentAction;
          nextPayload.evidencePhotos = [];
        } else if (nextFragileContainmentAction) {
          nextPayload.containmentAction = nextFragileContainmentAction;
        } else if (fragileFieldsWereSent || resultDeterminesState) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A ação de contenção é obrigatória quando o quebrável está danificado ou em falta.",
          });
        }
        if (input.fragilePeriodicity !== undefined) {
          nextFragilePeriodicity = input.fragilePeriodicity;
          nextPayload.periodicity = input.fragilePeriodicity;
        }
        if (input.fragileReferenceImageUrl !== undefined) {
          nextFragileReferenceImageUrl = input.fragileReferenceImageUrl;
          if (input.fragileReferenceImageUrl)
            nextPayload.referenceImageUrl = input.fragileReferenceImageUrl;
          else delete nextPayload.referenceImageUrl;
        }
        if (input.fragileEvidencePhotos !== undefined) {
          nextFragileEvidencePhotos =
            effectiveFragileState === "Íntegro"
              ? []
              : input.fragileEvidencePhotos;
          nextPayload.evidencePhotos = nextFragileEvidencePhotos;
        }
        if (resultDeterminesState || stateFromInput !== undefined)
          recalculatedFragileResult =
            effectiveFragileState === "Íntegro" ? "C" : "NC";
      }
      if (input.collaboratorId !== undefined) {
        if (entry.module !== "bphf")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "O colaborador inspecionado só pode ser editado em registos BPHF.",
          });
        if (input.collaboratorId === null) {
          delete nextPayload.collaboratorId;
          delete nextPayload.collaboratorName;
          nextCollaboratorId = null;
          nextCollaboratorName = null;
        } else {
          const collaborator = (
            await db
              .select()
              .from(bphfInspectionEmployees)
              .where(eq(bphfInspectionEmployees.id, input.collaboratorId))
              .limit(1)
          )[0];
          if (!collaborator)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "O colaborador selecionado já não existe no catálogo BPHF.",
            });
          nextPayload.collaboratorId = collaborator.id;
          nextPayload.collaboratorName = collaborator.name;
          nextCollaboratorId = collaborator.id;
          nextCollaboratorName = collaborator.name;
        }
      }
      if (input.productName !== undefined) {
        if (input.productName.trim())
          nextPayload.product = input.productName.trim();
        else delete nextPayload.product;
      }
      if (input.lot !== undefined) {
        if (input.lot.trim()) nextPayload.lot = input.lot.trim();
        else delete nextPayload.lot;
      }
      if (input.validity !== undefined) {
        if (input.validity.trim()) nextPayload.validity = input.validity.trim();
        else delete nextPayload.validity;
      }
      let recalculatedDispatchResult: "C" | "NC" | "N/A" | undefined;
      if (input.dispatchProductChecks !== undefined) {
        if (entry.module !== "dispatch_control")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "As referências só podem ser editadas em registos de Expedição.",
          });
        if (input.dispatchVehicleTemperature === undefined)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Indique a temperatura do veículo ao editar a Expedição.",
          });
        const profileId =
          nextPayload.profile === "congelado" ? "congelado" : "ambiente";
        const profile = getDispatchProfile(profileId);
        const limits = {
          product: profile.productTemperatureLimit,
          vehicle: profile.vehicleTemperatureLimit,
        };
        const productValidations = input.dispatchProductChecks.map(check => {
          if (check.verificationStatus === "not_verified")
            return {
              ...check,
              dispatchedQuantity: 0,
              conformity: {
                result: "N/A" as const,
                quantityResult: "N/A" as const,
                productTemperatureResult: "N/A" as const,
                vehicleTemperatureResult: "N/A" as const,
              },
            };
          const dispatchedQuantity = check.lots.reduce(
            (total, lot) => total + lot.dispatchedQuantity,
            0
          );
          const conformity = calculateDispatchConformity({
            orderedBoxes: check.orderedQuantity,
            dispatchedBoxes: dispatchedQuantity,
            productLabelResult: check.productLabelResult,
            boxLabelResult: check.boxLabelResult,
            productTemperature: check.productTemperature,
            vehicleTemperature: input.dispatchVehicleTemperature!,
            productTemperatureLimit: limits.product,
            vehicleTemperatureLimit: limits.vehicle,
          });
          if (conformity.result === "NC" && !check.observations?.trim())
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `As observações são obrigatórias no produto ${check.name} quando a validação não está conforme.`,
            });
          return {
            ...check,
            verificationStatus: "verified" as const,
            dispatchedQuantity,
            conformity,
          };
        });
        const vehicleTemperatureResult =
          input.dispatchVehicleTemperature <= limits.vehicle ? "C" : "NC";
        if (
          vehicleTemperatureResult === "NC" &&
          !input.dispatchVehicleObservations?.trim()
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A observação geral é obrigatória quando a temperatura do veículo não está conforme.",
          });
        const hasNonconformity =
          productValidations.some(check => check.conformity.result === "NC") ||
          vehicleTemperatureResult === "NC";
        const hasNotVerified = productValidations.some(
          check => check.verificationStatus === "not_verified"
        );
        recalculatedDispatchResult = hasNonconformity
          ? "NC"
          : hasNotVerified
            ? "N/A"
            : "C";
        const reasons = [
          ...productValidations
            .filter(check => check.verificationStatus !== "not_verified")
            .flatMap(check => [
              ...(check.conformity.quantityResult === "NC"
                ? [`${check.name}: quantidade expedida diferente da quantidade pedida.`]
                : []),
              ...(check.conformity.productTemperatureResult === "NC"
                ? [`${check.name}: temperatura do produto fora do limite.`]
                : []),
              ...(check.productLabelResult === "NC"
                ? [`${check.name}: rotulagem do produto não conforme.`]
                : []),
              ...(check.boxLabelResult === "NC"
                ? [`${check.name}: rotulagem da caixa não conforme.`]
                : []),
            ]),
          ...productValidations
            .filter(check => check.verificationStatus === "not_verified")
            .map(
              check =>
                `${check.name}: referência não verificada — ${check.notVerifiedReason}.`
            ),
          ...(vehicleTemperatureResult === "NC"
            ? [
                `Temperatura do veículo fora do limite (${input.dispatchVehicleTemperature} °C; máximo ${limits.vehicle} °C).`,
              ]
            : []),
        ];
        const first =
          productValidations.find(
            check => check.verificationStatus !== "not_verified"
          ) ?? productValidations[0]!;
        nextPayload.productChecks = productValidations;
        nextPayload.productValidations = productValidations;
        nextPayload.orderItems = productValidations.map(check => ({
          name: check.name,
          orderedQuantity: check.orderedQuantity,
        }));
        nextPayload.verificationSummary = {
          verified: productValidations.filter(
            check => check.verificationStatus !== "not_verified"
          ).length,
          notVerified: productValidations.filter(
            check => check.verificationStatus === "not_verified"
          ).length,
        };
        nextPayload.reasons = reasons;
        nextPayload.vehicleTemperature = input.dispatchVehicleTemperature;
        nextPayload.vehicleTemperatureResult = vehicleTemperatureResult;
        nextPayload.temperatureLimits = limits;
        nextPayload.observations = input.dispatchVehicleObservations?.trim() || "";
        nextPayload.product = first.name;
        nextPayload.lot =
          first.verificationStatus === "not_verified"
            ? "NÃO VERIFICADO"
            : first.lots[0]?.lot ?? "";
      }
      const effectiveResult =
        recalculatedFragileResult ?? recalculatedDispatchResult ?? input.result;
      await db
        .update(controlEntries)
        .set({
          title: input.title,
          area: input.area,
          ...(input.factoryId !== undefined
            ? { factoryId: input.factoryId }
            : {}),
          result: effectiveResult,
          notes:
            entry.module === "fragile_items" && effectiveResult === "C"
              ? null
              : input.notes?.trim() || null,
          payload: {
            ...nextPayload,
            editHistory: [
              ...history,
              {
                action: "updated",
                at: editedAt,
                byProfileId: ctx.operatorProfile!.id,
                byName: ctx.operatorProfile!.name,
                byTitle: ctx.operatorProfile!.title,
                previousResult: entry.result,
                result: effectiveResult,
                incidenceResolved:
                  entry.result === "NC" && effectiveResult === "C",
                ...(entry.module === "fragile_items" &&
                (fragileFieldsWereSent ||
                  (input.result === "C" && previousFragileState !== "Íntegro"))
                  ? {
                      previousFragileState,
                      fragileState: nextFragileState,
                      previousFragileContainmentAction,
                      fragileContainmentAction: nextFragileContainmentAction,
                      previousFragilePeriodicity,
                      fragilePeriodicity: nextFragilePeriodicity,
                      previousFragileReferenceImageUrl,
                      fragileReferenceImageUrl: nextFragileReferenceImageUrl,
                      previousFragileEvidencePhotos,
                      fragileEvidencePhotos: nextFragileEvidencePhotos,
                    }
                  : {}),
                ...(input.collaboratorId !== undefined
                  ? {
                      previousCollaboratorId:
                        Number.isInteger(previousCollaboratorId) &&
                        previousCollaboratorId > 0
                          ? previousCollaboratorId
                          : null,
                      previousCollaboratorName,
                      collaboratorId: nextCollaboratorId,
                      collaboratorName: nextCollaboratorName,
                    }
                  : {}),
              },
            ],
          },
        })
        .where(eq(controlEntries.id, input.id));
      if (entry.result === "NC" && effectiveResult === "C") {
        await db
          .update(controlTasks)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(controlTasks.sourceEntryId, entry.id),
              eq(controlTasks.status, "pending")
            )
          );
      }
      if (entry.module === "fragile_items" && entry.result !== effectiveResult) {
        const linkedNonconformities = await db
          .select()
          .from(nonconformities)
          .where(eq(nonconformities.sourceEntryId, entry.id));
        if (effectiveResult === "C") {
          await Promise.all(
            linkedNonconformities.map(nc =>
              db
                .update(nonconformities)
                .set({
                  status: "closed",
                  closedAt: new Date(),
                  validatedBy: ctx.operatorProfile!.name,
                  validatedByOpenId: ctx.user!.openId,
                })
                .where(eq(nonconformities.id, nc.id))
            )
          );
        } else if (effectiveResult === "NC") {
          await Promise.all(
            linkedNonconformities.map(nc =>
              db
                .update(nonconformities)
                .set({
                  status: "open",
                  closedAt: null,
                  validatedBy: null,
                  validatedByOpenId: null,
                })
                .where(eq(nonconformities.id, nc.id))
            )
          );
        }
      }
      const updatedPlannedTaskId = Number(nextPayload.plannedTaskId);
      await reconcilePlannedControlTaskStatus(
        db,
        Number.isInteger(updatedPlannedTaskId) && updatedPlannedTaskId > 0
          ? updatedPlannedTaskId
          : null
      );
      return {
        success: true,
        incidenciaResolvida: entry.result === "NC" && effectiveResult === "C",
      };
    }),

  deleteControlEntry: qualityOperatorProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const entry = (
        await db
          .select()
          .from(controlEntries)
          .where(eq(controlEntries.id, input.id))
          .limit(1)
      )[0];
      if (!entry)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Registo de controlo não encontrado.",
        });
      const isManager = ctx.operatorProfile!.role === "manager";
      const isAuthor =
        entry.registeredByProfileId === ctx.operatorProfile!.id ||
        (!entry.registeredByProfileId &&
          entry.registeredByName === ctx.operatorProfile!.name);
      if (!isManager && !isAuthor)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Apenas o técnico que registou este controlo ou a Responsável de Qualidade o pode eliminar.",
        });
      const payload =
        entry.payload &&
        typeof entry.payload === "object" &&
        !Array.isArray(entry.payload)
          ? ({ ...entry.payload } as Record<string, unknown>)
          : {};
      const history = Array.isArray(payload.editHistory)
        ? payload.editHistory
        : [];
      const deletedAt = new Date().toISOString();
      await db
        .update(controlEntries)
        .set({
          payload: {
            ...payload,
            recordLifecycle: {
              status: "deleted",
              deletedAt,
              deletedByProfileId: ctx.operatorProfile!.id,
              deletedByName: ctx.operatorProfile!.name,
              deletedByTitle: ctx.operatorProfile!.title,
            },
            editHistory: [
              ...history,
              {
                action: "deleted",
                at: deletedAt,
                byProfileId: ctx.operatorProfile!.id,
                byName: ctx.operatorProfile!.name,
                byTitle: ctx.operatorProfile!.title,
              },
            ],
          },
        })
        .where(eq(controlEntries.id, input.id));
      const deletedPlannedTaskId = Number(payload.plannedTaskId);
      await reconcilePlannedControlTaskStatus(
        db,
        Number.isInteger(deletedPlannedTaskId) && deletedPlannedTaskId > 0
          ? deletedPlannedTaskId
          : null
      );
      return { success: true };
    }),

  createEntry: qualityOperatorProcedure
    .input(
      z.object({
        module: qualityModuleSchema,
        title: z.string().min(2).max(180),
        area: z.string().min(2).max(120),
        factoryId: z.number().int().optional(),
        result: resultSchema.optional(),
        notes: z.string().max(3000).optional(),
        payload: z.record(z.string(), z.unknown()).default({}),
        performedAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        retroactiveReason: retroactiveReasonSchema.optional(),
        retroactiveJustification: z.string().trim().max(1500).optional(),
        plannedTaskId: z.number().int().optional(),
        createNonconformity: z.boolean().default(false),
        severity: z
          .enum(["critical", "high", "medium", "low"])
          .default("medium"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const authorization = await requireControlAuthorization(db, {
        module: input.module,
        factoryId: input.factoryId ?? null,
        plannedTaskId: input.plannedTaskId,
        profile: ctx.operatorProfile!,
      });
      const plannedDateKey = authorization.task?.dueAt
        ? localDateKey(new Date(authorization.task.dueAt))
        : null;
      const todayKey = localDateKey(new Date());
      if (
        input.performedAt &&
        (!plannedDateKey ||
          input.performedAt > todayKey ||
          (authorization.isPreviousPending &&
            input.performedAt < plannedDateKey))
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A data de realização deve situar-se entre a data prevista do controlo e hoje.",
        });
      if (authorization.isPreviousPending && !input.retroactiveReason)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Selecione a justificação do preenchimento fora da data prevista.",
        });
      if (
        authorization.isPreviousPending &&
        input.retroactiveReason === "technical_unavailability" &&
        !input.performedAt
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Indique a data real da verificação efetuada após a indisponibilidade técnica.",
        });
      if (
        authorization.isPreviousPending &&
        input.retroactiveReason === "other" &&
        !input.retroactiveJustification?.trim()
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Indique a justificação para a opção selecionada.",
        });
      if (input.module === "fragile_items") {
        const fragileItemId = input.payload.fragileItemId;
        if (typeof fragileItemId === "number" && input.factoryId) {
          const targetOperationalDate =
            input.performedAt ?? plannedDateKey ?? todayKey;
          const existingFragileEntries = await db
            .select()
            .from(controlEntries)
            .where(
              and(
                eq(controlEntries.module, "fragile_items"),
                eq(controlEntries.factoryId, input.factoryId)
              )
            )
            .orderBy(desc(controlEntries.completedAt));
          const alreadyRegistered = existingFragileEntries.some(entry => {
            if (isDeletedControlEntry(entry)) return false;
            const payload = entryPayload(entry);
            const registeredItemId = payload.fragileItemId;
            if (registeredItemId !== fragileItemId) return false;
            const actualDate = payload.actualVerificationDate;
            const registeredOperationalDate =
              typeof actualDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(actualDate)
                ? actualDate
                : entryOperationalDate(entry);
            return registeredOperationalDate === targetOperationalDate;
          });
          if (alreadyRegistered)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Este ponto de Quebráveis já foi verificado na data selecionada.",
            });
        }
      }
      const completedAt = input.performedAt
        ? new Date(`${input.performedAt}T12:00:00`)
        : new Date();
      const normalizedPayload = { ...input.payload };
      let normalizedResult = input.result ?? null;
      if (input.module === "fragile_items") {
        const payloadState =
          typeof normalizedPayload.state === "string"
            ? (normalizedPayload.state as FragileState)
            : null;
        const normalizedState = fragileStateFromResult(
          input.result,
          payloadState
        ) ?? "Íntegro";
        normalizedResult = normalizedState === "Íntegro" ? "C" : "NC";
        normalizedPayload.state = normalizedState;
        if (normalizedState === "Íntegro") {
          delete normalizedPayload.containmentAction;
          normalizedPayload.evidencePhotos = [];
        } else {
          const containmentAction =
            typeof normalizedPayload.containmentAction === "string"
              ? normalizedPayload.containmentAction.trim()
              : typeof input.notes === "string"
                ? input.notes.trim()
                : "";
          if (!containmentAction)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "A ação de contenção é obrigatória quando o quebrável está danificado ou em falta.",
            });
          normalizedPayload.containmentAction = containmentAction;
        }
      }
      const insertedEntry = await db.insert(controlEntries).values({
        module: input.module,
        title: input.title,
        area: input.area,
        factoryId: input.factoryId ?? null,
        result: normalizedResult,
        notes:
          input.module === "fragile_items" && normalizedResult === "C"
            ? null
            : input.notes ?? null,
        payload: {
          ...normalizedPayload,
          plannedTaskId: authorization.task?.id ?? null,
          plannedDate: authorization.task?.dueAt
            ? new Date(authorization.task.dueAt).toISOString()
            : null,
          registeredAgainstPreviousPlan:
            authorization.isPreviousPending ?? false,
          registeredAheadOfPlannedDate: authorization.isFuturePlanned ?? false,
          actualVerificationDate:
            input.performedAt ?? localDateKey(completedAt),
          retroactiveJustification:
            authorization.isPreviousPending && input.retroactiveReason
              ? {
                  code: input.retroactiveReason,
                  label: retroactiveReasonLabels[input.retroactiveReason],
                  details:
                    input.retroactiveReason === "other"
                      ? (input.retroactiveJustification?.trim() ?? null)
                      : null,
                }
              : null,
        },
        completedAt,
        registeredByProfileId: ctx.operatorProfile!.id,
        registeredByName: ctx.operatorProfile!.name,
        registeredByTitle: ctx.operatorProfile!.title,
        createdBy: ctx.user!.openId,
      });
      const oneSubmissionModules: Array<(typeof qualityModuleValues)[number]> =
        [
          "sensory",
          "shelf_life",
          "dispatch_control",
          "internal_analysis",
        ];
      let plannedControlComplete = Boolean(
        authorization.task && oneSubmissionModules.includes(input.module)
      );
      if (
        authorization.task &&
        [
          "bphf",
          "metal_detectors",
          "temperature_controls",
          "suggestion_boxes",
          "fragile_items",
          "monthly_checklist",
          "food_defense",
        ].includes(input.module)
      ) {
        const [
          taskEntries,
          progressAreas,
          progressFragileItems,
          progressChecklistItems,
          progressChecklistAssignments,
          progressChecklistAreaAssignments,
          progressChecklistAreas,
          progressFactories,
        ] = await Promise.all([
          db
            .select()
            .from(controlEntries)
            .orderBy(desc(controlEntries.completedAt)),
          db.select().from(areas).orderBy(areas.name),
          db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
          db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
          db
            .select()
            .from(checklistItemFactories)
            .orderBy(checklistItemFactories.factoryId),
          db.select().from(checklistItemAreas),
          db.select().from(checklistAreas),
          db.select().from(factories).orderBy(factories.name),
        ]);
        const taskPayload = (entry: (typeof taskEntries)[number]) =>
          entry.payload &&
          typeof entry.payload === "object" &&
          !Array.isArray(entry.payload)
            ? (entry.payload as Record<string, unknown>)
            : {};
        const taskEntriesForPlan = taskEntries.filter(
          entry =>
            entry.module === input.module &&
            entry.factoryId === authorization.task!.factoryId &&
            taskPayload(entry).plannedTaskId === authorization.task!.id
        );
        if (input.module === "bphf") {
          plannedControlComplete = bphfTaskComplete(
            authorization.task!,
            taskEntriesForPlan,
            progressAreas
          );
        } else if (input.module === "suggestion_boxes") {
          plannedControlComplete = suggestionBoxesTaskComplete(
            authorization.task!,
            taskEntriesForPlan,
            progressFactories
          );
        } else if (input.module === "metal_detectors") {
          plannedControlComplete = metalDetectorsTaskComplete(
            authorization.task!,
            taskEntriesForPlan,
            progressAreas
          );
        } else if (input.module === "temperature_controls") {
          plannedControlComplete = temperatureControlsTaskComplete(
            authorization.task!,
            taskEntriesForPlan
          );
        } else if (input.module === "monthly_checklist") {
          plannedControlComplete = monthlyChecklistTaskComplete(
            authorization.task!,
            taskEntriesForPlan,
            progressChecklistItems,
            progressChecklistAssignments,
            progressChecklistAreaAssignments,
            progressChecklistAreas
          );
        } else if (input.module === "food_defense") {
          plannedControlComplete = foodDefenseTaskComplete([
            ...taskEntriesForPlan,
            { payload: input.payload },
          ]);
        } else if (input.module === "fragile_items") {
          const priorInspections = new Map<number, Date>();
          taskEntries
            .filter(
              entry =>
                entry.module === "fragile_items" &&
                entry.completedAt < new Date(authorization.task!.dueAt)
            )
            .forEach(entry => {
              const itemId = taskPayload(entry).fragileItemId;
              if (typeof itemId === "number" && !priorInspections.has(itemId))
                priorInspections.set(itemId, entry.completedAt);
            });
          const expectedItemIds = progressFragileItems
            .filter(
              item =>
                item.factoryId === authorization.task!.factoryId &&
                item.status === "active" &&
                isFragileInspectionPending(
                  item.periodicity,
                  priorInspections.get(item.id),
                  new Date(authorization.task!.dueAt)
                )
            )
            .map(item => item.id);
          const completedItemIds = new Set(
            taskEntriesForPlan
              .map(entry => taskPayload(entry).fragileItemId)
              .filter((id): id is number => typeof id === "number")
          );
          plannedControlComplete =
            expectedItemIds.length > 0 &&
            expectedItemIds.every(id => completedItemIds.has(id));
        }
      }
      if (authorization.task) {
        const [
          canonicalEntries,
          canonicalAreas,
          canonicalMonthlyItems,
          canonicalMonthlyAssignments,
          canonicalMonthlyAreaAssignments,
          canonicalMonthlyAreas,
          canonicalFactories,
          canonicalFragileItems,
        ] = await Promise.all([
          db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
          db.select().from(areas).orderBy(areas.name),
          db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
          db
            .select()
            .from(checklistItemFactories)
            .orderBy(checklistItemFactories.factoryId),
          db.select().from(checklistItemAreas),
          db.select().from(checklistAreas),
          db.select().from(factories).orderBy(factories.name),
          db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
        ]);
        const currentEntryForCompletion = {
          module: input.module,
          factoryId: input.factoryId ?? authorization.task.factoryId,
          area: input.area,
          title: input.title,
          completedAt,
          payload: {
            ...(input.payload &&
            typeof input.payload === "object" &&
            !Array.isArray(input.payload)
              ? input.payload
              : {}),
            plannedTaskId: authorization.task.id,
          },
        };
        plannedControlComplete = isHistoricalPlanTaskSatisfied(
          authorization.task,
          [...canonicalEntries, currentEntryForCompletion],
          canonicalAreas,
          canonicalMonthlyItems,
          canonicalMonthlyAssignments,
          canonicalFactories,
          canonicalMonthlyAreaAssignments,
          canonicalMonthlyAreas,
          canonicalFragileItems
        );
      }
      if (authorization.task && plannedControlComplete) {
        await db
          .update(controlTasks)
          .set({
            status: "completed",
            completedAt,
            completedByProfileId: ctx.operatorProfile!.id,
            completedByName: ctx.operatorProfile!.name,
            completedByTitle: ctx.operatorProfile!.title,
          })
          .where(eq(controlTasks.id, authorization.task.id));
        if (authorization.isPreviousPending) {
          try {
            await createRetroactiveDailyReportRevision({
              taskId: authorization.task.id,
              entryId: Number((insertedEntry as any)?.[0]?.insertId) || null,
              dueAt: new Date(authorization.task.dueAt),
              module: input.module,
              reason: retroactiveReasonLabels[input.retroactiveReason!],
              createdBy: ctx.operatorProfile!.name,
            });
          } catch (error) {
            console.error(
              "[DailyReportArchive] Não foi possível criar a revisão retroativa",
              error
            );
          }
        }
      }
      const isCriticalMetal = shouldCreateCriticalMetalAlert(
        input.module,
        normalizedResult
      );
      return {
        success: true,
        critical: isCriticalMetal,
        incidence: normalizedResult === "NC",
      };
    }),

  calculateSensory: qualitySessionProcedure
    .input(
      z.object({
        aspeto: z.number().int().min(1).max(5),
        fimDeBoca: z.number().int().min(1).max(5),
        cor: z.number().int().min(1).max(5),
        cheiro: z.number().int().min(1).max(5),
        textura: z.number().int().min(1).max(5),
        sabor: z.number().int().min(1).max(5),
      })
    )
    .query(({ input }) => calculateSensoryScore(input)),

  calculateDispatchConformity: qualitySessionProcedure
    .input(
      z.object({
        orderedBoxes: z.number().int().min(0),
        dispatchedBoxes: z.number().int().min(0),
        productLabelResult: z.enum(["C", "NC"]),
        boxLabelResult: z.enum(["C", "NC"]),
        productTemperature: z.number().min(-100).max(100),
        vehicleTemperature: z.number().min(-100).max(100),
        productTemperatureLimit: z.number().min(-100).max(100),
        vehicleTemperatureLimit: z.number().min(-100).max(100),
      })
    )
    .query(({ input }) => calculateDispatchConformity(input)),

  parseDispatchOrderPdf: qualityOperatorProcedure
    .input(
      z.object({
        fileName: z.string().min(5).max(180),
        mimeType: z.literal("application/pdf"),
        dataUrl: z.string().min(32).max(16_500_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireControlAuthorization(db, {
        module: "dispatch_control",
        factoryId: null,
        profile: ctx.operatorProfile!,
      });
      const match = /^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/i.exec(
        input.dataUrl
      );
      if (!match)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O ficheiro enviado não é um PDF válido.",
        });
      const pdfBuffer = Buffer.from(match[1].replace(/\s/g, ""), "base64");
      if (!pdfBuffer.subarray(0, 4).equals(Buffer.from("%PDF")))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O ficheiro enviado não corresponde a um documento PDF.",
        });
      if (pdfBuffer.byteLength > 12_000_000)
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: "A encomenda PDF deve ter no máximo 12 MB.",
        });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const stored = await storagePut(
        `dispatch-orders/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`,
        pdfBuffer,
        input.mimeType
      );
      const signedUrl = await storageGetSignedUrl(stored.key);
      try {
        const response = await invokeLLM({
          model: "gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "Extrai dados de encomendas de panificação em PDF. Nunca inventes valores: quando um campo não estiver legível, devolve uma string vazia, lista vazia ou uma advertência. Quantidades são números inteiros de caixas/unidades pedidas. Devolve apenas JSON conforme o esquema.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extrai o número da encomenda, cliente e todas as linhas de produto com quantidade pedida.",
                },
                {
                  type: "file_url",
                  file_url: { url: signedUrl, mime_type: "application/pdf" },
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "dispatch_order",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  orderNumber: { type: "string" },
                  customer: { type: "string" },
                  products: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        orderedQuantity: { type: "integer" },
                      },
                      required: ["name", "orderedQuantity"],
                      additionalProperties: false,
                    },
                  },
                  warnings: { type: "array", items: { type: "string" } },
                },
                required: ["orderNumber", "customer", "products", "warnings"],
                additionalProperties: false,
              },
            },
          },
        });
        const content = response.choices[0]?.message.content;
        const extracted = dispatchOrderExtractionSchema.parse(
          JSON.parse(typeof content === "string" ? content : "{}")
        );
        return {
          ...extracted,
          document: { name: input.fileName, url: stored.url },
        };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Não foi possível extrair os dados da encomenda. Confirme se o PDF está legível e preencha os campos manualmente.",
        });
      }
    }),

  registerDispatchControl: qualityOperatorProcedure
    .input(
      z.object({
        factoryId: z.number().int().optional(),
        profile: z.enum(["ambiente", "congelado"]),
        orderNumber: z.string().min(1).max(80),
        customer: z.string().min(2).max(160),
        deliveryNote: z.string().max(120).optional(),
        product: z.string().min(2).max(180),
        lot: z.string().min(1).max(120),
        orderedBoxes: z.number().int().min(0),
        dispatchedBoxes: z.number().int().min(0),
        productLabelResult: z.enum(["C", "NC"]),
        boxLabelResult: z.enum(["C", "NC"]),
        productTemperature: z.number().min(-100).max(100),
        vehicleTemperature: z.number().min(-100).max(100),
        observations: z.string().max(3000).optional(),
        orderItems: z
          .array(
            z.object({
              name: z.string().min(1).max(180),
              orderedQuantity: z.number().int().min(0),
            })
          )
          .max(30)
          .optional(),
        productChecks: z
          .array(dispatchProductCheckSchema)
          .min(1)
          .max(30)
          .optional(),
        evidencePhotos: z
          .array(
            z.object({
              key: z.string().min(1),
              url: z.string().startsWith("/manus-storage/"),
              fileName: z.string().min(1).max(255),
              mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
            })
          )
          .max(5)
          .optional(),
        sourceOrderDocument: z
          .object({
            name: z.string().min(1).max(180),
            url: z.string().startsWith("/manus-storage/"),
          })
          .optional(),
        plannedTaskId: z.number().int().optional(),
        performedAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        retroactiveReason: retroactiveReasonSchema.optional(),
        retroactiveJustification: z.string().trim().max(1500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const authorization = await requireControlAuthorization(db, {
        module: "dispatch_control",
        factoryId: null,
        plannedTaskId: input.plannedTaskId,
        profile: ctx.operatorProfile!,
      });
      const plannedDateKey = authorization.task?.dueAt
        ? localDateKey(new Date(authorization.task.dueAt))
        : null;
      const todayKey = localDateKey(new Date());
      if (
        input.performedAt &&
        (!plannedDateKey ||
          input.performedAt > todayKey ||
          (authorization.isPreviousPending && input.performedAt < plannedDateKey))
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A data de realização deve situar-se entre a data prevista do controlo e hoje.",
        });
      if (authorization.isPreviousPending && !input.retroactiveReason)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Selecione a justificação do preenchimento fora da data prevista.",
        });
      if (
        authorization.isPreviousPending &&
        input.retroactiveReason === "technical_unavailability" &&
        !input.performedAt
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Indique a data real da verificação efetuada após a indisponibilidade técnica.",
        });
      if (
        authorization.isPreviousPending &&
        input.retroactiveReason === "other" &&
        !input.retroactiveJustification?.trim()
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Indique a justificação para a opção selecionada.",
        });
      const profile = getDispatchProfile(input.profile);
      const limits = {
        product: profile.productTemperatureLimit,
        vehicle: profile.vehicleTemperatureLimit,
      };
      const productChecks = input.productChecks ?? [
        {
          verificationStatus: "verified" as const,
          name: input.product,
          orderedQuantity: input.orderedBoxes,
          lots: [{ lot: input.lot, dispatchedQuantity: input.dispatchedBoxes }],
          productLabelResult: input.productLabelResult,
          boxLabelResult: input.boxLabelResult,
          productTemperature: input.productTemperature,
          observations: input.observations,
        },
      ];
      const productValidations = productChecks.map(check => {
        if (check.verificationStatus === "not_verified") {
          return {
            ...check,
            dispatchedQuantity: 0,
            conformity: {
              result: "N/A" as const,
              quantityResult: "N/A" as const,
              productTemperatureResult: "N/A" as const,
              vehicleTemperatureResult: "N/A" as const,
            },
          };
        }
        const dispatchedQuantity = check.lots.reduce(
          (total, lot) => total + lot.dispatchedQuantity,
          0
        );
        const conformity = calculateDispatchConformity({
          orderedBoxes: check.orderedQuantity,
          dispatchedBoxes: dispatchedQuantity,
          productLabelResult: check.productLabelResult,
          boxLabelResult: check.boxLabelResult,
          productTemperature: check.productTemperature,
          vehicleTemperature: limits.vehicle,
          productTemperatureLimit: limits.product,
          vehicleTemperatureLimit: limits.vehicle,
        });
        if (conformity.result === "NC" && !check.observations?.trim())
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `As observações são obrigatórias no produto ${check.name} quando a validação não está conforme.`,
          });
        return {
          ...check,
          verificationStatus: "verified" as const,
          dispatchedQuantity,
          conformity,
        };
      });
      const vehicleTemperatureResult =
        input.vehicleTemperature <= limits.vehicle ? "C" : "NC";
      const reasons = [
        ...productValidations
          .filter(check => check.verificationStatus !== "not_verified")
          .flatMap(check => [
            ...(check.conformity.quantityResult === "NC"
              ? [
                  `${check.name}: quantidade expedida diferente da quantidade pedida.`,
                ]
              : []),
            ...(check.conformity.productTemperatureResult === "NC"
              ? [`${check.name}: temperatura do produto fora do limite.`]
              : []),
            ...(check.productLabelResult === "NC"
              ? [`${check.name}: rotulagem do produto não conforme.`]
              : []),
            ...(check.boxLabelResult === "NC"
              ? [`${check.name}: rotulagem da caixa não conforme.`]
              : []),
          ]),
        ...productValidations
          .filter(check => check.verificationStatus === "not_verified")
          .map(
            check =>
              `${check.name}: referência não verificada — ${check.notVerifiedReason}.`
          ),
        ...(vehicleTemperatureResult === "NC"
          ? [
              `Temperatura do veículo fora do limite (${input.vehicleTemperature} °C; máximo ${limits.vehicle} °C).`,
            ]
          : []),
      ];
      const hasNonconformity =
        productValidations.some(check => check.conformity.result === "NC") ||
        vehicleTemperatureResult === "NC";
      const hasNotVerified = productValidations.some(
        check => check.verificationStatus === "not_verified"
      );
      const conformity = {
        result: hasNonconformity
          ? ("NC" as const)
          : hasNotVerified
            ? ("N/A" as const)
            : ("C" as const),
        productValidations,
        vehicleTemperatureResult,
        verificationSummary: {
          verified: productValidations.filter(
            check => check.verificationStatus !== "not_verified"
          ).length,
          notVerified: productValidations.filter(
            check => check.verificationStatus === "not_verified"
          ).length,
        },
        reasons,
      };
      if (vehicleTemperatureResult === "NC" && !input.observations?.trim())
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A observação geral é obrigatória quando a temperatura do veículo não está conforme.",
        });
      const completedAt = input.performedAt
        ? new Date(`${input.performedAt}T12:00:00`)
        : new Date();
      const title = `Expedição ${input.orderNumber} — ${input.customer}`;
      const area = `Expedição ${input.profile}`;
      const payload = {
        ...input,
        plannedTaskId: authorization.task?.id ?? null,
        plannedDate: authorization.task?.dueAt
          ? new Date(authorization.task.dueAt).toISOString()
          : null,
        registeredAgainstPreviousPlan:
          authorization.isPreviousPending ?? false,
        registeredAheadOfPlannedDate: authorization.isFuturePlanned ?? false,
        actualVerificationDate: input.performedAt ?? localDateKey(completedAt),
        retroactiveJustification:
          authorization.isPreviousPending && input.retroactiveReason
            ? {
                code: input.retroactiveReason,
                label: retroactiveReasonLabels[input.retroactiveReason],
                details:
                  input.retroactiveReason === "other"
                    ? (input.retroactiveJustification?.trim() ?? null)
                    : null,
              }
            : null,
        productChecks: productValidations,
        profileLabel: profile.label,
        temperatureLimits: limits,
        ...conformity,
      };
      await db
        .insert(controlEntries)
        .values({
          module: "dispatch_control",
          title,
          area,
          factoryId: null,
          result: conformity.result,
          notes: input.observations ?? null,
          payload,
          completedAt,
          registeredByProfileId: ctx.operatorProfile!.id,
          registeredByName: ctx.operatorProfile!.name,
          registeredByTitle: ctx.operatorProfile!.title,
          createdBy: ctx.user!.openId,
        });
      await reconcilePlannedControlTaskStatus(db, authorization.task?.id);
      return {
        success: true,
        conformity,
        limits,
        incidence: conformity.result === "NC",
      };
    }),

  listIncidences: qualitySessionProcedure
    .input(
      z
        .object({
          date: dateInput.optional(),
          startDate: dateInput.optional(),
          endDate: dateInput.optional(),
          factoryId: z.number().int().optional(),
          collaboratorId: z.number().int().positive().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      if (
        input?.startDate &&
        input.endDate &&
        asDateRange(input.startDate).start > asDateRange(input.endDate).start
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A data final não pode ser anterior à data inicial.",
        });
      const defaultRange = asDateRange(input?.date ?? new Date());
      const start = input?.startDate
        ? asDateRange(input.startDate).start
        : input?.date
          ? defaultRange.start
          : new Date(0);
      const end = input?.endDate
        ? asDateRange(input.endDate).end
        : input?.date
          ? defaultRange.end
          : new Date("9999-12-31T23:59:59.999Z");
      const [entries, factoryRows, ncRows, followUpTasks] = await Promise.all([
        db
          .select()
          .from(controlEntries)
          .orderBy(desc(controlEntries.completedAt)),
        db.select().from(factories).orderBy(factories.name),
        db
          .select()
          .from(nonconformities)
          .orderBy(desc(nonconformities.detectedAt)),
        db.select().from(controlTasks).orderBy(desc(controlTasks.completedAt)),
      ]);
      const factoryNames = new Map(
        factoryRows.map(factory => [factory.id, factory.name])
      );
      const followUpReportsByTaskId = new Map(
        entries
          .map(entry => {
            const taskId = Number(entryPayload(entry).taskId);
            return Number.isInteger(taskId) && taskId > 0
              ? ([taskId, entry] as const)
              : null;
          })
          .filter(
            (item): item is readonly [number, (typeof entries)[number]] =>
              Boolean(item)
          )
      );
      const followUpReviewAlertsFor = (
        sourceEntry: (typeof entries)[number],
        payload: Record<string, unknown>
      ) => {
        const persisted = pendingFollowUpReviewAlertsFromPayload(payload);
        const persistedIds = new Set(
          persisted.map(alert => alert.followUpTaskId)
        );
        const acknowledgedAt =
          typeof payload.followUpReviewAcknowledgedAt === "string" &&
          !Number.isNaN(
            new Date(payload.followUpReviewAcknowledgedAt).getTime()
          )
            ? new Date(payload.followUpReviewAcknowledgedAt)
            : null;
        const historical = followUpTasks
          .filter(
            task =>
              task.sourceEntryId === sourceEntry.id &&
              task.status === "completed" &&
              !persistedIds.has(task.id) &&
              Boolean(task.completedAt) &&
              (!acknowledgedAt || task.completedAt! > acknowledgedAt)
          )
          .map(task => {
            const report = followUpReportsByTaskId.get(task.id);
            return {
              followUpTaskId: task.id,
              title: task.title,
              result: report?.result ?? "C",
              notes:
                report?.notes ??
                "Seguimento concluído sem observações adicionais.",
              completedAt: (
                report?.completedAt ?? task.completedAt!
              ).toISOString(),
              registeredByProfileId:
                report?.registeredByProfileId ??
                task.completedByProfileId ??
                0,
              registeredByName:
                report?.registeredByName ??
                task.completedByName ??
                "Utilizador não identificado",
              registeredByTitle:
                report?.registeredByTitle ?? task.completedByTitle ?? "",
            };
          });
        return [...persisted, ...historical].sort(
          (left, right) =>
            new Date(right.completedAt).getTime() -
            new Date(left.completedAt).getTime()
        );
      };
      return entries
        .filter(entry => {
          const payload =
            entry.payload &&
            typeof entry.payload === "object" &&
            !Array.isArray(entry.payload)
              ? (entry.payload as Record<string, unknown>)
              : {};
          const occurredAt = incidenceOccurredAtFromPayload(
            payload,
            entry.completedAt
          );
          return (
            entry.result === "NC" &&
            !payload.deletedAt &&
            occurredAt >= start &&
            occurredAt < end &&
            (!input?.factoryId || entry.factoryId === input.factoryId) &&
            (!input?.collaboratorId ||
              Number(payload.collaboratorId) === input.collaboratorId)
          );
        })
        .map(entry => {
          const linked = ncRows.find(nc => nc.sourceEntryId === entry.id);
          const payload =
            entry.payload &&
            typeof entry.payload === "object" &&
            !Array.isArray(entry.payload)
              ? (entry.payload as Record<string, unknown>)
              : {};
          const occurrenceNumber =
            typeof payload.nonconformityOccurrenceNumber === "string"
              ? payload.nonconformityOccurrenceNumber
              : null;
          const generatedNonconformity =
            Boolean(linked) || payload.generatedNonconformity === true;
          const treatmentDecision = incidenceDecisionFromPayload(
            payload,
            generatedNonconformity
          );
          const treatment = incidenceTreatmentFromPayload(payload);
          const followUpReviewAlerts = followUpReviewAlertsFor(entry, payload);
          const occurredOn = incidenceOccurredOnFromPayload(
            payload,
            entry.completedAt
          );
          return {
            ...entry,
            occurredOn,
            factoryName: entry.factoryId
              ? (factoryNames.get(entry.factoryId) ??
                "Fábrica não identificada")
              : "Sem fábrica/linha",
            generatedNonconformity,
            treatmentStatus: treatmentDecision,
            treatmentProgress: treatment.status,
            treatment,
            followUpReviewAlerts,
            nonconformityId: linked?.id ?? null,
            occurrenceNumber,
          };
        });
    }),

  incidenceRecurrenceAlerts: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const [entries, ncs] = await Promise.all([
      db
        .select()
        .from(controlEntries)
        .orderBy(desc(controlEntries.completedAt)),
      db.select().from(nonconformities),
    ]);
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const linkedEntryIds = new Set(
      ncs.map(nc => nc.sourceEntryId).filter((id): id is number => Boolean(id))
    );
    const grouped = new Map<
      number,
      {
        collaboratorId: number;
        collaboratorName: string;
        incidences: typeof entries;
      }
    >();
    entries
      .filter(entry => {
        const payload =
          entry.payload &&
          typeof entry.payload === "object" &&
          !Array.isArray(entry.payload)
            ? (entry.payload as Record<string, unknown>)
            : {};
        const collaboratorId = Number(payload.collaboratorId);
        const collaboratorName =
          typeof payload.collaboratorName === "string"
            ? payload.collaboratorName.trim()
            : "";
        return (
          entry.result === "NC" &&
          entry.completedAt >= since &&
          collaboratorId > 0 &&
          Boolean(collaboratorName) &&
          !linkedEntryIds.has(entry.id) &&
          payload.generatedNonconformity !== true
        );
      })
      .forEach(entry => {
        const payload = entry.payload as Record<string, unknown>;
        const collaboratorId = Number(payload.collaboratorId);
        const collaboratorName = String(payload.collaboratorName).trim();
        const current = grouped.get(collaboratorId) ?? {
          collaboratorId,
          collaboratorName,
          incidences: [] as typeof entries,
        };
        current.incidences.push(entry);
        grouped.set(collaboratorId, current);
      });
    return Array.from(grouped.values())
      .filter(item => item.incidences.length >= 3)
      .map(item => ({
        collaboratorId: item.collaboratorId,
        collaboratorName: item.collaboratorName,
        total: item.incidences.length,
        mostRecentAt: item.incidences.reduce(
          (latest, entry) =>
            entry.completedAt > latest ? entry.completedAt : latest,
          item.incidences[0].completedAt
        ),
      }))
      .sort(
        (left, right) =>
          right.total - left.total ||
          right.mostRecentAt.getTime() - left.mostRecentAt.getTime()
      );
  }),

  similarIncidenceAlerts: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const [entries, ncs, factoryRows] = await Promise.all([
      db
        .select()
        .from(controlEntries)
        .orderBy(desc(controlEntries.completedAt)),
      db.select().from(nonconformities),
      db.select().from(factories),
    ]);
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const linkedEntryIds = new Set(
      ncs.map(nc => nc.sourceEntryId).filter((id): id is number => Boolean(id))
    );
    const factoryNames = new Map(
      factoryRows.map(factory => [factory.id, factory.name])
    );
    const grouped = new Map<
      string,
      {
        title: string;
        module: (typeof qualityModuleValues)[number];
        factoryId: number | null;
        collaboratorId: number | null;
        collaboratorName: string | null;
        pointKey: string | null;
        factoryIds: number[];
        entries: typeof entries;
      }
    >();
    entries.forEach(entry => {
      const payload =
        entry.payload &&
        typeof entry.payload === "object" &&
        !Array.isArray(entry.payload)
          ? (entry.payload as Record<string, unknown>)
          : {};
      if (
        entry.result !== "NC" ||
        entry.completedAt < since ||
        linkedEntryIds.has(entry.id) ||
        payload.generatedNonconformity === true ||
        payload.deletedAt
      )
        return;
      const normalizedTitle = (entry.title ?? "")
        .trim()
        .toLocaleLowerCase("pt-PT")
        .replace(/\s+/g, " ");
      const collaboratorId =
        entry.module === "bphf" ? Number(payload.collaboratorId) : 0;
      const collaboratorName =
        entry.module === "bphf" && typeof payload.collaboratorName === "string"
          ? payload.collaboratorName.trim()
          : "";
      const hasBphfCollaborator =
        collaboratorId > 0 && Boolean(collaboratorName);
      const key = hasBphfCollaborator
        ? `${entry.module}|collaborator:${collaboratorId}`
        : controlledPointKey(entry, payload);
      if (!key) return;
      const group = grouped.get(key) ?? {
        title: hasBphfCollaborator
          ? `Colaborador: ${collaboratorName}`
          : entry.title,
        module: entry.module,
        factoryId: hasBphfCollaborator ? null : entry.factoryId,
        collaboratorId: hasBphfCollaborator ? collaboratorId : null,
        collaboratorName: hasBphfCollaborator ? collaboratorName : null,
        pointKey: hasBphfCollaborator ? null : key,
        factoryIds: entry.factoryId ? [entry.factoryId] : [],
        entries: [] as typeof entries,
      };
      if (entry.factoryId && !group.factoryIds.includes(entry.factoryId))
        group.factoryIds.push(entry.factoryId);
      group.entries.push(entry);
      grouped.set(key, group);
    });
    return Array.from(grouped.values())
      .filter(group => group.entries.length >= 3)
      .map(group => ({
        title: group.title,
        module: group.module,
        factoryId: group.factoryId,
        factoryName: group.collaboratorId
          ? group.factoryIds.length === 1
            ? (factoryNames.get(group.factoryIds[0]) ??
              "Fábrica não identificada")
            : "Várias fábricas / linhas"
          : group.factoryId
            ? (factoryNames.get(group.factoryId) ?? "Fábrica não identificada")
            : "Sem fábrica/linha",
        collaboratorId: group.collaboratorId,
        collaboratorName: group.collaboratorName,
        pointKey: group.pointKey,
        total: group.entries.length,
        mostRecentAt: group.entries.reduce(
          (latest, entry) =>
            entry.completedAt > latest ? entry.completedAt : latest,
          group.entries[0].completedAt
        ),
      }))
      .sort(
        (left, right) =>
          right.total - left.total ||
          right.mostRecentAt.getTime() - left.mostRecentAt.getTime()
      );
  }),

  updateIncidence: qualityOperatorProcedure
    .input(
      z.object({
        id: z.number().int(),
        title: z.string().min(2).max(180).optional(),
        area: z.string().min(2).max(120).optional(),
        notes: z.string().max(3000).optional(),
        generatedNonconformity: z.boolean().optional(),
        occurrenceNumber: z.string().max(80).optional(),
        treatment: incidenceTreatmentSchema.optional(),
        fragileTreatmentReview: fragileTreatmentReviewSchema.optional(),
        evidencePhotos: z
          .array(
            z.object({
              key: z.string().min(1),
              url: z.string().startsWith("/manus-storage/"),
              fileName: z.string().min(1).max(255),
              mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
            })
          )
          .max(8)
          .optional(),
        occurredOn: incidenceIsoDateSchema.optional(),
        collaboratorId: z.number().int().positive().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const entry = (
        await db
          .select()
          .from(controlEntries)
          .where(eq(controlEntries.id, input.id))
          .limit(1)
      )[0];
      if (!entry || entry.result !== "NC")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Incidência diária não encontrada.",
        });
      const isManager = ctx.operatorProfile!.role === "manager";
      const isAuthor =
        entry.registeredByProfileId === ctx.operatorProfile!.id ||
        (!entry.registeredByProfileId &&
          entry.registeredByName === ctx.operatorProfile!.name);
      if (!isManager && !isAuthor)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Apenas o técnico que registou a incidência ou a Responsável de Qualidade a pode editar.",
        });
      if (
        !isManager &&
        (input.generatedNonconformity !== undefined ||
          input.occurrenceNumber !== undefined ||
          input.fragileTreatmentReview !== undefined)
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "A decisão e o número de NC são geridos pela Responsável de Qualidade.",
        });
      const payload =
        entry.payload &&
        typeof entry.payload === "object" &&
        !Array.isArray(entry.payload)
          ? ({ ...entry.payload } as Record<string, unknown>)
          : {};
      const followUpTasks = await db
        .select()
        .from(controlTasks)
        .where(eq(controlTasks.sourceEntryId, entry.id));
      const acknowledgedAt =
        typeof payload.followUpReviewAcknowledgedAt === "string" &&
        !Number.isNaN(new Date(payload.followUpReviewAcknowledgedAt).getTime())
          ? new Date(payload.followUpReviewAcknowledgedAt)
          : null;
      const hasCompletedFollowUpRequiringReview = followUpTasks.some(
        task =>
          task.status === "completed" &&
          Boolean(task.completedAt) &&
          (!acknowledgedAt || task.completedAt! > acknowledgedAt)
      );
      if (input.collaboratorId !== undefined) {
        if (input.collaboratorId === null) {
          delete payload.collaboratorId;
          delete payload.collaboratorName;
        } else {
          const collaborator = (
            await db
              .select()
              .from(bphfInspectionEmployees)
              .where(eq(bphfInspectionEmployees.id, input.collaboratorId))
              .limit(1)
          )[0];
          if (!collaborator)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "O colaborador selecionado já não existe no catálogo BPHF.",
            });
          payload.collaboratorId = collaborator.id;
          payload.collaboratorName = collaborator.name;
        }
      }
      if (input.generatedNonconformity !== undefined) {
        payload.generatedNonconformity = input.generatedNonconformity;
        payload.treatmentDecision = input.generatedNonconformity
          ? "nc_generated"
          : "no_nc";
      }
      if (input.occurrenceNumber !== undefined)
        payload.nonconformityOccurrenceNumber =
          input.occurrenceNumber.trim() || null;
      if (input.fragileTreatmentReview !== undefined) {
        if (entry.module !== "fragile_items")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A revisão de periodicidade e risco só está disponível para incidências de Quebráveis.",
          });
        const fragileItemId = Number(payload.fragileItemId);
        if (!Number.isInteger(fragileItemId) || fragileItemId <= 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O ponto de Quebráveis associado à incidência não foi identificado.",
          });
        const fragileItem = (
          await db
            .select()
            .from(fragileItems)
            .where(eq(fragileItems.id, fragileItemId))
            .limit(1)
        )[0];
        if (!fragileItem)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "O ponto de Quebráveis associado já não existe.",
          });
        const review = input.fragileTreatmentReview;
        payload.fragileTreatmentReview = {
          itemId: fragileItem.id,
          previousPeriodicity: fragileItem.periodicity,
          previousRiskLevel: fragileItem.riskLevel,
          periodicity: review.periodicity,
          riskLevel: review.riskLevel,
          rationale: review.rationale?.trim() || "",
          reviewedAt: new Date().toISOString(),
          reviewedByProfileId: ctx.operatorProfile!.id,
          reviewedByName: ctx.operatorProfile!.name,
        };
        await db
          .update(fragileItems)
          .set({
            periodicity: review.periodicity,
            riskLevel: review.riskLevel,
            updatedBy: ctx.user!.openId,
            updatedByProfileId: ctx.operatorProfile!.id,
            updatedByName: ctx.operatorProfile!.name,
          })
          .where(eq(fragileItems.id, fragileItem.id));
      }
      if (input.treatment !== undefined) {
        if (
          !isManager &&
          (pendingFollowUpReviewAlertsFromPayload(payload).length ||
            hasCompletedFollowUpRequiringReview)
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "A revisão do tratamento após um seguimento concluído é da responsabilidade da Responsável de Qualidade.",
          });
        const correction = input.treatment.correction?.trim() || "";
        const responsible = input.treatment.responsible?.trim() || "";
        if (
          input.treatment.status === "completed" &&
          (!correction || !responsible || !input.treatment.completedAt)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Para concluir o tratamento, indique a correção, o responsável e a data de conclusão.",
          });
        }
        payload.incidenceTreatment = {
          status: input.treatment.status,
          correction,
          responsible,
          dueDate: input.treatment.dueDate ?? "",
          completedAt:
            input.treatment.status === "completed"
              ? input.treatment.completedAt
              : "",
          notes: input.treatment.notes?.trim() || "",
          evidencePhotos:
            input.treatment.evidencePhotos ??
            incidenceTreatmentFromPayload(payload).evidencePhotos ??
            [],
          updatedAt: new Date().toISOString(),
          updatedByProfileId: ctx.operatorProfile!.id,
          updatedByName: ctx.operatorProfile!.name,
        };
        if (
          pendingFollowUpReviewAlertsFromPayload(payload).length ||
          hasCompletedFollowUpRequiringReview
        ) {
          payload.followUpReviewAcknowledgedAt = new Date().toISOString();
          payload.followUpReviewAcknowledgedByProfileId =
            ctx.operatorProfile!.id;
          payload.followUpReviewAcknowledgedByName =
            ctx.operatorProfile!.name;
        }
      }
      if (input.evidencePhotos !== undefined)
        payload.evidencePhotos = input.evidencePhotos;
      if (input.occurredOn !== undefined) payload.occurredOn = input.occurredOn;
      const history = Array.isArray(payload.editHistory)
        ? payload.editHistory
        : [];
      payload.editHistory = [
        ...history,
        {
          action: "updated_incidence",
          at: new Date().toISOString(),
          byProfileId: ctx.operatorProfile!.id,
          byName: ctx.operatorProfile!.name,
          byTitle: ctx.operatorProfile!.title,
        },
      ];
      await db
        .update(controlEntries)
        .set({
          title: input.title ?? entry.title,
          area: input.area ?? entry.area,
          notes:
            input.notes === undefined
              ? entry.notes
              : input.notes.trim() || null,
          payload,
        })
        .where(eq(controlEntries.id, input.id));
      return { success: true };
    }),

  deleteIncidence: qualityManagerProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const entry = (
        await db
          .select()
          .from(controlEntries)
          .where(eq(controlEntries.id, input.id))
          .limit(1)
      )[0];
      if (!entry || entry.result !== "NC")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Incidência diária não encontrada.",
        });
      const payload =
        entry.payload &&
        typeof entry.payload === "object" &&
        !Array.isArray(entry.payload)
          ? ({ ...entry.payload } as Record<string, unknown>)
          : {};
      payload.deletedAt = new Date().toISOString();
      payload.deletedByProfileId = ctx.operatorProfile!.id;
      payload.deletedByName = ctx.operatorProfile!.name;
      await db
        .update(controlEntries)
        .set({ payload })
        .where(eq(controlEntries.id, input.id));
      return { success: true };
    }),

  createNonconformity: qualityOperatorProcedure
    .input(
      z.object({
        sourceEntryId: z.number().int().optional(),
        module: qualityModuleSchema,
        title: z.string().min(2).max(180),
        description: z.string().min(2).max(5000),
        area: z.string().min(2).max(120),
        factoryId: z.number().int().optional(),
        severity: z
          .enum(["critical", "high", "medium", "low"])
          .default("medium"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      if (input.sourceEntryId) {
        const source = (
          await db
            .select()
            .from(controlEntries)
            .where(eq(controlEntries.id, input.sourceEntryId))
            .limit(1)
        )[0];
        if (!source || source.result !== "NC")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Selecione uma incidência diária NC válida para associar à Não Conformidade.",
          });
        const existing = (
          await db
            .select()
            .from(nonconformities)
            .where(eq(nonconformities.sourceEntryId, source.id))
            .limit(1)
        )[0];
        if (existing)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Esta incidência já está associada a uma Não Conformidade.",
          });
      }
      await db
        .insert(nonconformities)
        .values({
          ...input,
          sourceEntryId: input.sourceEntryId ?? null,
          factoryId: input.factoryId ?? null,
          status: "open",
          detectedAt: new Date(),
          reportedByProfileId: ctx.operatorProfile!.id,
          reportedByName: ctx.operatorProfile!.name,
          reportedByTitle: ctx.operatorProfile!.title,
          createdBy: ctx.user!.openId,
        });
      return { success: true };
    }),

  listNcs: qualitySessionProcedure
    .input(
      z
        .object({
          factoryId: z.number().int().optional(),
          startDate: dateInput.optional(),
          endDate: dateInput.optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      if (
        input?.startDate &&
        input.endDate &&
        asDateRange(input.startDate).start > asDateRange(input.endDate).start
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A data final não pode ser anterior à data inicial.",
        });
      const start = input?.startDate
        ? asDateRange(input.startDate).start
        : null;
      const end = input?.endDate ? asDateRange(input.endDate).end : null;
      const ncs = await db
        .select()
        .from(nonconformities)
        .orderBy(desc(nonconformities.detectedAt));
      return scopeToFactory(ncs, input?.factoryId).filter(
        nc =>
          (!start || nc.detectedAt >= start) && (!end || nc.detectedAt < end)
      );
    }),

  dailyIncidences: qualitySessionProcedure
    .input(
      z
        .object({
          date: dateInput.optional(),
          factoryId: z.number().int().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const referenceDate = input?.date ?? new Date();
      const { start, end } = asDateRange(referenceDate);
      const [entries, factoryRows, ncRows] = await Promise.all([
        db
          .select()
          .from(controlEntries)
          .orderBy(desc(controlEntries.completedAt)),
        db.select().from(factories).orderBy(factories.name),
        db
          .select()
          .from(nonconformities)
          .orderBy(desc(nonconformities.detectedAt)),
      ]);
      const factoryNames = new Map(
        factoryRows.map(factory => [factory.id, factory.name])
      );
      const incidences = scopeToFactory(entries, input?.factoryId)
        .filter(entry => {
          const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? (entry.payload as Record<string, unknown>) : {};
          const occurredAt = incidenceOccurredAtFromPayload(payload, entry.completedAt);
          return entry.result === "NC" && occurredAt >= start && occurredAt < end;
        })
        .map(entry => {
          const linked = ncRows.find(nc => nc.sourceEntryId === entry.id);
          const payload =
            entry.payload &&
            typeof entry.payload === "object" &&
            !Array.isArray(entry.payload)
              ? (entry.payload as Record<string, unknown>)
              : {};
          const generatedNonconformity =
            Boolean(linked) || payload.generatedNonconformity === true;
          const treatmentDecision = incidenceDecisionFromPayload(
            payload,
            generatedNonconformity
          );
          const treatment = incidenceTreatmentFromPayload(payload);
          const followUpReviewAlerts =
            pendingFollowUpReviewAlertsFromPayload(payload);
          const occurredOn = incidenceOccurredOnFromPayload(payload, entry.completedAt);
          return {
            ...entry,
            detectedAt: incidenceOccurredAtFromPayload(payload, entry.completedAt),
            occurredOn,
            factoryName: entry.factoryId
              ? (factoryNames.get(entry.factoryId) ??
                "Fábrica não identificada")
              : "Sem fábrica/linha",
            generatedNonconformity,
            treatmentStatus: treatmentDecision,
            treatmentProgress: treatment.status,
            treatment,
            followUpReviewAlerts,
            nonconformityId: linked?.id ?? null,
          };
        });
      const grouped = new Map<string, number>();
      incidences.forEach(incidence =>
        grouped.set(
          incidence.factoryName,
          (grouped.get(incidence.factoryName) ?? 0) + 1
        )
      );
      return {
        date: start,
        total: incidences.length,
        byFactory: Array.from(grouped, ([factoryName, total]) => ({
          factoryName,
          total,
        })).sort((left, right) => right.total - left.total),
        incidences,
      };
    }),

  dailyIncidenceSummary: qualitySessionProcedure
    .input(
      z.object({
        date: dateInput,
        factoryId: z.number().int().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const { start, end } = asDateRange(input.date);
      const scopeId = input.factoryId ?? 0;
      const [entryRows, ncRows, factoryRows, savedNotes] = await Promise.all([
        db
          .select()
          .from(controlEntries)
          .orderBy(desc(controlEntries.completedAt)),
        db
          .select()
          .from(nonconformities)
          .orderBy(desc(nonconformities.detectedAt)),
        db.select().from(factories).orderBy(factories.name),
        db
          .select()
          .from(dailyIncidenceSummaries)
          .where(
            and(
              eq(dailyIncidenceSummaries.referenceDate, start),
              eq(dailyIncidenceSummaries.factoryId, scopeId)
            )
          )
          .limit(1),
      ]);
      const factoryNames = new Map(
        factoryRows.map(factory => [factory.id, factory.name])
      );
      const scopedEntries = entryRows
        .filter(
          entry => !input.factoryId || entry.factoryId === input.factoryId
        )
        .filter(entry => {
          const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? (entry.payload as Record<string, unknown>) : {};
          const occurredAt = incidenceOccurredAtFromPayload(payload, entry.completedAt);
          return entry.result === "NC" && occurredAt >= start && occurredAt < end;
        });
      const scopedNcs = ncRows
        .filter(nc => !input.factoryId || nc.factoryId === input.factoryId)
        .filter(nc => nc.detectedAt >= start && nc.detectedAt < end);
      const incidences = scopedEntries.map(entry => {
        const linked =
          scopedNcs.find(nc => nc.sourceEntryId === entry.id) ??
          scopedNcs.find(
            nc =>
              !nc.sourceEntryId &&
              nc.module === entry.module &&
              nc.factoryId === entry.factoryId &&
              nc.area === entry.area
          );
        const payload =
          entry.payload &&
          typeof entry.payload === "object" &&
          !Array.isArray(entry.payload)
            ? (entry.payload as Record<string, unknown>)
            : {};
        const generatedNonconformity =
          Boolean(linked) || payload.generatedNonconformity === true;
        const treatmentDecision = incidenceDecisionFromPayload(
          payload,
          generatedNonconformity
        );
        const treatment = incidenceTreatmentFromPayload(payload);
        const occurredOn = incidenceOccurredOnFromPayload(payload, entry.completedAt);
        return {
          id: entry.id,
          title: entry.title,
          module: entry.module,
          area: entry.area,
          factoryId: entry.factoryId,
          factoryName: entry.factoryId
            ? (factoryNames.get(entry.factoryId) ?? "Fábrica não identificada")
            : "Sem fábrica/linha",
          completedAt: entry.completedAt,
          occurredOn,
          notes: entry.notes,
          registeredByName: entry.registeredByName,
          registeredByTitle: entry.registeredByTitle,
          generatedNonconformity,
          treatmentStatus: treatmentDecision,
          treatmentProgress: treatment.status,
          treatmentDecision,
          treatment,
          nonconformityId: linked?.id ?? null,
          nonconformitySeverity: linked?.severity ?? null,
          nonconformityStatus: linked?.status ?? null,
        };
      });
      const pendingTreatment = incidences.filter(
        item => item.treatmentProgress === "pending"
      ).length;
      return {
        date: start,
        total: incidences.length,
        withNonconformity: incidences.filter(
          item => item.generatedNonconformity
        ).length,
        withoutNonconformity: incidences.filter(
          item => item.treatmentDecision === "no_nc"
        ).length,
        pendingTreatment,
        note: savedNotes[0]?.note ?? "",
        noteUpdatedByName: savedNotes[0]?.updatedByName ?? null,
        noteUpdatedAt: savedNotes[0]?.updatedAt ?? null,
        incidences,
      };
    }),

  saveDailyIncidenceNote: qualityOperatorProcedure
    .input(
      z.object({
        date: dateInput,
        factoryId: z.number().int().optional(),
        note: z.string().max(4000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const factoryId = input.factoryId ?? 0;
      await db
        .insert(dailyIncidenceSummaries)
        .values({
          referenceDate: asDateRange(input.date).start,
          factoryId,
          note: input.note.trim(),
          updatedByProfileId: ctx.operatorProfile!.id,
          updatedByName: ctx.operatorProfile!.name,
          updatedByTitle: ctx.operatorProfile!.title,
          createdBy: ctx.user!.openId,
        })
        .onDuplicateKeyUpdate({
          set: {
            note: input.note.trim(),
            updatedByProfileId: ctx.operatorProfile!.id,
            updatedByName: ctx.operatorProfile!.name,
            updatedByTitle: ctx.operatorProfile!.title,
          },
        });
      return { success: true };
    }),

  updateNc: qualitySessionProcedure
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum([
          "open",
          "in_progress",
          "awaiting_validation",
          "closed",
        ]),
        assignedTo: z.string().max(120).optional(),
        dueAt: dateInput.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        input.status === "closed" &&
        ctx.operatorProfile?.role !== "manager"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Apenas a Responsável de Qualidade pode fechar não conformidades.",
        });
      }
      const db = await requireDb();
      const validatorName =
        ctx.user.name?.trim() || ctx.user.email?.trim() || ctx.user.openId;
      await db
        .update(nonconformities)
        .set({
          status: input.status,
          assignedTo: input.assignedTo,
          dueAt: input.dueAt,
          validatedBy: input.status === "closed" ? validatorName : null,
          validatedByOpenId: input.status === "closed" ? ctx.user.openId : null,
          closedAt: input.status === "closed" ? new Date() : null,
        })
        .where(eq(nonconformities.id, input.id));
      return { success: true };
    }),

  addCorrectiveAction: qualitySessionProcedure
    .input(
      z.object({
        nonconformityId: z.number().int(),
        actionType: z.enum(["correction", "corrective"]),
        description: z.string().min(3).max(3000),
        responsible: z.string().min(2).max(120),
        dueAt: dateInput.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const parentNc = (
        await db
          .select()
          .from(nonconformities)
          .where(eq(nonconformities.id, input.nonconformityId))
          .limit(1)
      )[0];
      if (!parentNc)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Não conformidade não encontrada.",
        });
      await db
        .insert(correctiveActions)
        .values({
          ...input,
          factoryId: parentNc.factoryId,
          createdBy: ctx.user.openId,
          status: "pending",
        });
      await db
        .update(nonconformities)
        .set({ status: "in_progress" })
        .where(eq(nonconformities.id, input.nonconformityId));
      return { success: true };
    }),

  listActions: qualitySessionProcedure
    .input(z.object({ nonconformityId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db
        .select()
        .from(correctiveActions)
        .where(eq(correctiveActions.nonconformityId, input.nonconformityId))
        .orderBy(desc(correctiveActions.createdAt));
    }),

  completeAction: qualitySessionProcedure
    .input(
      z.object({ id: z.number().int(), notes: z.string().max(3000).optional() })
    )
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db
        .update(correctiveActions)
        .set({
          status: "completed",
          completedAt: new Date(),
          completionNotes: input.notes ?? null,
        })
        .where(eq(correctiveActions.id, input.id));
      return { success: true };
    }),

  uploadEvidence: qualitySessionProcedure
    .input(
      z.object({
        nonconformityId: z.number().int().optional(),
        correctiveActionId: z.number().int().optional(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(3).max(120),
        dataUrl: z.string().min(20).max(7_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const base64 = input.dataUrl.split(",")[1];
      if (!base64)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Anexo inválido.",
        });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `quality-evidence/${ctx.user.id}/${Date.now()}-${safeName}`;
      const { key: fileKey, url } = await storagePut(
        key,
        Buffer.from(base64, "base64"),
        input.mimeType
      );
      await db.insert(evidences).values({
        nonconformityId: input.nonconformityId ?? null,
        correctiveActionId: input.correctiveActionId ?? null,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileKey,
        url,
        uploadedBy: ctx.user.openId,
      });
      return { success: true, url };
    }),

  listEvidences: qualitySessionProcedure
    .input(z.object({ nonconformityId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const actions = await db
        .select()
        .from(correctiveActions)
        .where(eq(correctiveActions.nonconformityId, input.nonconformityId));
      const direct = await db
        .select()
        .from(evidences)
        .where(eq(evidences.nonconformityId, input.nonconformityId));
      if (!actions.length) return direct;
      const actionEvidence = await db
        .select()
        .from(evidences)
        .where(
          inArray(
            evidences.correctiveActionId,
            actions.map(action => action.id)
          )
        );
      return [...direct, ...actionEvidence].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    }),

  listChecklistAreas: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const [areaRows, itemRows, itemAreas] = await Promise.all([
      db.select().from(checklistAreas).orderBy(checklistAreas.name),
      db.select().from(checklistItems),
      db.select().from(checklistItemAreas),
    ]);
    const activeItemIds = new Set(
      itemRows.filter(item => item.active === "true").map(item => item.id)
    );
    const itemCountByAreaId = new Map<number, number>();
    itemAreas.forEach(assignment => {
      if (!activeItemIds.has(assignment.checklistItemId)) return;
      itemCountByAreaId.set(
        assignment.checklistAreaId,
        (itemCountByAreaId.get(assignment.checklistAreaId) ?? 0) + 1
      );
    });
    return areaRows
      .filter(area => area.active === "true")
      .map(area => ({
        id: area.id,
        name: area.name,
        itemCount: itemCountByAreaId.get(area.id) ?? 0,
      }));
  }),

  addChecklistArea: qualityManagerProcedure
    .input(z.object({ name: z.string().min(2).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const name = normalizeChecklistAreaName(input.name);
      await ensureChecklistArea(db, name, ctx.user!.openId);
      return { success: true, name };
    }),

  updateChecklistArea: qualityManagerProcedure
    .input(z.object({ id: z.number().int(), name: z.string().min(2).max(120) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const current = await db
        .select()
        .from(checklistAreas)
        .where(eq(checklistAreas.id, input.id))
        .limit(1);
      if (!current[0])
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A Área/Zona selecionada não existe.",
        });
      const name = normalizeChecklistAreaName(input.name);
      const duplicate = await db
        .select()
        .from(checklistAreas)
        .where(eq(checklistAreas.name, name))
        .limit(1);
      if (duplicate[0] && duplicate[0].id !== input.id)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Já existe uma Área/Zona com esse nome.",
        });
      await db
        .update(checklistAreas)
        .set({ name })
        .where(eq(checklistAreas.id, input.id));
      await db
        .update(checklistItems)
        .set({ area: name })
        .where(eq(checklistItems.area, current[0].name));
      return { success: true, name };
    }),

  removeChecklistArea: qualityManagerProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const current = await db
        .select()
        .from(checklistAreas)
        .where(eq(checklistAreas.id, input.id))
        .limit(1);
      if (!current[0])
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A Área/Zona selecionada não existe.",
        });
      const [linkedAssignments, linkedItems] = await Promise.all([
        db
          .select()
          .from(checklistItemAreas)
          .where(eq(checklistItemAreas.checklistAreaId, input.id)),
        db.select().from(checklistItems),
      ]);
      const linkedItemIds = new Set(
        linkedAssignments.map(assignment => assignment.checklistItemId)
      );
      if (
        linkedItems.some(
          item => linkedItemIds.has(item.id) && item.active === "true"
        )
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Não é possível eliminar uma Área/Zona com pontos associados. Edite ou elimine primeiro os pontos dessa área.",
        });
      await db
        .update(checklistAreas)
        .set({ active: "false" })
        .where(eq(checklistAreas.id, input.id));
      return { success: true };
    }),

  listChecklistItems: qualitySessionProcedure
    .input(z.object({ factoryId: z.number().int().min(1).max(3) }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const [items, factoryAssignments, areaAssignments, areaRows] =
        await Promise.all([
          db
            .select()
            .from(checklistItems)
            .orderBy(checklistItems.area, checklistItems.sortOrder),
          db.select().from(checklistItemFactories),
          db.select().from(checklistItemAreas),
          db.select().from(checklistAreas),
        ]);
      const areaNameById = new Map(areaRows.map(area => [area.id, area.name]));
      return items
        .map(item => {
          const areaNames = areaAssignments
            .filter(assignment => assignment.checklistItemId === item.id)
            .map(assignment => areaNameById.get(assignment.checklistAreaId))
            .filter((name): name is string => Boolean(name));
          const resolvedAreaNames = areaNames.length ? areaNames : [item.area];
          return {
            ...item,
            area: resolvedAreaNames[0],
            areaNames: resolvedAreaNames,
            factoryIds: factoryAssignments
              .filter(assignment => assignment.checklistItemId === item.id)
              .map(assignment => assignment.factoryId),
          };
        })
        .filter(
          item =>
            item.active === "true" &&
            (!input?.factoryId || item.factoryIds.includes(input.factoryId))
        );
    }),

  addChecklistItem: qualityManagerProcedure
    .input(
      z.object({
        factoryIds: z.array(z.number().int().min(1).max(3)).min(1),
        areaNames: z.array(z.string().min(2).max(120)).min(1),
        label: z.string().min(3).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const factoryIds = Array.from(new Set(input.factoryIds));
      const areaNames = Array.from(
        new Set(input.areaNames.map(normalizeChecklistAreaName))
      );
      const areaIds = await Promise.all(
        areaNames.map(name => ensureChecklistArea(db, name, ctx.user!.openId))
      );
      const inserted = await db
        .insert(checklistItems)
        .values({
          factoryId: factoryIds[0],
          area: areaNames[0],
          label: input.label.trim(),
          createdBy: ctx.user!.openId,
          sortOrder: 100,
          active: "true",
        })
        .$returningId();
      await db
        .insert(checklistItemFactories)
        .values(
          factoryIds.map(factoryId => ({
            checklistItemId: inserted[0]!.id,
            factoryId,
          }))
        );
      await db
        .insert(checklistItemAreas)
        .values(
          areaIds.map(checklistAreaId => ({
            checklistItemId: inserted[0]!.id,
            checklistAreaId,
          }))
        );
      return { success: true };
    }),

  updateChecklistItem: qualityManagerProcedure
    .input(
      z.object({
        id: z.number().int(),
        factoryIds: z.array(z.number().int().min(1).max(3)).min(1),
        areaNames: z.array(z.string().min(2).max(120)).min(1),
        label: z.string().min(3).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const factoryIds = Array.from(new Set(input.factoryIds));
      const areaNames = Array.from(
        new Set(input.areaNames.map(normalizeChecklistAreaName))
      );
      const areaIds = await Promise.all(
        areaNames.map(name => ensureChecklistArea(db, name, ctx.user!.openId))
      );
      await db
        .update(checklistItems)
        .set({
          factoryId: factoryIds[0],
          area: areaNames[0],
          label: input.label.trim(),
        })
        .where(eq(checklistItems.id, input.id));
      await db
        .delete(checklistItemFactories)
        .where(eq(checklistItemFactories.checklistItemId, input.id));
      await db
        .insert(checklistItemFactories)
        .values(
          factoryIds.map(factoryId => ({
            checklistItemId: input.id,
            factoryId,
          }))
        );
      await db
        .delete(checklistItemAreas)
        .where(eq(checklistItemAreas.checklistItemId, input.id));
      await db
        .insert(checklistItemAreas)
        .values(
          areaIds.map(checklistAreaId => ({
            checklistItemId: input.id,
            checklistAreaId,
          }))
        );
      return { success: true };
    }),

  removeChecklistItem: qualityManagerProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db
        .delete(checklistItemFactories)
        .where(eq(checklistItemFactories.checklistItemId, input.id));
      await db.delete(checklistItems).where(eq(checklistItems.id, input.id));
      return { success: true };
    }),

  monthlyChecklistProgress: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [
      items,
      factoryAssignments,
      areaAssignments,
      areaRows,
      entries,
      monthlyFactories,
    ] = await Promise.all([
      db.select().from(checklistItems),
      db.select().from(checklistItemFactories),
      db.select().from(checklistItemAreas),
      db.select().from(checklistAreas),
      db
        .select()
        .from(controlEntries)
        .where(eq(controlEntries.module, "monthly_checklist")),
      db.select().from(factories),
    ]);
    const monthEntries = entries.filter(
      entry =>
        entry.completedAt >= startOfMonth &&
        entry.completedAt < startOfNextMonth
    );
    const areaNameById = new Map(areaRows.map(area => [area.id, area.name]));
    return monthlyFactories
      .filter(factory => [1, 2, 3].includes(factory.id))
      .map(factory => {
        const factoryItems = items.filter(
          item =>
            factoryAssignments.some(
              assignment =>
                assignment.checklistItemId === item.id &&
                assignment.factoryId === factory.id
            ) && item.active === "true"
        );
        const plannedChecks = Array.from(
          new Set(
            factoryItems.flatMap(item => {
              const itemAreaNames = areaAssignments
                .filter(assignment => assignment.checklistItemId === item.id)
                .map(assignment => areaNameById.get(assignment.checklistAreaId))
                .filter((name): name is string => Boolean(name));
              return (itemAreaNames.length ? itemAreaNames : [item.area]).map(
                areaName => `${item.id}:${areaName}`
              );
            })
          )
        );
        const completedChecks = new Set(
          monthEntries
            .filter(entry => entry.factoryId === factory.id)
            .map(entry => {
              const itemId = Number(
                (entry.payload as Record<string, unknown>)?.checklistItemId
              );
              return itemId && entry.area ? `${itemId}:${entry.area}` : null;
            })
            .filter((key): key is string => Boolean(key))
        );
        const checksByArea = new Map<string, string[]>();
        plannedChecks.forEach(check => {
          const areaName = check.slice(check.indexOf(":") + 1);
          checksByArea.set(areaName, [
            ...(checksByArea.get(areaName) ?? []),
            check,
          ]);
        });
        const areaProgress = Array.from(checksByArea.entries())
          .map(([areaName, checks]) => {
            const completed = checks.filter(check =>
              completedChecks.has(check)
            ).length;
            return {
              areaName,
              total: checks.length,
              completed,
              minimumMet: completed > 0,
            };
          })
          .sort((left, right) =>
            left.areaName.localeCompare(right.areaName, "pt-PT")
          );
        const completed = areaProgress.filter(area => area.minimumMet).length;
        return {
          factoryId: factory.id,
          factoryName: factory.name,
          total: areaProgress.length,
          completed,
          percentage: areaProgress.length
            ? Math.round((completed / areaProgress.length) * 100)
            : 0,
          areas: areaProgress,
        };
      });
  }),

  listFragileAreas: qualitySessionProcedure
    .input(z.object({ factoryId: z.number().int().optional() }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const catalog = await db
        .select()
        .from(fragileAreas)
        .orderBy(fragileAreas.name);
      return catalog.filter(
        area =>
          area.active === "true" &&
          (!input?.factoryId || area.factoryId === input.factoryId)
      );
    }),

  listFragileItems: qualitySessionProcedure
    .input(
      z
        .object({
          factoryId: z.number().int().optional(),
          periodicity: z.enum(["D", "S", "Q", "M"]).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const [items, entries] = await Promise.all([
        db
          .select()
          .from(fragileItems)
          .orderBy(
            fragileItems.location,
            fragileItems.sortOrder,
            fragileItems.name
          ),
        db
          .select()
          .from(controlEntries)
          .where(eq(controlEntries.module, "fragile_items"))
          .orderBy(desc(controlEntries.completedAt)),
      ]);
      const lastInspections = new Map<number, Date>();
      entries.forEach(entry => {
        const payload = entry.payload;
        const itemId =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as { fragileItemId?: unknown }).fragileItemId
            : null;
        if (typeof itemId === "number" && !isDeletedControlEntry(entry)) {
          const inspectionAt = fragileInspectionAt(entry);
          const latestInspection = lastInspections.get(itemId);
          if (!latestInspection || inspectionAt > latestInspection)
            lastInspections.set(itemId, inspectionAt);
        }
      });
      const now = new Date();
      return items
        .filter(
          item =>
            item.status === "active" &&
            (!input?.factoryId || item.factoryId === input.factoryId) &&
            (!input?.periodicity || item.periodicity === input.periodicity)
        )
        .map(item => {
          const lastInspectionAt = lastInspections.get(item.id) ?? null;
          const nextReferenceDate = lastInspectionAt
            ? businessDayAfter(lastInspectionAt)
            : now;
          return {
            ...item,
            lastInspectionAt,
            nextInspectionAt: fragileInspectionDueDate(
              item.periodicity,
              lastInspectionAt,
              nextReferenceDate
            ),
          };
        });
    }),

  fragilePending: qualitySessionProcedure
    .input(
      z
        .object({
        factoryId: z.number().int().optional(),
        periodicity: z.enum(["D", "S", "Q", "M"]).optional(),
        referenceDate: z.coerce.date().optional(),
        plannedTaskId: z.number().int().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const [items, entries] = await Promise.all([
        db
          .select()
          .from(fragileItems)
          .orderBy(
            fragileItems.location,
            fragileItems.sortOrder,
            fragileItems.name
          ),
        db
          .select()
          .from(controlEntries)
          .where(eq(controlEntries.module, "fragile_items"))
          .orderBy(desc(controlEntries.completedAt)),
      ]);
      const lastInspections = new Map<number, Date>();
      entries.forEach(entry => {
        const payload = entry.payload;
        const fragileItemId =
          payload && typeof payload === "object" && !Array.isArray(payload)
            ? (payload as { fragileItemId?: unknown }).fragileItemId
            : null;
        if (typeof fragileItemId === "number" && !isDeletedControlEntry(entry)) {
          const inspectionAt = fragileInspectionAt(entry);
          const latestInspection = lastInspections.get(fragileItemId);
          if (!latestInspection || inspectionAt > latestInspection)
            lastInspections.set(fragileItemId, inspectionAt);
        }
      });
      const referenceDate = input?.referenceDate ?? new Date();
      const plannedTask = input?.plannedTaskId
        ? (await db.select().from(controlTasks).where(eq(controlTasks.id, input.plannedTaskId)).limit(1))[0]
        : null;
      const entriesForPlannedTask = plannedTask
        ? new Set(entries.filter(entry => Number(entryPayload(entry).plannedTaskId) === plannedTask.id)
            .map(entry => Number(entryPayload(entry).fragileItemId)))
        : null;
      const referenceDateKey = localDateKey(referenceDate);
      const lastInspectionsBeforeReference = new Map<number, Date>();
      if (plannedTask) {
        entries.forEach(entry => {
          const itemId = Number(entryPayload(entry).fragileItemId);
          if (!Number.isInteger(itemId) || fragileInspectionOperationalDate(entry) >= referenceDateKey) return;
          const inspectionAt = fragileInspectionAt(entry);
          const current = lastInspectionsBeforeReference.get(itemId);
          if (!current || inspectionAt > current) lastInspectionsBeforeReference.set(itemId, inspectionAt);
        });
      }
      return items
        .filter(
          item =>
            item.status === "active" &&
            (!input?.factoryId || item.factoryId === input.factoryId) &&
            (!input?.periodicity || item.periodicity === input.periodicity)
        )
        .map(item => {
          const lastInspectionAt = (plannedTask ? lastInspectionsBeforeReference.get(item.id) : lastInspections.get(item.id)) ?? null;
          const completedForPlannedTask = entriesForPlannedTask?.has(item.id) ?? false;
          return {
            ...item,
            lastInspectionAt,
            completedForPlannedTask,
            dueAt: fragileInspectionDueDate(
              item.periodicity,
              lastInspectionAt,
              referenceDate
            ),
            delayDays: fragileInspectionDelayDays(
              item.periodicity,
              lastInspectionAt,
              referenceDate
            ),
          };
        })
        .filter(item =>
          !item.completedForPlannedTask &&
          isFragileInspectionPending(
            item.periodicity,
            item.lastInspectionAt,
            referenceDate
          )
        )
        .sort(
          (left, right) =>
            (left.lastInspectionAt?.getTime() ?? 0) -
            (right.lastInspectionAt?.getTime() ?? 0)
        );
    }),

  fragileInspectionHistory: qualitySessionProcedure
    .input(z.object({ itemId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const entries = await db
        .select()
        .from(controlEntries)
        .where(eq(controlEntries.module, "fragile_items"))
        .orderBy(desc(controlEntries.completedAt));
      return entries
        .filter(entry => {
          const payload =
            entry.payload &&
            typeof entry.payload === "object" &&
            !Array.isArray(entry.payload)
              ? (entry.payload as Record<string, unknown>)
              : {};
          return (
            payload.deletedAt === undefined &&
            payload.fragileItemId === input.itemId
          );
        })
        .map(entry => {
          const payload =
            entry.payload &&
            typeof entry.payload === "object" &&
            !Array.isArray(entry.payload)
              ? (entry.payload as Record<string, unknown>)
              : {};
          const storedState =
            payload.state === "Íntegro" ||
            payload.state === "Danificado" ||
            payload.state === "Em falta"
              ? (payload.state as FragileState)
              : null;
          const normalizedState =
            fragileStateFromResult(entry.result, storedState) ?? "Íntegro";
          const evidencePhotos =
            normalizedState === "Íntegro"
              ? []
              : Array.isArray(payload.evidencePhotos)
                ? payload.evidencePhotos
                : [];
          return {
            id: entry.id,
            state: normalizedState,
            result: entry.result,
            notes: normalizedState === "Íntegro" ? null : entry.notes,
            completedAt: entry.completedAt,
            registeredByName: entry.registeredByName,
            registeredByTitle: entry.registeredByTitle,
            evidencePhotos,
          };
        });
    }),

  addFragileItem: qualityOperatorProcedure
    .input(
      z.object({
        name: z.string().min(2).max(180),
        location: z.string().min(2).max(120),
        factoryId: z.number().int().optional(),
        periodicity: z.enum(["D", "S", "Q", "M"]).default("M"),
        itemType: z.enum(["Vidro", "Plástico rígido", "Outro"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      if (!input.factoryId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Selecione uma fábrica e uma área antes de criar o ponto de controlo.",
        });
      const area = (
        await db
          .select()
          .from(fragileAreas)
          .where(
            and(
              eq(fragileAreas.factoryId, input.factoryId),
              eq(fragileAreas.name, input.location),
              eq(fragileAreas.active, "true")
            )
          )
          .limit(1)
      )[0];
      if (!area)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Selecione uma área ativa da fábrica para criar o ponto de controlo.",
        });
      await db.insert(fragileItems).values({
        ...input,
        factoryId: input.factoryId ?? null,
        status: "active",
        createdBy: ctx.user!.openId,
        createdByProfileId: ctx.operatorProfile!.id,
        createdByName: ctx.operatorProfile!.name,
        updatedBy: ctx.user!.openId,
        updatedByProfileId: ctx.operatorProfile!.id,
        updatedByName: ctx.operatorProfile!.name,
      });
      return { success: true };
    }),

  updateFragileItem: qualityOperatorProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(2).max(180),
        location: z.string().min(2).max(120),
        factoryId: z.number().int().nullable(),
        periodicity: z.enum(["D", "S", "Q", "M"]),
        itemType: z.enum(["Vidro", "Plástico rígido", "Outro"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const item = (
        await db
          .select()
          .from(fragileItems)
          .where(eq(fragileItems.id, input.id))
          .limit(1)
      )[0];
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ponto de controlo não encontrado.",
        });
      if (!input.factoryId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Selecione a fábrica e uma área ativa para o ponto de controlo.",
        });
      const area = (
        await db
          .select()
          .from(fragileAreas)
          .where(
            and(
              eq(fragileAreas.factoryId, input.factoryId),
              eq(fragileAreas.name, input.location),
              eq(fragileAreas.active, "true")
            )
          )
          .limit(1)
      )[0];
      if (!area)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Selecione uma área ativa da fábrica para o ponto de controlo.",
        });
      await db
        .update(fragileItems)
        .set({
          name: input.name,
          location: input.location,
          factoryId: input.factoryId,
          periodicity: input.periodicity,
          itemType: input.itemType,
          updatedBy: ctx.user!.openId,
          updatedByProfileId: ctx.operatorProfile!.id,
          updatedByName: ctx.operatorProfile!.name,
        })
        .where(eq(fragileItems.id, input.id));
      return { success: true };
    }),

  renameFragileArea: qualityOperatorProcedure
    .input(
      z.object({
        factoryId: z.number().int(),
        currentName: z.string().trim().min(2).max(120),
        nextName: z.string().trim().min(2).max(120),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      if (input.currentName === input.nextName)
        return { success: true, updated: 0 };
      const [sourceArea, targetArea] = await Promise.all([
        db
          .select()
          .from(fragileAreas)
          .where(
            and(
              eq(fragileAreas.factoryId, input.factoryId),
              eq(fragileAreas.name, input.currentName),
              eq(fragileAreas.active, "true")
            )
          )
          .limit(1),
        db
          .select()
          .from(fragileAreas)
          .where(
            and(
              eq(fragileAreas.factoryId, input.factoryId),
              eq(fragileAreas.name, input.nextName),
              eq(fragileAreas.active, "true")
            )
          )
          .limit(1),
      ]);
      if (!sourceArea[0])
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Área de Quebráveis não encontrada na fábrica selecionada.",
        });
      if (targetArea[0])
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Já existe uma área com esta designação. Utilize Fundir áreas se pretender juntar os pontos.",
        });
      const matchingItems = await db
        .select()
        .from(fragileItems)
        .where(
          and(
            eq(fragileItems.factoryId, input.factoryId),
            eq(fragileItems.location, input.currentName),
            eq(fragileItems.status, "active")
          )
        );
      await db
        .update(fragileAreas)
        .set({
          name: input.nextName,
          updatedBy: ctx.user!.openId,
          updatedByProfileId: ctx.operatorProfile!.id,
          updatedByName: ctx.operatorProfile!.name,
        })
        .where(eq(fragileAreas.id, sourceArea[0].id));
      await db
        .update(fragileItems)
        .set({
          location: input.nextName,
          updatedBy: ctx.user!.openId,
          updatedByProfileId: ctx.operatorProfile!.id,
          updatedByName: ctx.operatorProfile!.name,
        })
        .where(
          and(
            eq(fragileItems.factoryId, input.factoryId),
            eq(fragileItems.location, input.currentName),
            eq(fragileItems.status, "active")
          )
        );
      return { success: true, updated: matchingItems.length };
    }),

  createFragileArea: qualityOperatorProcedure
    .input(
      z.object({
        factoryId: z.number().int(),
        name: z.string().trim().min(2).max(120),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const existing = (
        await db
          .select()
          .from(fragileAreas)
          .where(
            and(
              eq(fragileAreas.factoryId, input.factoryId),
              eq(fragileAreas.name, input.name)
            )
          )
          .limit(1)
      )[0];
      if (existing?.active === "true")
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Já existe uma área com esta designação na fábrica selecionada.",
        });
      const audit = {
        updatedBy: ctx.user!.openId,
        updatedByProfileId: ctx.operatorProfile!.id,
        updatedByName: ctx.operatorProfile!.name,
      };
      if (existing) {
        await db
          .update(fragileAreas)
          .set({ active: "true", ...audit })
          .where(eq(fragileAreas.id, existing.id));
        return { success: true, reactivated: true };
      }
      await db
        .insert(fragileAreas)
        .values({
          factoryId: input.factoryId,
          name: input.name,
          active: "true",
          createdBy: ctx.user!.openId,
          createdByProfileId: ctx.operatorProfile!.id,
          createdByName: ctx.operatorProfile!.name,
          ...audit,
        });
      return { success: true, reactivated: false };
    }),

  deleteFragileArea: qualityOperatorProcedure
    .input(
      z.object({
        factoryId: z.number().int(),
        name: z.string().trim().min(2).max(120),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const area = (
        await db
          .select()
          .from(fragileAreas)
          .where(
            and(
              eq(fragileAreas.factoryId, input.factoryId),
              eq(fragileAreas.name, input.name),
              eq(fragileAreas.active, "true")
            )
          )
          .limit(1)
      )[0];
      if (!area)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Área de Quebráveis não encontrada na fábrica selecionada.",
        });
      const activeItems = await db
        .select()
        .from(fragileItems)
        .where(
          and(
            eq(fragileItems.factoryId, input.factoryId),
            eq(fragileItems.location, input.name),
            eq(fragileItems.status, "active")
          )
        );
      if (activeItems.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Não é possível eliminar esta área porque contém ${activeItems.length} ${activeItems.length === 1 ? "ponto ativo" : "pontos ativos"}. Transfira-os com Fundir áreas ou elimine os pontos primeiro.`,
        });
      await db
        .update(fragileAreas)
        .set({
          active: "false",
          updatedBy: ctx.user!.openId,
          updatedByProfileId: ctx.operatorProfile!.id,
          updatedByName: ctx.operatorProfile!.name,
        })
        .where(eq(fragileAreas.id, area.id));
      return { success: true };
    }),

  mergeFragileAreas: qualityOperatorProcedure
    .input(
      z.object({
        factoryId: z.number().int(),
        sourceArea: z.string().trim().min(2).max(120),
        targetArea: z.string().trim().min(2).max(120),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.sourceArea === input.targetArea)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione duas áreas diferentes para fundir.",
        });
      const db = await requireDb();
      const [sourceItems, targetItems, sourceArea, targetArea] =
        await Promise.all([
          db
            .select()
            .from(fragileItems)
            .where(
              and(
                eq(fragileItems.factoryId, input.factoryId),
                eq(fragileItems.location, input.sourceArea),
                eq(fragileItems.status, "active")
              )
            ),
          db
            .select()
            .from(fragileItems)
            .where(
              and(
                eq(fragileItems.factoryId, input.factoryId),
                eq(fragileItems.location, input.targetArea),
                eq(fragileItems.status, "active")
              )
            ),
          db
            .select()
            .from(fragileAreas)
            .where(
              and(
                eq(fragileAreas.factoryId, input.factoryId),
                eq(fragileAreas.name, input.sourceArea),
                eq(fragileAreas.active, "true")
              )
            )
            .limit(1),
          db
            .select()
            .from(fragileAreas)
            .where(
              and(
                eq(fragileAreas.factoryId, input.factoryId),
                eq(fragileAreas.name, input.targetArea),
                eq(fragileAreas.active, "true")
              )
            )
            .limit(1),
        ]);
      if (!sourceArea[0])
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A área de origem não existe na fábrica selecionada.",
        });
      if (!targetArea[0])
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A área de destino tem de existir na fábrica selecionada.",
        });
      await db
        .update(fragileItems)
        .set({
          location: input.targetArea,
          updatedBy: ctx.user!.openId,
          updatedByProfileId: ctx.operatorProfile!.id,
          updatedByName: ctx.operatorProfile!.name,
        })
        .where(
          and(
            eq(fragileItems.factoryId, input.factoryId),
            eq(fragileItems.location, input.sourceArea),
            eq(fragileItems.status, "active")
          )
        );
      await db
        .update(fragileAreas)
        .set({
          active: "false",
          updatedBy: ctx.user!.openId,
          updatedByProfileId: ctx.operatorProfile!.id,
          updatedByName: ctx.operatorProfile!.name,
        })
        .where(eq(fragileAreas.id, sourceArea[0].id));
      return { success: true, updated: sourceItems.length };
    }),

  uploadFragileReferenceImage: qualityOperatorProcedure
    .input(
      z.object({
        itemId: z.number().int(),
        fileName: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        dataUrl: z.string().min(20).max(7_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const item = (
        await db
          .select()
          .from(fragileItems)
          .where(eq(fragileItems.id, input.itemId))
          .limit(1)
      )[0];
      if (!item)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ponto de controlo não encontrado.",
        });
      const base64 = input.dataUrl.split(",")[1];
      if (!base64)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Imagem inválida.",
        });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `fragile-reference/${input.itemId}/${Date.now()}-${safeName}`;
      const { key: referenceImageKey, url: referenceImageUrl } =
        await storagePut(key, Buffer.from(base64, "base64"), input.mimeType);
      await db
        .update(fragileItems)
        .set({
          referenceImageKey,
          referenceImageUrl,
          referenceImageName: input.fileName,
          updatedBy: ctx.user!.openId,
          updatedByProfileId: ctx.operatorProfile!.id,
          updatedByName: ctx.operatorProfile!.name,
        })
        .where(eq(fragileItems.id, input.itemId));
      return { success: true, url: referenceImageUrl };
    }),

  uploadFragileInspectionEvidence: qualityOperatorProcedure
    .input(
      z.object({
        itemId: z.number().int(),
        fileName: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        dataUrl: z.string().min(20).max(7_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const item = (
        await db
          .select()
          .from(fragileItems)
          .where(eq(fragileItems.id, input.itemId))
          .limit(1)
      )[0];
      if (!item || item.status !== "active")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ponto de controlo não encontrado.",
        });
      await requireControlAuthorization(db, {
        module: "fragile_items",
        factoryId: item.factoryId,
        profile: ctx.operatorProfile!,
      });
      const base64 = input.dataUrl.split(",")[1];
      if (!base64)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Imagem inválida.",
        });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { key, url } = await storagePut(
        `fragile-evidence/${input.itemId}/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`,
        Buffer.from(base64, "base64"),
        input.mimeType
      );
      return {
        success: true,
        key,
        url,
        fileName: input.fileName,
        mimeType: input.mimeType,
      };
    }),

  uploadVerificationEvidence: qualityOperatorProcedure
    .input(
      z.object({
        module: qualityModuleSchema,
        factoryId: z.number().int().nullable().optional(),
        fileName: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        dataUrl: z.string().min(20).max(7_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireControlAuthorization(db, {
        module: input.module,
        factoryId: input.factoryId ?? null,
        profile: ctx.operatorProfile!,
      });
      const base64 = input.dataUrl.split(",")[1];
      if (!base64)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Imagem inválida.",
        });
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const scope = input.factoryId ?? "comum";
      const { key, url } = await storagePut(
        `control-evidence/${input.module}/${scope}/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`,
        Buffer.from(base64, "base64"),
        input.mimeType
      );
      return {
        success: true,
        key,
        url,
        fileName: input.fileName,
        mimeType: input.mimeType,
      };
    }),

  suggestFoodDefenseMeasure: qualitySessionProcedure
    .input(
      z.object({
        itemId: z.string().min(1).max(120),
        factoryId: z.number().int(),
        plannedTaskId: z.number().int().optional(),
        criterion: z.string().min(8).max(2_000),
        section: z.string().min(2).max(180),
        notes: z.string().max(2_000).optional(),
        probability: z.number().int().min(1).max(3),
        severity: z.number().int().min(1).max(3),
        vulnerability: z.number().int().min(1).max(9),
        riskGuidance: z.string().min(2).max(600),
        existingMeasure: z.string().max(2_000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await requireControlAuthorization(db, {
        module: "food_defense",
        factoryId: input.factoryId,
        plannedTaskId: input.plannedTaskId,
        profile: ctx.operatorProfile!,
      });
      const response = await invokeLLM({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content:
              "És especialista em Food Defense numa indústria de panificação. Propõe uma medida de controlo concreta, proporcional ao risco e verificável. Responde em português europeu, sem preâmbulos. A proposta é apenas apoio à decisão: não declares conformidade legal, não inventes factos e recorda implicitamente a necessidade de validação pela equipa.",
          },
          {
            role: "user",
            content: `Secção: ${input.section}\nCritério NC: ${input.criterion}\nObservações do técnico: ${input.notes?.trim() || "Não indicadas"}\nProbabilidade: ${input.probability}\nSeveridade: ${input.severity}\nVulnerabilidade: ${input.vulnerability}\nOrientação da matriz: ${input.riskGuidance}\nMedida já escrita: ${input.existingMeasure?.trim() || "Nenhuma"}\n\nPropõe uma única medida de controlo com ação imediata, responsável sugerido e forma de verificar eficácia. Máximo 120 palavras.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "food_defense_control_measure",
            strict: true,
            schema: {
              type: "object",
              properties: { suggestion: { type: "string" } },
              required: ["suggestion"],
              additionalProperties: false,
            },
          },
        },
        maxTokens: 400,
      });
      try {
        const content = response.choices[0]?.message.content;
        const parsed = JSON.parse(typeof content === "string" ? content : "{}");
        const suggestion = String(parsed.suggestion ?? "").trim();
        if (!suggestion) throw new Error("Sugestão vazia");
        return { suggestion };
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "A sugestão de medida de controlo não ficou disponível. Tente novamente.",
        });
      }
    }),

  deleteFragileItem: qualityOperatorProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const item = (
        await db
          .select()
          .from(fragileItems)
          .where(eq(fragileItems.id, input.id))
          .limit(1)
      )[0];
      if (!item || item.status !== "active")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Ponto de controlo não encontrado.",
        });
      await db
        .update(fragileItems)
        .set({ status: "inactive" })
        .where(eq(fragileItems.id, input.id));
      return { success: true };
    }),

  dailyReportArchiveHistory: qualitySessionProcedure
    .input(z.object({ date: dateInput.optional() }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const allArchives = input?.date
        ? await db
            .select()
            .from(dailyReportArchives)
            .where(eq(dailyReportArchives.operationalDate, input.date))
            .orderBy(desc(dailyReportArchives.revision))
        : await db
            .select()
            .from(dailyReportArchives)
            .orderBy(
              desc(dailyReportArchives.operationalDate),
              desc(dailyReportArchives.revision)
            );
      const seenDates = new Set<string>();
      const archives = allArchives.filter(archive => {
        const key = archive.operationalDate instanceof Date
          ? archive.operationalDate.toISOString().slice(0, 10)
          : String(archive.operationalDate).slice(0, 10);
        if (seenDates.has(key)) return false;
        seenDates.add(key);
        return true;
      });
      return archives.map(archive => {
        const snapshot =
          archive.snapshot &&
          typeof archive.snapshot === "object" &&
          !Array.isArray(archive.snapshot)
            ? (archive.snapshot as Record<string, unknown>)
            : {};
        return {
          id: archive.id,
          operationalDate: archive.operationalDate,
          revision: archive.revision,
          archiveKind: archive.archiveKind,
          revisionReason: archive.revisionReason,
          createdBy: archive.createdBy,
          createdAt: archive.createdAt,
          controls: Array.isArray(snapshot.controlEntries)
            ? snapshot.controlEntries.length
            : 0,
          plannedTasks: Array.isArray(snapshot.plannedTasks)
            ? snapshot.plannedTasks.length
            : 0,
          incidences: Array.isArray(snapshot.incidences)
            ? snapshot.incidences.length
            : 0,
          backupFileKey: archive.backupFileKey,
          backupFileUrl: archive.backupFileUrl,
          backupGeneratedAt: archive.backupGeneratedAt,
          backupSizeBytes: archive.backupSizeBytes,
        };
      });
    }),

  generateDailyReportArchiveBackup: qualityManagerProcedure
    .input(z.object({ archiveId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const archive = (
        await db
          .select()
          .from(dailyReportArchives)
          .where(eq(dailyReportArchives.id, input.archiveId))
          .limit(1)
      )[0];
      if (!archive)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Versão de arquivo não encontrada.",
        });
      return ensureDailyReportArchiveBackup(archive.id);
    }),

  createManualDailyReportArchive: qualityManagerProcedure
    .input(
      z.object({
        operationalDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Indique uma data operacional válida."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createManualDailyReportArchive(
        input.operationalDate,
        `Arquivo manual por ${ctx.operatorProfile!.name}`
      );
    }),

  generateMissingDailyReportArchiveBackups: qualityManagerProcedure.mutation(
    async () => {
      const db = await requireDb();
      const archives = await db
        .select()
        .from(dailyReportArchives)
        .orderBy(
          desc(dailyReportArchives.operationalDate),
          desc(dailyReportArchives.revision)
        );
      const finalByDate = new Map<string, typeof archives[number]>();
      const archivesByDate = new Map<string, typeof archives>();
      for (const archive of archives) {
        const key = archive.operationalDate instanceof Date
          ? archive.operationalDate.toISOString().slice(0, 10)
          : String(archive.operationalDate).slice(0, 10);
        const sameDay = archivesByDate.get(key) ?? [];
        sameDay.push(archive);
        archivesByDate.set(key, sameDay);
        if (!finalByDate.has(key)) finalByDate.set(key, archive);
      }
      const pending = Array.from(finalByDate.entries()).filter(([key, archive]) =>
        !archive.backupFileKey || !archive.backupFileUrl ||
        (archivesByDate.get(key) ?? []).some(previous => previous.id !== archive.id && (previous.backupFileKey || previous.backupFileUrl))
      ).map(([, archive]) => archive);
      const results = [];
      for (const archive of pending)
        results.push(await ensureDailyReportArchiveBackup(archive.id));
      return {
        requested: pending.length,
        generated: results.filter(result => result.created).length,
        alreadyPresent: results.filter(result => !result.created).length,
      };
    }
  ),

  dailyReportArchiveDetail: qualitySessionProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const archive = (
        await db
          .select()
          .from(dailyReportArchives)
          .where(eq(dailyReportArchives.id, input.id))
          .limit(1)
      )[0];
      if (!archive)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Versão de arquivo não encontrada.",
        });
      return archive;
    }),

  dailyReportArchiveAttention: qualitySessionProcedure.query(
    async ({ ctx }) => {
      const db = await requireDb();
      const [archives, views] = await Promise.all([
        db
          .select()
          .from(dailyReportArchives)
          .orderBy(
            desc(dailyReportArchives.operationalDate),
            desc(dailyReportArchives.revision)
          ),
        db
          .select()
          .from(dailyReportArchiveViews)
          .where(eq(dailyReportArchiveViews.profileId, ctx.operatorProfile!.id))
          .orderBy(desc(dailyReportArchiveViews.viewedAt)),
      ]);
      const viewedArchiveIds = new Set(views.map(view => view.archiveId));
      const pending = archives.filter(
        archive =>
          archive.archiveKind === "retroactive_revision" &&
          !viewedArchiveIds.has(archive.id)
      );
      return {
        count: pending.length,
        revisions: pending
          .slice(0, 3)
          .map(archive => ({
            id: archive.id,
            operationalDate: archive.operationalDate,
            revision: archive.revision,
            revisionReason: archive.revisionReason,
            createdBy: archive.createdBy,
            createdAt: archive.createdAt,
          })),
      };
    }
  ),

  markDailyReportArchiveViewed: qualitySessionProcedure
    .input(z.object({ archiveId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const archive = (
        await db
          .select()
          .from(dailyReportArchives)
          .where(eq(dailyReportArchives.id, input.archiveId))
          .limit(1)
      )[0];
      if (!archive)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Versão de arquivo não encontrada.",
        });
      if (archive.archiveKind !== "retroactive_revision")
        return { success: true, tracked: false };
      await db
        .insert(dailyReportArchiveViews)
        .values({
          archiveId: archive.id,
          profileId: ctx.operatorProfile!.id,
          viewedAt: new Date(),
        })
        .onDuplicateKeyUpdate({ set: { viewedAt: new Date() } });
      return { success: true, tracked: true };
    }),

  reports: qualitySessionProcedure
    .input(
      z
        .object({
          factoryId: z.number().int().optional(),
          startDate: dateInput.optional(),
          endDate: dateInput.optional(),
          module: qualityModuleSchema.optional(),
          modules: z.array(qualityModuleSchema).min(1).max(20).optional(),
          result: resultSchema.optional(),
          ncStatus: z
            .enum(["open", "in_progress", "awaiting_validation", "closed"])
            .optional(),
          orderNumber: z.string().trim().min(1).max(80).optional(),
          analysisProduct: z.string().trim().min(1).max(180).optional(),
          analysisClient: z.string().trim().min(1).max(180).optional(),
          detailSearch: z.string().trim().min(1).max(240).optional(),
          inspectedCollaborator: z.string().trim().min(1).max(180).optional(),
          verificationType: z.string().trim().min(1).max(180).optional(),
          line: z.string().trim().min(1).max(180).optional(),
          productName: z.string().trim().min(1).max(180).optional(),
          lot: z.string().trim().min(1).max(180).optional(),
          validity: z.string().trim().min(1).max(40).optional(),
          customer: z.string().trim().min(1).max(180).optional(),
          samplePoint: z.string().trim().min(1).max(180).optional(),
          category: z.string().trim().min(1).max(180).optional(),
          test: z.string().trim().min(1).max(180).optional(),
          equipment: z.string().trim().min(1).max(180).optional(),
          location: z.string().trim().min(1).max(180).optional(),
          state: z.string().trim().min(1).max(180).optional(),
          periodicity: z.string().trim().min(1).max(80).optional(),
          analyst: z.string().trim().min(1).max(180).optional(),
          deliveryNote: z.string().trim().min(1).max(120).optional(),
          triage: z.string().trim().min(1).max(180).optional(),
          collaboratorProfileId: z.number().int().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const [entries, tasks, ncs] = await Promise.all([
        db
          .select()
          .from(controlEntries)
          .orderBy(desc(controlEntries.completedAt)),
        db.select().from(controlTasks),
        db.select().from(nonconformities),
      ]);
      const start = input?.startDate
        ? asDateRange(input.startDate).start
        : null;
      const end = input?.endDate ? asDateRange(input.endDate).end : null;
      if (
        input?.startDate &&
        input.endDate &&
        asDateRange(input.startDate).start > asDateRange(input.endDate).start
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A data final não pode ser anterior à data inicial.",
        });
      const withinPeriod = (date: Date) =>
        (!start || date >= start) && (!end || date < end);
      const selectedModules = input?.modules?.length
        ? Array.from(new Set(input.modules))
        : input?.module
          ? [input.module]
          : [];
      const payloadRecord = (payload: unknown) =>
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : {};
      const isDeletedEntry = (entry: (typeof entries)[number]) => {
        const lifecycle = payloadRecord(entry.payload).recordLifecycle;
        return Boolean(
          lifecycle &&
            typeof lifecycle === "object" &&
            !Array.isArray(lifecycle) &&
            (lifecycle as Record<string, unknown>).status === "deleted"
        );
      };
      const dispatchEntries = scopeToFactory(entries, input?.factoryId).filter(
        entry =>
          !isDeletedEntry(entry) &&
          withinPeriod(entry.completedAt) &&
          entry.module === "dispatch_control"
      );
      const dispatchOrdersByNumber = new Map<
        string,
        {
          orderNumber: string;
          customer: string | null;
          result: "C" | "NC" | "N/A" | null;
          completedAt: Date;
        }
      >();
      dispatchEntries.forEach(entry => {
        const payload = payloadRecord(entry.payload);
        const orderNumber =
          typeof payload.orderNumber === "string" ? payload.orderNumber : null;
        const customer =
          typeof payload.customer === "string" ? payload.customer : null;
        if (orderNumber)
          dispatchOrdersByNumber.set(orderNumber, {
            orderNumber,
            customer,
            result: entry.result,
            completedAt: entry.completedAt,
          });
      });
      const dispatchOrders = Array.from(dispatchOrdersByNumber.values());
      const normalized = (value: string) =>
        value.toLocaleLowerCase("pt-PT").trim();
      const matchesInternalAnalysis = (entry: (typeof entries)[number]) => {
        if (!input?.analysisProduct && !input?.analysisClient) return true;
        if (entry.module !== "internal_analysis") return false;
        const payload = payloadRecord(entry.payload);
        const samples = Array.isArray(payload.samples) ? payload.samples : [];
        const legacySample = {
          product: payload.product,
          client: payload.client ?? payload.samplePoint ?? payload.sampleId,
        };
        const candidates = samples.length ? samples : [legacySample];
        return candidates.some(sample => {
          const values =
            sample && typeof sample === "object"
              ? (sample as Record<string, unknown>)
              : {};
          const product =
            typeof values.product === "string" ? values.product : "";
          const client = [values.client, values.samplePoint]
            .filter((value): value is string => typeof value === "string")
            .join(" ");
          return (
            (!input.analysisProduct ||
              normalized(product).includes(
                normalized(input.analysisProduct)
              )) &&
            (!input.analysisClient ||
              normalized(client).includes(normalized(input.analysisClient)))
          );
        });
      };
      const detailText = (value: unknown): string => {
        if (value === null || value === undefined) return "";
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        )
          return String(value);
        if (Array.isArray(value))
          return value.map(detailText).filter(Boolean).join(" ");
        if (typeof value === "object")
          return Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => `${key} ${detailText(item)}`)
            .filter(Boolean)
            .join(" ");
        return "";
      };
      const detailFieldValues = (
        entry: (typeof entries)[number],
        field: string
      ): string[] => {
        const payload = payloadRecord(entry.payload);
        const values = (...items: unknown[]) =>
          items.map(detailText).filter(Boolean);
        switch (field) {
          case "inspectedCollaborator":
            return values(
              payload.collaboratorName,
              payload.inspectedCollaborator,
              payload.employeeName
            );
          case "verificationType":
            return values(
              payload.criterion,
              payload.test,
              payload.profile,
              payload.profileLabel,
              payload.observationResult,
              entry.title
            );
          case "line":
            return values(
              payload.line,
              payload.lineName,
              payload.location,
              entry.area,
              payload.items
            );
          case "productName":
            return values(
              payload.product,
              payload.productName,
              payload.samples,
              payload.products,
              payload.productChecks
            );
          case "lot":
            return values(
              payload.lot,
              payload.lotNumber,
              payload.samples,
              payload.products,
              payload.productChecks
            );
          case "validity":
            return values(
              payload.validity,
              payload.expiryDate,
              payload.samples,
              payload.products,
              payload.productChecks
            );
          case "customer":
            return values(
              payload.customer,
              payload.client,
              payload.samples,
              payload.products,
              payload.productChecks
            );
          case "samplePoint":
            return values(
              payload.samplePoint,
              payload.samplingPoint,
              payload.samples,
              payload.analyses
            );
          case "category":
            return values(
              payload.category,
              payload.categories,
              payload.analyses,
              payload.criteria
            );
          case "test":
            return values(payload.test, payload.tests, payload.analyses);
          case "equipment":
            return values(
              payload.equipment,
              payload.items,
              payload.readings,
              payload.temperatures
            );
          case "location":
            return values(payload.location, entry.area);
          case "state":
            return values(
              payload.state,
              payload.inspectionState,
              payload.status,
              payload.triage
            );
          case "periodicity":
            return values(payload.periodicity, payload.frequency);
          case "analyst":
            return values(payload.analyst, payload.analystName);
          case "deliveryNote":
            return values(payload.deliveryNote, payload.deliveryNoteNumber);
          case "triage":
            return values(payload.triage);
          default:
            return [];
        }
      };
      const matchesDetailFilters = (entry: (typeof entries)[number]) => {
        const payload = payloadRecord(entry.payload);
        const allText = normalized(
          [
            entry.title,
            entry.area,
            entry.notes,
            entry.registeredByName,
            detailText(payload),
          ]
            .filter(Boolean)
            .join(" ")
        );
        if (
          input?.detailSearch &&
          !allText.includes(normalized(input.detailSearch))
        )
          return false;
        const filters: Array<[string, string | undefined]> = [
          ["inspectedCollaborator", input?.inspectedCollaborator],
          ["verificationType", input?.verificationType],
          ["line", input?.line],
          ["productName", input?.productName],
          ["lot", input?.lot],
          ["validity", input?.validity],
          ["customer", input?.customer],
          ["samplePoint", input?.samplePoint],
          ["category", input?.category],
          ["test", input?.test],
          ["equipment", input?.equipment],
          ["location", input?.location],
          ["state", input?.state],
          ["periodicity", input?.periodicity],
          ["analyst", input?.analyst],
          ["deliveryNote", input?.deliveryNote],
          ["triage", input?.triage],
        ];
        return filters.every(
          ([field, query]) =>
            !query ||
            detailFieldValues(entry, field).some(value =>
              normalized(value).includes(normalized(query))
            )
        );
      };
      const scopedEntries = scopeToFactory(entries, input?.factoryId).filter(
        entry => {
          const orderNumber =
            typeof payloadRecord(entry.payload).orderNumber === "string"
              ? (payloadRecord(entry.payload).orderNumber as string)
              : null;
          return (
            !isDeletedEntry(entry) &&
            withinPeriod(entry.completedAt) &&
            (!selectedModules.length || selectedModules.includes(entry.module)) &&
            (!input?.result || entry.result === input.result) &&
            (!input?.orderNumber || orderNumber === input.orderNumber) &&
            (!input?.collaboratorProfileId ||
              entry.registeredByProfileId === input.collaboratorProfileId) &&
            matchesInternalAnalysis(entry) &&
            matchesDetailFilters(entry)
          );
        }
      );
      const scopedTasks = scopeToFactory(tasks, input?.factoryId).filter(
        task =>
          task.status !== "cancelled" &&
          withinPeriod(task.dueAt) &&
          (!input?.collaboratorProfileId ||
            task.completedByProfileId === input.collaboratorProfileId)
      );
      const scopedNcs = scopeToFactory(ncs, input?.factoryId).filter(
        nc =>
          withinPeriod(nc.detectedAt) &&
          (!selectedModules.length || selectedModules.includes(nc.module)) &&
          (!input?.ncStatus || nc.status === input.ncStatus) &&
          (!input?.collaboratorProfileId ||
            nc.reportedByProfileId === input.collaboratorProfileId)
      );
      const modules = qualityModuleValues.map(module => {
        const moduleEntries = scopedEntries.filter(
          entry => entry.module === module
        );
        return {
          module,
          total: moduleEntries.length,
          conformity: calculateConformityRate(
            moduleEntries.map(entry => entry.result)
          ),
          nc: moduleEntries.filter(entry => entry.result === "NC").length,
        };
      });
      const areaNames = Array.from(
        new Set(scopedEntries.map(entry => entry.area))
      );
      const areas = areaNames.map(area => {
        const areaEntries = scopedEntries.filter(entry => entry.area === area);
        return {
          area,
          total: areaEntries.length,
          conformity: calculateConformityRate(
            areaEntries.map(entry => entry.result)
          ),
        };
      });
      const defaultEnd = asDateRange(new Date()).end;
      const periodStart =
        start ??
        new Date(
          defaultEnd.getFullYear(),
          defaultEnd.getMonth(),
          defaultEnd.getDate() - 30
        );
      const periodEnd = end ?? defaultEnd;
      const periodDays = Math.max(
        1,
        Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000)
      );
      const bucketCount = Math.min(10, periodDays);
      const bucketSize = Math.max(1, Math.ceil(periodDays / bucketCount));
      const trends = Array.from({ length: bucketCount }, (_, index) => {
        const bucketStart = new Date(periodStart);
        bucketStart.setDate(bucketStart.getDate() + index * bucketSize);
        const bucketEnd = new Date(bucketStart);
        bucketEnd.setDate(bucketEnd.getDate() + bucketSize);
        if (bucketEnd > periodEnd) bucketEnd.setTime(periodEnd.getTime());
        const bucketEntries = scopedEntries.filter(
          entry =>
            entry.completedAt >= bucketStart && entry.completedAt < bucketEnd
        );
        const labelStart = bucketStart.toLocaleDateString("pt-PT", {
          day: "2-digit",
          month: "2-digit",
        });
        const labelEnd = new Date(
          Math.max(bucketStart.getTime(), bucketEnd.getTime() - 1)
        ).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
        return {
          label: bucketSize === 1 ? labelStart : `${labelStart}–${labelEnd}`,
          entries: bucketEntries.length,
          c: bucketEntries.filter(entry => entry.result === "C").length,
          nc: bucketEntries.filter(entry => entry.result === "NC").length,
        };
      });
      const filteredSummary = {
        total: scopedEntries.length,
        conforming: scopedEntries.filter(entry => entry.result === "C").length,
        nonconforming: scopedEntries.filter(entry => entry.result === "NC")
          .length,
        conformity: calculateConformityRate(
          scopedEntries.map(entry => entry.result)
        ),
      };
      return {
        modules,
        areas,
        trends,
        filteredSummary,
        recentEntries: scopedEntries.slice(0, 12),
        filteredEntries: scopedEntries,
        planCompliance: calculatePlanCompliance(scopedTasks),
        openNcs: countOpenNonconformities(scopedNcs).open,
        criticalOpen: countOpenNonconformities(scopedNcs).criticalOpen,
        dispatchOrders,
        filters: {
          startDate: start,
          endDate: end,
          module: input?.module ?? null,
          result: input?.result ?? null,
          ncStatus: input?.ncStatus ?? null,
          orderNumber: input?.orderNumber ?? null,
          analysisProduct: input?.analysisProduct ?? null,
          analysisClient: input?.analysisClient ?? null,
          detailSearch: input?.detailSearch ?? null,
          inspectedCollaborator: input?.inspectedCollaborator ?? null,
          verificationType: input?.verificationType ?? null,
          line: input?.line ?? null,
          productName: input?.productName ?? null,
          lot: input?.lot ?? null,
          validity: input?.validity ?? null,
          customer: input?.customer ?? null,
          samplePoint: input?.samplePoint ?? null,
          category: input?.category ?? null,
          test: input?.test ?? null,
          equipment: input?.equipment ?? null,
          location: input?.location ?? null,
          state: input?.state ?? null,
          periodicity: input?.periodicity ?? null,
          analyst: input?.analyst ?? null,
          deliveryNote: input?.deliveryNote ?? null,
          triage: input?.triage ?? null,
        },
      };
    }),

  operationalAnalytics: qualitySessionProcedure
    .input(
      z
        .object({
          period: z.enum(["day", "week", "month", "custom"]).default("day"),
          referenceDate: dateInput.optional(),
          startDate: dateInput.optional(),
          endDate: dateInput.optional(),
        })
        .refine(
          value => Boolean(value.startDate) === Boolean(value.endDate),
          "Indique a data inicial e a data final do intervalo."
        )
        .optional()
    )
    .query(async ({ input }) => {
      const db = await requireDb();
      const [
        entries,
        tasks,
        ncs,
        factoryCatalog,
        areaCatalog,
        monthlyItems,
        monthlyAssignments,
        monthlyAreaAssignments,
        monthlyAreaRows,
        fragileCatalog,
      ] = await Promise.all([
        db.select().from(controlEntries),
        db.select().from(controlTasks),
        db.select().from(nonconformities),
        db.select().from(factories),
        db.select().from(areas),
        db.select().from(checklistItems),
        db.select().from(checklistItemFactories),
        db.select().from(checklistItemAreas),
        db.select().from(checklistAreas),
        db.select().from(fragileItems),
      ]);
      const period = input?.period ?? "day";
      const referenceDate = input?.referenceDate ?? input?.startDate ?? new Date();
      const periodBounds = analyticsPeriodBounds(period, referenceDate, input?.startDate, input?.endDate);
      const periodStart = periodBounds.start;
      const periodEnd = periodBounds.end;
      const isWithinPeriod = (date: Date) =>
        date >= periodStart && date < periodEnd;
      const isDeletedEntry = (entry: (typeof entries)[number]) => {
        const payload = entryPayload(entry);
        const lifecycle = payload.recordLifecycle;
        return Boolean(
          lifecycle &&
            typeof lifecycle === "object" &&
            !Array.isArray(lifecycle) &&
            (lifecycle as Record<string, unknown>).status === "deleted"
        );
      };
      const activeEntries = entries.filter(entry => !isDeletedEntry(entry));
      const entriesInPeriod = activeEntries.filter(entry =>
        isWithinPeriod(entry.completedAt)
      );
      const plannedTasks = tasks.filter(
        task => task.status !== "cancelled" && isWithinPeriod(task.dueAt)
      );
      const analysedTasks = plannedTasks.map(task => ({
        ...task,
        // Na análise histórica, o estado concluído da tarefa é a fotografia
        // persistida do fecho operacional. Recalcular contra catálogos atuais
        // pode reabrir artificialmente tarefas antigas já fechadas.
        completed: task.status === "completed" || isHistoricalPlanTaskSatisfied(
          task,
          activeEntries,
          areaCatalog,
          monthlyItems,
          monthlyAssignments,
          factoryCatalog,
          monthlyAreaAssignments,
          monthlyAreaRows,
          fragileCatalog
        ),
      }));
      const completionSummary = (items: typeof analysedTasks) => {
        const total = items.length;
        const completed = items.filter(item => item.completed).length;
        return {
          total,
          completed,
          pending: total - completed,
          rate: total ? Math.round((completed / total) * 1000) / 10 : 0,
        };
      };
      const factoryNames = new Map(
        factoryCatalog.map(factory => [factory.id, factory.name])
      );
      const completionByFactory = [
        ...factoryCatalog.map(factory => ({
          factoryId: factory.id,
          label: factory.name,
          ...completionSummary(
            analysedTasks.filter(task => task.factoryId === factory.id)
          ),
        })),
        ...(analysedTasks.some(task => task.factoryId === null)
          ? [
              {
                factoryId: null,
                label: "Controlos transversais",
                ...completionSummary(
                  analysedTasks.filter(task => task.factoryId === null)
                ),
              },
            ]
          : []),
      ];
      const resultsForControl = (module: string) => {
        const moduleEntries = entriesInPeriod.filter(
          entry => entry.module === module
        );
        return {
          registrations: moduleEntries.length,
          conforming: moduleEntries.filter(entry => entry.result === "C").length,
          nonconforming: moduleEntries.filter(entry => entry.result === "NC")
            .length,
          notApplicable: moduleEntries.filter(entry => entry.result === "N/A")
            .length,
        };
      };
      const completionByControl = Array.from(
        new Set(analysedTasks.map(task => task.module))
      ).map(module => ({
        module,
        ...completionSummary(
          analysedTasks.filter(task => task.module === module)
        ),
        ...resultsForControl(module),
      }));
      const resultSummary = {
        total: entriesInPeriod.length,
        conforming: entriesInPeriod.filter(entry => entry.result === "C").length,
        nonconforming: entriesInPeriod.filter(entry => entry.result === "NC")
          .length,
        notApplicable: entriesInPeriod.filter(entry => entry.result === "N/A")
          .length,
        conformity: calculateConformityRate(
          entriesInPeriod.map(entry => entry.result)
        ),
      };
      const relevantIncidences = entriesInPeriod.filter(
        entry => entry.result === "NC"
      );
      const incidenceStatus = ["pending", "in_progress", "completed"] as const;
      const incidenceByTreatment = incidenceStatus.map(status => ({
        status,
        total: relevantIncidences.filter(
          entry => incidenceTreatmentFromPayload(entryPayload(entry)).status === status
        ).length,
      }));
      const incidenceDecisionStatuses = [
        "pending",
        "no_nc",
        "nc_generated",
      ] as const;
      const incidenceByDecision = incidenceDecisionStatuses.map(status => ({
          status,
          total: relevantIncidences.filter(entry => {
            const payload = entryPayload(entry);
            const generatedNonconformity =
              payload.generatedNonconformity === true ||
              ncs.some(nc => nc.sourceEntryId === entry.id);
            return (
              incidenceDecisionFromPayload(payload, generatedNonconformity) ===
              status
            );
          }).length,
        }));
      const ncsInPeriod = ncs.filter(nc => isWithinPeriod(nc.detectedAt));
      const nonconformityStatuses = [
        "open",
        "in_progress",
        "awaiting_validation",
        "closed",
      ].map(status => ({
        status,
        total: ncsInPeriod.filter(nc => nc.status === status).length,
      }));
      const severityLevels = ["critical", "high", "medium", "low"] as const;
      const nonconformityBySeverity = severityLevels.map(severity => ({
        severity,
        total: ncsInPeriod.filter(nc => nc.severity === severity).length,
      }));
      const technicians = new Map<
        string,
        {
          profileId: number | null;
          name: string;
          title: string | null;
          entries: (typeof entriesInPeriod)[number][];
        }
      >();
      entriesInPeriod.forEach(entry => {
        const profileId = entry.registeredByProfileId ?? null;
        const name = entry.registeredByName?.trim() || "Registo sem técnico identificado";
        const key = profileId ? `profile-${profileId}` : `name-${name}`;
        const technician = technicians.get(key) ?? {
          profileId,
          name,
          title: entry.registeredByTitle ?? null,
          entries: [],
        };
        technician.entries.push(entry);
        technicians.set(key, technician);
      });
      const sourceEntriesById = new Map(
        activeEntries.map(entry => [entry.id, entry])
      );
      const activityByTechnician = Array.from(technicians.values())
        .map(technician => {
          const generatedNonconformities = ncsInPeriod.filter(nc => {
            const sourceEntry = nc.sourceEntryId
              ? sourceEntriesById.get(nc.sourceEntryId)
              : undefined;
            if (technician.profileId !== null) {
              return (
                nc.reportedByProfileId === technician.profileId ||
                (nc.reportedByProfileId === null &&
                  sourceEntry?.registeredByProfileId === technician.profileId)
              );
            }
            return (
              nc.reportedByName?.trim() === technician.name ||
              (!nc.reportedByName &&
                sourceEntry?.registeredByName?.trim() === technician.name)
            );
          }).length;
          const incidences = technician.entries.filter(
            entry => entry.result === "NC"
          ).length;
          return {
            profileId: technician.profileId,
            name: technician.name,
            title: technician.title,
            total: technician.entries.length,
            conforming: technician.entries.filter(entry => entry.result === "C")
              .length,
            incidences,
            nonconforming: incidences,
            generatedNonconformities,
            conformity: calculateConformityRate(
              technician.entries.map(entry => entry.result)
            ),
          };
        })
        .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
      const numberOfDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86_400_000));
      const activityTrend = Array.from({ length: numberOfDays }, (_, index) => {
        const dayKey = addCalendarDays(periodBounds.startKey, index);
        const dayStart = lisbonDayBoundsUtc(lisbonCalendarDateToUtc(dayKey)).start;
        const dayEnd = lisbonDayBoundsUtc(lisbonCalendarDateToUtc(addCalendarDays(dayKey, 1))).start;
        const dayEntries = entriesInPeriod.filter(
          entry => entry.completedAt >= dayStart && entry.completedAt < dayEnd
        );
        const dayTasks = analysedTasks.filter(
          task => task.dueAt >= dayStart && task.dueAt < dayEnd
        );
        return {
          label: new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit" }).format(dayStart),
          registrations: dayEntries.length,
          incidences: dayEntries.filter(entry => entry.result === "NC").length,
          generatedNonconformities: ncsInPeriod.filter(
            nc => nc.detectedAt >= dayStart && nc.detectedAt < dayEnd
          ).length,
          completedTasks: dayTasks.filter(task => task.completed).length,
          plannedTasks: dayTasks.length,
        };
      });
      return {
        period,
        periodStart,
        periodEnd,
        completion: completionSummary(analysedTasks),
        completionByFactory,
        completionByControl,
        results: resultSummary,
        incidences: {
          total: relevantIncidences.length,
          byTreatment: incidenceByTreatment,
          byDecision: incidenceByDecision,
          nonconformities: {
            total: ncsInPeriod.length,
            byStatus: nonconformityStatuses,
            bySeverity: nonconformityBySeverity,
          },
        },
        activityByTechnician,
        activityTrend,
        factories: factoryCatalog.map(factory => ({
          id: factory.id,
          name: factoryNames.get(factory.id) ?? factory.code,
        })),
      };
    }),

  initializeChecklist: qualityManagerProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const defaultAreaId = await ensureChecklistArea(
      db,
      "Geral",
      ctx.user!.openId
    );
    const existing = await db.select().from(checklistItems);
    const existingLabels = new Set(existing.map(item => item.label.trim()));
    const missingLabels = MONTHLY_CHECKLIST_TEMPLATE.filter(
      label => !existingLabels.has(label)
    );
    if (!missingLabels.length) return { success: true, created: 0 };

    const nextSortOrder =
      Math.max(0, ...existing.map(item => item.sortOrder ?? 0)) + 1;
    const inserted = await db
      .insert(checklistItems)
      .values(
        missingLabels.map((label, index) => ({
          area: "Geral",
          label,
          sortOrder: nextSortOrder + index,
          active: "true" as const,
          createdBy: ctx.user!.openId,
        }))
      )
      .$returningId();
    await db
      .insert(checklistItemAreas)
      .values(
        inserted.map(item => ({
          checklistItemId: item.id,
          checklistAreaId: defaultAreaId,
        }))
      );
    await db
      .insert(checklistItemFactories)
      .values(
        inserted.flatMap(item =>
          [1, 2, 3].map(factoryId => ({
            checklistItemId: item.id,
            factoryId,
          }))
        )
      );
    return { success: true, created: missingLabels.length };
  }),
});
