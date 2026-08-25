import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  areas,
  bphfInspectionEmployees,
  factories,
  checklistItems,
  checklistItemFactories,
  controlPlans,
  controlEntries,
  controlTasks,
  dailyIncidenceSummaries,
  dailyReportArchives,
  dailyReportArchiveViews,
  correctiveActions,
  evidences,
  fragileItems,
  nonconformities,
  qualityPinProfiles,
  qualityPinSessions,
  qualityModuleValues,
  resultValues,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { createRetroactiveDailyReportRevision } from "../daily-report-archive";
import { businessDayAfter, calculateConformityRate, calculateDispatchConformity, calculateSensoryScore, fragileInspectionDelayDays, fragileInspectionDueDate, isBusinessDay, isFragileInspectionPending, nextBusinessDay, shouldCreateCriticalMetalAlert } from "../quality.logic";
import { calculatePlanCompliance, countOpenNonconformities, scopeToFactory } from "../factory.scope.logic";
import { storageGetSignedUrl, storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import { createSessionToken, hashPin, hashSessionToken, QUALITY_OPERATOR_COOKIE, QUALITY_SESSION_HOURS, QUALITY_TEAM_DEFAULTS, validatePin, verifyPin } from "../team-access";
import { getSessionCookieOptions } from "../_core/cookies";
import { protectedProcedure, publicProcedure, qualityManagerProcedure, qualityOperatorProcedure, qualitySessionProcedure, router } from "../_core/trpc";
import { getDispatchProfile } from "../../shared/dispatch-control";

const qualityModuleSchema = z.enum(qualityModuleValues);
const resultSchema = z.enum(resultValues);
const retroactiveReasonSchema = z.enum(["verified_not_registered", "technical_unavailability", "other"]);
const retroactiveReasonLabels: Record<z.infer<typeof retroactiveReasonSchema>, string> = {
  verified_not_registered: "Controlo verificado no dia agendado, mas não registado",
  technical_unavailability: "Adiado por falta de disponibilidade técnica para verificação no dia em que estava agendado",
  other: "Outra opção",
};
const dateInput = z.coerce.date();
const BPHF_AREA_NAMES = ["Produção", "Embalagem", "Limpeza"] as const;
const BPHF_PROGRESS_CRITERIA_COUNT = 4;
const REQUIRED_MODULE_FREQUENCIES = [
  { module: "bphf", frequency: "daily", title: "BPHF obrigatório" },
  { module: "shelf_life", frequency: "daily", title: "Shelf-life obrigatório" },
  { module: "suggestion_boxes", frequency: "weekly", title: "Caixas de sugestões obrigatórias" },
  { module: "sensory", frequency: "weekly", title: "Controlo sensorial obrigatório" },
  { module: "monthly_checklist", frequency: "monthly", title: "Checklist mensal obrigatório" },
] as const;
const MONTHLY_CHECKLIST_TEMPLATE = [
  "Cumprimento do plano de higienização",
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
  products: z.array(z.object({ name: z.string().max(180), orderedQuantity: z.number().int().min(0) })).max(30),
  warnings: z.array(z.string().max(240)).max(12),
});

function asDateRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function localDateKey(date: Date) {
  const local = new Date(date);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
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
  if (frequency === "daily" || frequency === "per_shift") return isBusinessDay(date);
  if (frequency === "weekly") return date.getDay() === 5;
  if (frequency === "monthly") return false;
  return false;
}

const sharedPlanModules = new Set(["dispatch_control", "internal_analysis"]);
const oneSubmissionPlanModules = new Set<typeof qualityModuleValues[number]>(["sensory", "shelf_life", "suggestion_boxes", "dispatch_control", "internal_analysis", "temperature_controls"]);
const FOOD_DEFENSE_EXPECTED_CRITERIA = 131;

type OperationalProfile = { id: number; role: string; name: string };

function entryPayload(entry: { payload?: unknown }) {
  return entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? entry.payload as Record<string, unknown> : {};
}

function entryOperationalDate(entry: { completedAt: Date; payload?: unknown }) {
  const plannedDate = entryPayload(entry).plannedDate;
  return typeof plannedDate === "string" && !Number.isNaN(new Date(plannedDate).getTime()) ? localDateKey(new Date(plannedDate)) : localDateKey(new Date(entry.completedAt));
}

function entryMatchesPlannedTask(entry: { module: string; factoryId: number | null; completedAt: Date; payload?: unknown }, task: { id: number; module: typeof qualityModuleValues[number]; factoryId: number | null; dueAt: Date }) {
  if (entry.module !== task.module || entry.factoryId !== task.factoryId) return false;
  const payload = entryPayload(entry);
  return Number(payload.plannedTaskId) === task.id || entryOperationalDate(entry) === localDateKey(new Date(task.dueAt));
}

function metalDetectorsTaskComplete(task: { factoryId: number | null }, entries: Array<{ area: string; module: string; factoryId: number | null; completedAt: Date; payload?: unknown }>, areaCatalog: Array<{ group: string; factoryId: number | null; active: string; name: string }>) {
  const expectedAreas = areaCatalog.filter((area) => area.group === "metal" && area.factoryId === task.factoryId && area.active === "true").map((area) => area.name);
  if (!expectedAreas.length) return false;
  const completedAreas = new Set(entries.map((entry) => entry.area));
  return expectedAreas.every((area) => completedAreas.has(area));
}

function monthlyChecklistTaskComplete(task: { factoryId: number | null }, entries: Array<{ payload?: unknown }>, items: Array<{ id: number; active: string }>, assignments: Array<{ checklistItemId: number; factoryId: number }>) {
  const expectedIds = items.filter((item) => item.active === "true" && (assignments.some((assignment) => assignment.checklistItemId === item.id) ? assignments.some((assignment) => assignment.checklistItemId === item.id && assignment.factoryId === task.factoryId) : true)).map((item) => item.id);
  if (!expectedIds.length) return false;
  const completedIds = new Set(entries.map((entry) => entryPayload(entry).checklistItemId).filter((id): id is number => typeof id === "number"));
  return expectedIds.every((id) => completedIds.has(id));
}

function foodDefenseTaskComplete(entries: Array<{ payload?: unknown }>) {
  return entries.some((entry) => {
    const criteria = entryPayload(entry).criteria;
    return Array.isArray(criteria) && criteria.length >= FOOD_DEFENSE_EXPECTED_CRITERIA;
  });
}

function isHistoricalPlanTaskSatisfied(task: { id: number; module: typeof qualityModuleValues[number]; factoryId: number | null; dueAt: Date }, entries: Array<{ area: string; module: string; factoryId: number | null; completedAt: Date; payload?: unknown }>, areaCatalog: Array<{ group: string; factoryId: number | null; active: string; name: string }>, monthlyItems: Array<{ id: number; active: string }> = [], monthlyAssignments: Array<{ checklistItemId: number; factoryId: number }> = []) {
  const taskEntries = entries.filter((entry) => entryMatchesPlannedTask(entry, task));
  if (task.module === "metal_detectors") return metalDetectorsTaskComplete(task, taskEntries, areaCatalog);
  if (task.module === "monthly_checklist") return monthlyChecklistTaskComplete(task, taskEntries, monthlyItems, monthlyAssignments);
  if (task.module === "food_defense") return foodDefenseTaskComplete(taskEntries);
  return oneSubmissionPlanModules.has(task.module) && taskEntries.length > 0;
}

async function assessControlAuthorization(db: any, input: { module: typeof qualityModuleValues[number]; factoryId?: number | null; plannedTaskId?: number; profile: OperationalProfile }) {
  const isShared = sharedPlanModules.has(input.module);
  const spansAllFoodDefenseFactories = input.module === "food_defense";
  if (!isShared && !input.factoryId) return { allowed: false, reason: "Selecione a fábrica ou linha antes de consultar ou preencher este controlo.", task: null, isPreviousPending: false };
  const today = localDateKey(new Date());
  const [tasks, entries, areaCatalog, monthlyItems, monthlyAssignments] = await Promise.all([db.select().from(controlTasks).orderBy(controlTasks.dueAt), db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)), db.select().from(areas).orderBy(areas.name), db.select().from(checklistItems).orderBy(checklistItems.sortOrder), db.select().from(checklistItemFactories).orderBy(checklistItemFactories.factoryId)]);
  const matchingTasks = tasks.filter((item: any) => item.status === "pending" && item.area === "Plano do Dia" && item.module === input.module && isBusinessDay(new Date(item.dueAt)) && localDateKey(new Date(item.dueAt)) <= today && (isShared ? item.factoryId === null : spansAllFoodDefenseFactories ? item.factoryId !== null : item.factoryId === input.factoryId) && !isHistoricalPlanTaskSatisfied(item, entries, areaCatalog, monthlyItems, monthlyAssignments));
  const task = input.plannedTaskId
    ? matchingTasks.find((item: any) => item.id === input.plannedTaskId)
    : [...matchingTasks].sort((left: any, right: any) => Number(localDateKey(new Date(right.dueAt)) === today) - Number(localDateKey(new Date(left.dueAt)) === today) || new Date(right.dueAt).getTime() - new Date(left.dueAt).getTime())[0];
  if (!task) return { allowed: false, reason: "Este controlo não está incluído num Plano do Dia publicado para hoje nem existem pendências anteriores atribuídas.", task: null, isPreviousPending: false };
  const assignees = Array.isArray(task.assigneeProfileIds) ? task.assigneeProfileIds : [];
  if (input.profile.role !== "manager" && !assignees.includes(input.profile.id)) return { allowed: false, reason: "Este controlo foi agendado para outro colaborador. Apenas os responsáveis designados ou a Responsável de Qualidade podem preenchê-lo.", task, isPreviousPending: false };
  const isPreviousPending = localDateKey(new Date(task.dueAt)) < today;
  const plannedDate = new Date(task.dueAt).toLocaleDateString("pt-PT");
  const reason = isPreviousPending
    ? `Preenchimento autorizado para a pendência do Plano do Dia de ${plannedDate}. A data prevista será mantida no registo.`
    : input.profile.role === "manager" ? "Preenchimento autorizado como Responsável de Qualidade." : "Preenchimento autorizado pelo Plano do Dia.";
  return { allowed: true, reason, task, isPreviousPending };
}

async function requireControlAuthorization(db: any, input: { module: typeof qualityModuleValues[number]; factoryId?: number | null; plannedTaskId?: number; profile: OperationalProfile }) {
  const access = await assessControlAuthorization(db, input);
  if (!access.allowed) throw new TRPCError({ code: "FORBIDDEN", message: access.reason });
  return access;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A base de dados não está disponível." });
  return db;
}

export const qualityRouter = router({
  accessStatus: publicProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const existing = await db.select().from(qualityPinProfiles).orderBy(qualityPinProfiles.id);
    const existingCodes = new Set(existing.map((profile) => profile.code));
    const missing = QUALITY_TEAM_DEFAULTS.filter((profile) => !existingCodes.has(profile.code));
    if (missing.length) {
      await db.insert(qualityPinProfiles).values(missing.map((profile) => ({ ...profile, active: "true" as const, pinHash: null, createdBy: ctx.user?.openId ?? "system-quality" })));
    }
    const profiles = missing.length ? await db.select().from(qualityPinProfiles).orderBy(qualityPinProfiles.id) : existing;
    const managerProfile = profiles.find((profile) => profile.role === "manager");
    return {
      profiles: profiles.map((profile) => ({ id: profile.id, code: profile.code, name: profile.name, title: profile.title, role: profile.role, isConfigured: Boolean(profile.pinHash), active: profile.active === "true" })),
      activeProfile: ctx.operatorProfile,
      canManage: ctx.operatorProfile?.role === "manager",
      canBootstrap: ctx.user?.role === "admin" && !managerProfile?.pinHash,
      needsInitialSetup: !profiles.every((profile) => Boolean(profile.pinHash)),
    };
  }),

  configureTeamPins: protectedProcedure.input(z.object({
    pins: z.array(z.object({ code: z.string().min(3).max(48), pin: z.string().regex(/^\d{4,8}$/) })).min(1).max(4),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const profiles = await db.select().from(qualityPinProfiles);
    const managerConfigured = profiles.some((profile) => profile.role === "manager" && Boolean(profile.pinHash));
    if (ctx.operatorProfile?.role !== "manager" && !(ctx.user.role === "admin" && !managerConfigured)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas a Responsável de Qualidade pode definir PINs." });
    }
    for (const { code, pin } of input.pins) {
      if (!validatePin(pin)) throw new TRPCError({ code: "BAD_REQUEST", message: "Cada PIN deve ter entre 4 e 8 algarismos." });
      const profile = profiles.find((item) => item.code === code);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil de equipa não encontrado." });
      await db.update(qualityPinProfiles).set({ pinHash: hashPin(pin) }).where(eq(qualityPinProfiles.id, profile.id));
    }
    return { success: true };
  }),

  activatePinProfile: publicProcedure.input(z.object({ profileId: z.number().int(), pin: z.string().regex(/^\d{4,8}$/) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const profile = (await db.select().from(qualityPinProfiles).where(eq(qualityPinProfiles.id, input.profileId)).limit(1))[0];
    if (!profile || profile.active !== "true" || !verifyPin(input.pin, profile.pinHash)) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "PIN inválido ou perfil indisponível." });
    }
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + QUALITY_SESSION_HOURS * 60 * 60 * 1000);
    await db.insert(qualityPinSessions).values({ profileId: profile.id, tokenHash: hashSessionToken(token), oauthOpenId: ctx.user?.openId ?? "pin-only", expiresAt });
    ctx.res.cookie(QUALITY_OPERATOR_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: QUALITY_SESSION_HOURS * 60 * 60 * 1000 });
    return { success: true, profile: { id: profile.id, name: profile.name, title: profile.title, role: profile.role } };
  }),

  deactivatePinProfile: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(QUALITY_OPERATOR_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
    return { success: true };
  }),

  metadata: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const [persistedAreas, persistedFactories, persistedProfiles] = await Promise.all([
      db.select().from(areas).orderBy(areas.group, areas.name),
      db.select().from(factories).orderBy(factories.name),
      db.select().from(qualityPinProfiles).orderBy(qualityPinProfiles.name),
    ]);
    return {
      areas: persistedAreas.map((area) => ({ id: area.id, name: area.name, group: area.group, factoryId: area.factoryId })),
      factories: persistedFactories.map((factory) => ({ id: factory.id, code: factory.code, name: factory.name })),
      collaborators: persistedProfiles.filter((profile) => profile.active === "true").map((profile) => ({ id: profile.id, name: profile.name, title: profile.title })),
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
    const employees = await db.select().from(bphfInspectionEmployees).where(eq(bphfInspectionEmployees.active, "true")).orderBy(bphfInspectionEmployees.name);
    return employees.map((employee) => ({ id: employee.id, name: employee.name }));
  }),

  addBphfInspectionEmployee: qualityOperatorProcedure.input(z.object({
    name: z.string().trim().min(2).max(160),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const name = input.name.replace(/\s+/g, " ").trim();
    const existing = await db.select().from(bphfInspectionEmployees).where(eq(bphfInspectionEmployees.name, name)).limit(1);
    if (existing[0]) {
      if (existing[0].active !== "true") await db.update(bphfInspectionEmployees).set({ active: "true" }).where(eq(bphfInspectionEmployees.id, existing[0].id));
      return { id: existing[0].id, name: existing[0].name, alreadyExists: true };
    }
    const result = await db.insert(bphfInspectionEmployees).values({ name, active: "true", createdBy: ctx.user?.openId ?? `quality-profile-${ctx.operatorProfile!.id}` });
    return { id: Number(result[0].insertId), name, alreadyExists: false };
  }),

  listBphfCollaboratorInspections: qualitySessionProcedure.input(z.object({
    collaboratorId: z.number().int().optional(),
    factoryId: z.number().int().optional(),
    result: resultSchema.optional(),
  }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const conditions = [eq(controlEntries.module, "bphf")];
    if (input?.factoryId) conditions.push(eq(controlEntries.factoryId, input.factoryId));
    const entries = await db.select().from(controlEntries).where(and(...conditions)).orderBy(desc(controlEntries.completedAt)).limit(150);
    return entries.flatMap((entry) => {
      const payload = entry.payload as Record<string, unknown>;
      const collaboratorId = Number(payload.collaboratorId);
      const collaboratorName = typeof payload.collaboratorName === "string" ? payload.collaboratorName : "";
      if (!collaboratorId || !collaboratorName) return [];
      if (input?.collaboratorId && collaboratorId !== input.collaboratorId) return [];
      if (input?.result && entry.result !== input.result) return [];
      return [{ id: entry.id, collaboratorId, collaboratorName, criterion: typeof payload.criterion === "string" ? payload.criterion : entry.title, area: entry.area, result: entry.result, notes: entry.notes, completedAt: entry.completedAt, factoryId: entry.factoryId }];
    });
  }),

  controlAuthorization: qualitySessionProcedure.input(z.object({
    module: qualityModuleSchema,
    factoryId: z.number().int().optional(),
    plannedTaskId: z.number().int().optional(),
  })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const access = await assessControlAuthorization(db, { module: input.module, factoryId: input.factoryId ?? null, plannedTaskId: input.plannedTaskId, profile: ctx.operatorProfile! });
    return {
      allowed: access.allowed,
      reason: access.reason,
      taskId: access.task?.id ?? null,
      assignedTo: access.task?.responsible ?? null,
      dueAt: access.task?.dueAt ?? null,
      isPreviousPending: access.isPreviousPending ?? false,
    };
  }),

  listFactories: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(factories).orderBy(factories.name);
  }),

  addArea: qualityManagerProcedure.input(z.object({
    name: z.string().min(2).max(120),
    group: z.enum(["bphf", "metal", "general"]),
    factoryId: z.number().int().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.insert(areas).values({ ...input, factoryId: input.factoryId ?? null, active: "true", createdBy: ctx.user!.openId });
    return { success: true };
  }),

  listPlans: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(controlPlans).orderBy(controlPlans.module, controlPlans.title);
  }),

  addPlan: qualityManagerProcedure.input(z.object({
    title: z.string().min(2).max(180),
    module: qualityModuleSchema,
    areaId: z.number().int(),
    factoryId: z.number().int().optional(),
    frequency: z.enum(["daily", "weekly", "monthly", "per_shift", "per_lot"]),
    critical: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.insert(controlPlans).values({ ...input, factoryId: input.factoryId ?? null, critical: input.critical ? "true" : "false", active: "true", createdBy: ctx.user!.openId });
    return { success: true };
  }),

  initializeMasterData: qualityManagerProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const [existingAreas, existingFactories] = await Promise.all([db.select().from(areas).limit(1), db.select().from(factories).limit(1)]);
    const defaultAreas = [
      { name: "Embalagem T", group: "bphf" as const }, { name: "Produção T", group: "bphf" as const }, { name: "Embalagem SG", group: "bphf" as const }, { name: "Produção SG", group: "bphf" as const },
      { name: "SG", group: "metal" as const }, { name: "Tradicional 1", group: "metal" as const }, { name: "Tradicional 2", group: "metal" as const }, { name: "Granel", group: "metal" as const }, { name: "Fábrica II", group: "metal" as const },
    ];
    const defaultFactories = [
      { code: "F1_FATIADO", name: "Fábrica 1 (Fatiado)" },
      { code: "F2_GRANEL", name: "Fábrica 2 (granel)" },
      { code: "F3_SEM_GLUTEN", name: "Fabrica 3 (Sem Gluten)" },
      { code: "LINHA_CROUTONS", name: "Linha Croutons" },
    ];
    let created = 0;
    if (!existingAreas.length) { await db.insert(areas).values(defaultAreas.map((area) => ({ ...area, factoryId: null, active: "true" as const, createdBy: ctx.user!.openId }))); created += defaultAreas.length; }
    if (!existingFactories.length) { await db.insert(factories).values(defaultFactories.map((factory) => ({ ...factory, active: "true" as const, createdBy: ctx.user!.openId }))); created += defaultFactories.length; }
    const currentFactories = await db.select().from(factories);
    const existingBphfAreas = await db.select().from(areas).where(eq(areas.group, "bphf"));
    const existingMetalAreas = await db.select().from(areas).where(eq(areas.group, "metal"));
    const bphfAreasToCreate = currentFactories.flatMap((factory) => BPHF_AREA_NAMES
      .filter((name) => !existingBphfAreas.some((area) => area.factoryId === factory.id && area.name === name))
      .map((name) => ({ name, group: "bphf" as const, factoryId: factory.id, active: "true" as const, createdBy: ctx.user!.openId })));
    if (bphfAreasToCreate.length) { await db.insert(areas).values(bphfAreasToCreate); created += bphfAreasToCreate.length; }
    const metalLinesByFactory: Record<string, string[]> = {
      F1_FATIADO: ["Linha 1", "Linha 2", "Linha Croutons"],
      F2_GRANEL: ["Linha principal"],
      F3_SEM_GLUTEN: ["Linha principal SG"],
    };
    const metalAreasToCreate = currentFactories.flatMap((factory) => (metalLinesByFactory[factory.code] ?? [])
      .filter((name) => !existingMetalAreas.some((area) => area.factoryId === factory.id && area.name === name))
      .map((name) => ({ name, group: "metal" as const, factoryId: factory.id, active: "true" as const, createdBy: ctx.user!.openId })));
    if (metalAreasToCreate.length) { await db.insert(areas).values(metalAreasToCreate); created += metalAreasToCreate.length; }
    return { success: true, created };
  }),

  dashboard: qualitySessionProcedure.input(z.object({ factoryId: z.number().int().optional(), date: dateInput.optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const [tasks, ncs, entries, actions, fragileCatalog, factoryCatalog, areaCatalog, monthlyItems, monthlyAssignments] = await Promise.all([
      db.select().from(controlTasks).orderBy(controlTasks.dueAt),
      db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt)),
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(correctiveActions).orderBy(correctiveActions.dueAt),
      db.select().from(fragileItems).orderBy(fragileItems.location, fragileItems.sortOrder, fragileItems.name),
      db.select().from(factories).orderBy(factories.name),
      db.select().from(areas).orderBy(areas.name),
      db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
      db.select().from(checklistItemFactories).orderBy(checklistItemFactories.factoryId),
    ]);
    const scopedTasks = scopeToFactory(tasks, input?.factoryId);
    const scopedNcs = scopeToFactory(ncs, input?.factoryId);
    const scopedEntries = scopeToFactory(entries, input?.factoryId);
    const scopedActions = scopeToFactory(actions, input?.factoryId);
    const scopedFragileCatalog = scopeToFactory(fragileCatalog, input?.factoryId);
    const now = new Date();
    const operationalDate = input?.date ? new Date(input.date.getFullYear(), input.date.getMonth(), input.date.getDate()) : nextBusinessDay(now);
    const { start, end } = asDateRange(operationalDate);
    const tomorrowDate = businessDayAfter(operationalDate);
    const { start: tomorrowStart, end: tomorrowEnd } = asDateRange(tomorrowDate);
    const workingWeekStart = startOfWorkingWeek(operationalDate);
    const workingWeekEnd = new Date(workingWeekStart);
    workingWeekEnd.setDate(workingWeekEnd.getDate() + 5);
    const businessTasks = scopedTasks.filter((task) => isBusinessDay(task.dueAt) && task.status !== "cancelled");
    const pending = businessTasks.filter((task) => task.status === "pending");
    const overdue = pending.filter((task) => task.dueAt < start);
    const completedToday = scopedEntries.filter((entry) => entryOperationalDate(entry) === localDateKey(operationalDate));
    const todayTasks = businessTasks.filter((task) => task.dueAt >= start && task.dueAt < end);
    const plannedControls = todayTasks.filter((task) => task.area === "Plano do Dia");
    const adHocTasks = businessTasks.filter((task) => task.area !== "Plano do Dia");
    const hasScheduleForSelectedDate = todayTasks.length > 0;
    const visibleAdHocTasks = hasScheduleForSelectedDate ? adHocTasks.filter((task) => task.dueAt >= start && task.dueAt < end) : [];
    const visiblePending = hasScheduleForSelectedDate ? pending : [];
    const visibleOverdue = hasScheduleForSelectedDate ? overdue : [];
    const completedTasksToday = todayTasks.filter((task) => task.status === "completed");
    const monthlyChecklistPlannedThisMonth = businessTasks.some((task) => task.module === "monthly_checklist" && task.dueAt.getFullYear() === operationalDate.getFullYear() && task.dueAt.getMonth() === operationalDate.getMonth());
    const monthlyChecklistReminder = !input?.factoryId && operationalDate.getDate() >= 20 && !monthlyChecklistPlannedThisMonth;
    const foodDefensePlannedThisYear = businessTasks.some((task) => task.module === "food_defense" && task.dueAt.getFullYear() === operationalDate.getFullYear());
    const foodDefenseReminder = !input?.factoryId && !foodDefensePlannedThisYear;
    const payloadFor = (entry: typeof entries[number]) => entryPayload(entry);
    const lastFragileInspections = new Map<number, Date>();
    const lastFragileInspectionsBeforeDay = new Map<number, Date>();
    scopedEntries.filter((entry) => entry.module === "fragile_items").forEach((entry) => {
      const payload = entry.payload;
      const fragileItemId = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { fragileItemId?: unknown }).fragileItemId : null;
      if (typeof fragileItemId === "number") {
        if (!lastFragileInspections.has(fragileItemId)) lastFragileInspections.set(fragileItemId, entry.completedAt);
        if (entry.completedAt < start && !lastFragileInspectionsBeforeDay.has(fragileItemId)) lastFragileInspectionsBeforeDay.set(fragileItemId, entry.completedAt);
      }
    });
    const isPlannedControlCompleted = (task: typeof plannedControls[number]) => task.status === "completed" || (task.module === "metal_detectors" ? metalDetectorsTaskComplete(task, completedToday.filter((entry) => entryMatchesPlannedTask(entry, task)), areaCatalog) : task.module === "monthly_checklist" ? monthlyChecklistTaskComplete(task, completedToday.filter((entry) => entryMatchesPlannedTask(entry, task)), monthlyItems, monthlyAssignments) : task.module === "food_defense" ? foodDefenseTaskComplete(completedToday.filter((entry) => entryMatchesPlannedTask(entry, task))) : completedToday.some((entry) => entryMatchesPlannedTask(entry, task)));
    const completedPlannedControls = plannedControls.filter(isPlannedControlCompleted);
    const dailyExpectedCount = todayTasks.length;
    const dailyCompletedCount = completedTasksToday.length + completedPlannedControls.filter((task) => task.status !== "completed").length;
    const effectiveDailyExpectedCount = dailyExpectedCount;
    const visibleFactories = input?.factoryId ? factoryCatalog.filter((factory) => factory.id === input.factoryId) : factoryCatalog;
    const moduleProgressByFactory = Object.fromEntries(qualityModuleValues.map((module) => [module, visibleFactories.map((factory) => {
      const factoryControls = plannedControls.filter((task) => task.module === module && task.factoryId === factory.id);
      const isAnnualFoodDefense = module === "food_defense";
      if (!isAnnualFoodDefense && !factoryControls.length) return { factoryId: factory.id, expected: 0, completed: 0, registeredToday: 0, percentage: 0 };
      const pendingControl = factoryControls.find((task) => task.status === "pending");
      const factoryEntriesToday = module === "food_defense"
        ? scopedEntries.filter((entry) => entry.module === module && entry.factoryId === factory.id && entry.completedAt.getFullYear() === operationalDate.getFullYear())
        : completedToday.filter((entry) => entry.module === module && entry.factoryId === factory.id);
      let expected = isAnnualFoodDefense ? 1 : factoryControls.length;
      let completed = isAnnualFoodDefense ? 0 : factoryControls.filter(isPlannedControlCompleted).length;
      if (module === "fragile_items") {
        const applicablePoints = fragileCatalog.filter((item) => item.factoryId === factory.id && item.status === "active" && isFragileInspectionPending(item.periodicity, lastFragileInspectionsBeforeDay.get(item.id), operationalDate));
        expected = applicablePoints.length;
        const completedPointIds = new Set(factoryEntriesToday.map((entry) => payloadFor(entry).fragileItemId).filter((id): id is number => typeof id === "number"));
        completed = applicablePoints.filter((item) => completedPointIds.has(item.id)).length;
      } else if (module === "bphf") {
        const bphfAreaCount = areaCatalog.filter((area) => area.group === "bphf" && area.factoryId === factory.id && area.active === "true" && BPHF_AREA_NAMES.includes(area.name as typeof BPHF_AREA_NAMES[number])).length || BPHF_AREA_NAMES.length;
        expected = BPHF_PROGRESS_CRITERIA_COUNT * bphfAreaCount;
        const completedKeys = new Set(factoryEntriesToday.map((entry) => {
          const payload = payloadFor(entry);
          const criterion = typeof payload.criterion === "string" ? payload.criterion : entry.title;
          return `${criterion}::${entry.area}`;
        }));
        completed = completedKeys.size;
      } else if (module === "monthly_checklist") {
        const activeItems = monthlyItems.filter((item) => item.active === "true" && (monthlyAssignments.some((assignment) => assignment.checklistItemId === item.id) ? monthlyAssignments.some((assignment) => assignment.checklistItemId === item.id && assignment.factoryId === factory.id) : true));
        expected = activeItems.length;
        const currentMonthStart = new Date(operationalDate.getFullYear(), operationalDate.getMonth(), 1);
        const currentMonthEnd = new Date(operationalDate.getFullYear(), operationalDate.getMonth() + 1, 1);
        const completedItemIds = new Set(scopedEntries.filter((entry) => entry.module === "monthly_checklist" && entry.factoryId === factory.id && entry.completedAt >= currentMonthStart && entry.completedAt < currentMonthEnd).map((entry) => payloadFor(entry).checklistItemId).filter((id): id is number => typeof id === "number"));
        completed = activeItems.filter((item) => completedItemIds.has(item.id)).length;
      } else if (module === "temperature_controls") {
        expected = factory.id === 1 ? 2 : factory.id === 2 ? 1 : 0;
        const completedEquipmentIds = new Set(factoryEntriesToday.flatMap((entry) => Array.isArray(payloadFor(entry).equipment) ? payloadFor(entry).equipment : []).map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).id : null).filter((id): id is string => typeof id === "string"));
        completed = completedEquipmentIds.size;
      } else if (module === "food_defense") {
        expected = FOOD_DEFENSE_EXPECTED_CRITERIA;
        const latestAssessment = factoryEntriesToday[0];
        const criteria: unknown[] = latestAssessment && Array.isArray(payloadFor(latestAssessment).criteria) ? payloadFor(latestAssessment).criteria as unknown[] : [];
        completed = criteria.length;
      }
      completed = Math.min(completed, expected);
      return { factoryId: factory.id, expected, completed, registeredToday: expected ? completed : 0, percentage: expected ? Number((completed / expected * 100).toFixed(1)) : 0, ...(pendingControl && completed < expected ? { pendingTaskId: pendingControl.id } : {}) };
    })]));
    const moduleProgress = Object.fromEntries(qualityModuleValues.map((module) => {
      const factoryProgress = moduleProgressByFactory[module] ?? [];
      const moduleControls = plannedControls.filter((task) => task.module === module);
      const isSharedModule = sharedPlanModules.has(module);
      const expected = isSharedModule ? moduleControls.length : factoryProgress.reduce((sum, item) => sum + item.expected, 0);
      const completed = isSharedModule ? moduleControls.filter(isPlannedControlCompleted).length : factoryProgress.reduce((sum, item) => sum + item.completed, 0);
      const pendingTaskTitles = moduleControls.filter((task) => !isPlannedControlCompleted(task)).map((task) => task.title);
      const completionTimes = completedToday.filter((entry) => entry.module === module && moduleControls.some((task) => task.factoryId === null || task.factoryId === entry.factoryId)).map((entry) => entry.completedAt);
      const lastCompletedAt = completionTimes.reduce<Date | undefined>((latest, date) => !latest || date > latest ? date : latest, undefined);
      return [module, { expected, completed, registeredToday: expected ? completed : 0, pending: Array.from(new Set(pendingTaskTitles)), percentage: expected ? Number((completed / expected * 100).toFixed(1)) : 0, lastCompletedAt }];
    }));
    const critical = scopedNcs.filter((nc) => nc.status !== "closed" && nc.severity === "critical");
    const openActions = scopedActions.filter((action) => action.status !== "verified");
    const fragilePending = plannedControls.some((task) => task.module === "fragile_items") ? scopedFragileCatalog.filter((item) => item.status === "active" && isFragileInspectionPending(item.periodicity, lastFragileInspections.get(item.id), now)) : [];

    return {
      tasks: visibleAdHocTasks.slice(0, 20),
      plannedControls: plannedControls.map((task) => ({ ...task, completed: isPlannedControlCompleted(task) })),
      operationalDate,
      taskGroups: {
        today: visibleAdHocTasks,
        tomorrow: hasScheduleForSelectedDate ? adHocTasks.filter((task) => task.dueAt >= tomorrowStart && task.dueAt < tomorrowEnd) : [],
        thisWeek: hasScheduleForSelectedDate ? adHocTasks.filter((task) => task.dueAt >= workingWeekStart && task.dueAt < workingWeekEnd && !(task.dueAt >= start && task.dueAt < tomorrowEnd)) : [],
      },
      criticalNcs: critical.slice(0, 6),
      dueActions: openActions.filter((action) => action.dueAt && action.dueAt < now).slice(0, 6),
      metrics: {
        pending: visiblePending.length,
        overdue: visibleOverdue.length,
        criticalOpen: critical.length,
        completedToday: completedToday.length,
        fragilePending: fragilePending.length,
        dailyExecutionRate: effectiveDailyExpectedCount ? Number((dailyCompletedCount / effectiveDailyExpectedCount * 100).toFixed(1)) : 0,
      },
      moduleProgress,
      moduleProgressByFactory,
      monthlyChecklistReminder,
      foodDefenseReminder,
    };
  }),

  controlObservations: qualitySessionProcedure.input(z.object({ module: qualityModuleSchema, factoryId: z.number().int() })).query(async ({ input }) => {
    const db = await requireDb();
    const operationalDate = nextBusinessDay(new Date());
    const { start, end } = asDateRange(operationalDate);
    const entries = await db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt));
    return {
      operationalDate,
      entries: entries.filter((entry) => entry.module === input.module && entry.factoryId === input.factoryId && entry.completedAt >= start && entry.completedAt < end).map((entry) => ({ id: entry.id, title: entry.title, area: entry.area, result: entry.result, notes: entry.notes, payload: entry.payload, completedAt: entry.completedAt, registeredByName: entry.registeredByName, registeredByTitle: entry.registeredByTitle })),
    };
  }),

  temperatureHistory: qualitySessionProcedure.input(z.object({
    startDate: dateInput.optional(),
    endDate: dateInput.optional(),
    equipmentId: z.string().trim().min(1).max(100).optional(),
  }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const entries = await db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt));
    const start = input?.startDate ? asDateRange(input.startDate).start : null;
    const end = input?.endDate ? asDateRange(input.endDate).end : null;
    return entries.filter((entry) => {
      const payload = typeof entry.payload === "string" ? (() => { try { return JSON.parse(entry.payload) as Record<string, unknown>; } catch { return {}; } })() : (entry.payload && typeof entry.payload === "object" ? entry.payload as Record<string, unknown> : {});
      if (entry.module !== "temperature_controls" || payload.deletedAt) return false;
      if (start && entry.completedAt < start) return false;
      if (end && entry.completedAt > end) return false;
      return true;
    }).flatMap((entry) => {
      const payload = typeof entry.payload === "string" ? (() => { try { return JSON.parse(entry.payload) as Record<string, unknown>; } catch { return {}; } })() : (entry.payload && typeof entry.payload === "object" ? entry.payload as Record<string, unknown> : {});
      const equipment = Array.isArray(payload.equipment) ? payload.equipment : [];
      return equipment.flatMap((item: unknown) => {
        const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const equipmentId = typeof value.id === "string" ? value.id : "";
        if (!equipmentId || (input?.equipmentId && equipmentId !== input.equipmentId)) return [];
        return [{
          entryId: entry.id,
          equipmentId,
          name: typeof value.name === "string" ? value.name : "Equipamento",
          area: typeof value.area === "string" ? value.area : entry.area,
          limit: typeof value.limit === "number" ? value.limit : null,
          temperature: typeof value.temperature === "number" ? value.temperature : null,
          result: typeof value.result === "string" ? value.result : entry.result,
          notes: typeof value.notes === "string" ? value.notes : null,
          completedAt: entry.completedAt,
          factoryId: entry.factoryId,
          registeredByName: entry.registeredByName,
          registeredByTitle: entry.registeredByTitle,
        }];
      });
    });
  }),

  listTasks: qualitySessionProcedure.input(z.object({ factoryId: z.number().int().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const [tasks, entries, areaCatalog, monthlyItems, monthlyAssignments] = await Promise.all([
      db.select().from(controlTasks).orderBy(controlTasks.dueAt),
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(areas).orderBy(areas.name),
      db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
      db.select().from(checklistItemFactories).orderBy(checklistItemFactories.factoryId),
    ]);
    const profile = ctx.operatorProfile!;
    return scopeToFactory(tasks, input?.factoryId).filter((task) => {
      const assignees = Array.isArray(task.assigneeProfileIds) ? task.assigneeProfileIds : [];
      const completedFromPreviousRegistration = task.status === "pending" && task.area === "Plano do Dia" && isHistoricalPlanTaskSatisfied(task, entries, areaCatalog, monthlyItems, monthlyAssignments);
      return isBusinessDay(task.dueAt) && task.status !== "cancelled" && !completedFromPreviousRegistration && (profile.role === "manager" || assignees.includes(profile.id));
    }).map((task) => {
      const report = entries.find((entry) => entry.payload?.taskId === task.id);
      const storedPhotos = report?.payload && typeof report.payload.executionReport === "object" && report.payload.executionReport && !Array.isArray(report.payload.executionReport) ? (report.payload.executionReport as { evidencePhotos?: unknown }).evidencePhotos : [];
      const evidencePhotos = Array.isArray(storedPhotos) ? storedPhotos.filter((photo): photo is { url: string; fileName: string; mimeType: string } => Boolean(photo && typeof photo === "object" && typeof (photo as { url?: unknown }).url === "string" && typeof (photo as { fileName?: unknown }).fileName === "string" && typeof (photo as { mimeType?: unknown }).mimeType === "string")) : [];
      const qualityModule = task.area === "Plano do Dia" ? task.module : null;
      return report ? { ...task, qualityModule, executionReport: { result: report.result, notes: report.notes, completedAt: report.completedAt, registeredByName: report.registeredByName, registeredByTitle: report.registeredByTitle, evidencePhotos } } : { ...task, qualityModule, executionReport: null };
    });
  }),

  createTask: qualityManagerProcedure.input(z.object({
    title: z.string().min(2).max(180),
    description: z.string().max(3000).optional(),
    factoryId: z.number().int().optional(),
    dueAt: dateInput,
    assigneeProfileIds: z.array(z.number().int()).min(1).max(10),
  })).mutation(async ({ ctx, input }) => {
    if (!isBusinessDay(input.dueAt)) throw new TRPCError({ code: "BAD_REQUEST", message: "As tarefas de controlo só podem ser agendadas em dias úteis, de segunda a sexta-feira." });
    const db = await requireDb();
    const selectedProfiles = await db.select().from(qualityPinProfiles).where(inArray(qualityPinProfiles.id, input.assigneeProfileIds)).orderBy(qualityPinProfiles.id);
    const profiles = selectedProfiles.filter((profile) => input.assigneeProfileIds.includes(profile.id));
    if (profiles.length !== input.assigneeProfileIds.length || profiles.some((profile) => profile.active !== "true")) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione utilizadores ativos para a tarefa." });
    await db.insert(controlTasks).values({ title: input.title, description: input.description?.trim() || null, module: "bphf", area: "Sem área", factoryId: input.factoryId ?? null, dueAt: input.dueAt, responsible: profiles.map((profile) => profile.name).join(", "), assigneeProfileIds: input.assigneeProfileIds, createdBy: ctx.user!.openId });
    return { success: true };
  }),

  publishDailyPlan: qualityManagerProcedure.input(z.object({
    date: dateInput,
    factoryIds: z.array(z.number().int()).min(1).max(10),
    assigneeProfileIds: z.array(z.number().int()).min(1).max(10),
    modules: z.array(qualityModuleSchema).min(1).max(8),
    priority: z.enum(["normal", "critical"]).default("normal"),
  })).mutation(async ({ ctx, input }) => {
    if (!isBusinessDay(input.date)) throw new TRPCError({ code: "BAD_REQUEST", message: "O Plano do Dia só pode ser publicado para um dia útil." });
    const db = await requireDb();
    const profiles = await db.select().from(qualityPinProfiles).where(inArray(qualityPinProfiles.id, input.assigneeProfileIds)).orderBy(qualityPinProfiles.id);
    if (profiles.length !== input.assigneeProfileIds.length || profiles.some((profile) => profile.active !== "true")) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione responsáveis ativos para o Plano do Dia." });
    const existing = await db.select().from(controlTasks).where(and(eq(controlTasks.dueAt, input.date), eq(controlTasks.status, "pending")));
    const selectedFactories = Array.from(new Set(input.factoryIds));
    const temperatureFactories = selectedFactories.filter((factoryId) => [1, 2].includes(factoryId));
    if (input.modules.includes("temperature_controls") && !temperatureFactories.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a Fábrica 1 ou a Fábrica 2 para publicar os Controlos de Temperatura." });
    const plannedControls: { module: typeof qualityModuleValues[number]; factoryId: number | null }[] = [];
    for (const module of Array.from(new Set(input.modules))) {
      if (sharedPlanModules.has(module)) plannedControls.push({ module, factoryId: null });
      else (module === "temperature_controls" ? temperatureFactories : selectedFactories).forEach((factoryId) => plannedControls.push({ module, factoryId }));
    }
    const controls = plannedControls.filter(({ module, factoryId }) => !existing.some((task) => task.module === module && task.factoryId === factoryId));
    if (controls.length) await db.insert(controlTasks).values(controls.map(({ module, factoryId }) => ({
      title: `Plano do Dia — ${module.replace(/_/g, " ")}`,
      description: input.priority === "critical" ? "Controlo prioritário publicado pela Responsável de Qualidade." : "Controlo publicado no Plano do Dia.",
      module,
      area: "Plano do Dia",
      factoryId,
      dueAt: input.date,
      responsible: profiles.map((profile) => profile.name).join(", "),
      assigneeProfileIds: input.assigneeProfileIds,
      createdBy: ctx.user!.openId,
    })));
    return { success: true, created: controls.length };
  }),

  updateTask: qualityManagerProcedure.input(z.object({
    id: z.number().int(),
    title: z.string().min(2).max(180),
    description: z.string().max(3000).optional(),
    factoryId: z.number().int().optional(),
    dueAt: dateInput,
    assigneeProfileIds: z.array(z.number().int()).min(1).max(10),
  })).mutation(async ({ input }) => {
    if (!isBusinessDay(input.dueAt)) throw new TRPCError({ code: "BAD_REQUEST", message: "As tarefas de controlo só podem ser agendadas em dias úteis, de segunda a sexta-feira." });
    const db = await requireDb();
    const task = (await db.select().from(controlTasks).where(eq(controlTasks.id, input.id)).limit(1))[0];
    if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada." });
    if (task.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível editar tarefas ainda pendentes." });
    const selectedProfiles = await db.select().from(qualityPinProfiles).where(inArray(qualityPinProfiles.id, input.assigneeProfileIds)).orderBy(qualityPinProfiles.id);
    const profiles = selectedProfiles.filter((profile) => input.assigneeProfileIds.includes(profile.id));
    if (profiles.length !== input.assigneeProfileIds.length || profiles.some((profile) => profile.active !== "true")) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione utilizadores ativos para a tarefa." });
    await db.update(controlTasks).set({ title: input.title.trim(), description: input.description?.trim() || null, factoryId: input.factoryId ?? null, dueAt: input.dueAt, responsible: profiles.map((profile) => profile.name).join(", "), assigneeProfileIds: input.assigneeProfileIds }).where(eq(controlTasks.id, input.id));
    return { success: true };
  }),

  deleteTask: qualityManagerProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const task = (await db.select().from(controlTasks).where(eq(controlTasks.id, input.id)).limit(1))[0];
    if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada." });
    if (task.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível eliminar tarefas ainda pendentes." });
    await db.update(controlTasks).set({ status: "cancelled" }).where(eq(controlTasks.id, input.id));
    return { success: true };
  }),

  uploadTaskReportPhoto: qualityOperatorProcedure.input(z.object({
    taskId: z.number().int(),
    fileName: z.string().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    dataUrl: z.string().min(20).max(7_000_000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const task = (await db.select().from(controlTasks).where(eq(controlTasks.id, input.taskId)).limit(1))[0];
    if (!task || task.status !== "pending") throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa pendente não encontrada." });
    const assignees = Array.isArray(task.assigneeProfileIds) ? task.assigneeProfileIds : [];
    if (ctx.operatorProfile!.role !== "manager" && (!assignees.length || !assignees.includes(ctx.operatorProfile!.id))) throw new TRPCError({ code: "FORBIDDEN", message: "Esta tarefa está atribuída a outro utilizador." });
    const base64 = input.dataUrl.split(",")[1];
    if (!base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { key, url } = await storagePut(`task-reports/${input.taskId}/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`, Buffer.from(base64, "base64"), input.mimeType);
    return { key, url, fileName: input.fileName, mimeType: input.mimeType };
  }),

  uploadInternalAnalysisPhoto: qualityOperatorProcedure.input(z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    dataUrl: z.string().min(20).max(7_000_000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireControlAuthorization(db, { module: "internal_analysis", factoryId: null, profile: ctx.operatorProfile! });
    const base64 = input.dataUrl.split(",")[1];
    if (!base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { key, url } = await storagePut(`internal-analysis/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`, Buffer.from(base64, "base64"), input.mimeType);
    return { key, url, fileName: input.fileName, mimeType: input.mimeType };
  }),

  completeTask: qualityOperatorProcedure.input(z.object({
    id: z.number().int(),
    result: resultSchema,
    notes: z.string().trim().min(3).max(3000),
    evidencePhotos: z.array(z.object({ url: z.string().startsWith("/manus-storage/task-reports/"), fileName: z.string().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) })).max(5).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const task = (await db.select().from(controlTasks).where(eq(controlTasks.id, input.id)).limit(1))[0];
    const assignees = Array.isArray(task?.assigneeProfileIds) ? task.assigneeProfileIds : [];
    if (task && ctx.operatorProfile!.role !== "manager" && (!assignees.length || !assignees.includes(ctx.operatorProfile!.id))) throw new TRPCError({ code: "FORBIDDEN", message: "Esta tarefa está atribuída a outro utilizador." });
    if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada." });
    if (task.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Esta tarefa já não está pendente." });
    const completedAt = new Date();
    await db.update(controlTasks).set({ status: "completed", completedAt, completedByProfileId: ctx.operatorProfile!.id, completedByName: ctx.operatorProfile!.name, completedByTitle: ctx.operatorProfile!.title }).where(eq(controlTasks.id, input.id));
    await db.insert(controlEntries).values({
      module: task.module,
      title: task.title,
      area: task.area,
      factoryId: task.factoryId,
      result: input.result,
      notes: input.notes,
      payload: { taskId: task.id, executionReport: { evidencePhotos: input.evidencePhotos ?? [] } },
      completedAt,
      registeredByProfileId: ctx.operatorProfile!.id,
      registeredByName: ctx.operatorProfile!.name,
      registeredByTitle: ctx.operatorProfile!.title,
      createdBy: ctx.user!.openId,
    });
    return { success: true, critical: shouldCreateCriticalMetalAlert(task.module, input.result), incidence: input.result === "NC" };
  }),

  updateControlEntry: qualityOperatorProcedure.input(z.object({
    id: z.number().int(),
    title: z.string().trim().min(2).max(180),
    area: z.string().trim().min(1).max(120),
    result: resultSchema,
    notes: z.string().trim().max(3000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const entry = (await db.select().from(controlEntries).where(eq(controlEntries.id, input.id)).limit(1))[0];
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Registo de controlo não encontrado." });
    const isManager = ctx.operatorProfile!.role === "manager";
    const isAuthor = entry.registeredByProfileId === ctx.operatorProfile!.id || (!entry.registeredByProfileId && entry.registeredByName === ctx.operatorProfile!.name);
    if (!isManager && !isAuthor) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o técnico que registou este controlo ou a Responsável de Qualidade o pode editar." });
    const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? { ...entry.payload } as Record<string, unknown> : {};
    const history = Array.isArray(payload.editHistory) ? payload.editHistory : [];
    const editedAt = new Date().toISOString();
    await db.update(controlEntries).set({
      title: input.title,
      area: input.area,
      result: input.result,
      notes: input.notes?.trim() || null,
      payload: { ...payload, editHistory: [...history, { action: "updated", at: editedAt, byProfileId: ctx.operatorProfile!.id, byName: ctx.operatorProfile!.name, byTitle: ctx.operatorProfile!.title }] },
    }).where(eq(controlEntries.id, input.id));
    return { success: true };
  }),

  deleteControlEntry: qualityOperatorProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const entry = (await db.select().from(controlEntries).where(eq(controlEntries.id, input.id)).limit(1))[0];
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Registo de controlo não encontrado." });
    const isManager = ctx.operatorProfile!.role === "manager";
    const isAuthor = entry.registeredByProfileId === ctx.operatorProfile!.id || (!entry.registeredByProfileId && entry.registeredByName === ctx.operatorProfile!.name);
    if (!isManager && !isAuthor) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o técnico que registou este controlo ou a Responsável de Qualidade o pode eliminar." });
    const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? { ...entry.payload } as Record<string, unknown> : {};
    const history = Array.isArray(payload.editHistory) ? payload.editHistory : [];
    const deletedAt = new Date().toISOString();
    await db.update(controlEntries).set({ payload: { ...payload, recordLifecycle: { status: "deleted", deletedAt, deletedByProfileId: ctx.operatorProfile!.id, deletedByName: ctx.operatorProfile!.name, deletedByTitle: ctx.operatorProfile!.title }, editHistory: [...history, { action: "deleted", at: deletedAt, byProfileId: ctx.operatorProfile!.id, byName: ctx.operatorProfile!.name, byTitle: ctx.operatorProfile!.title }] } }).where(eq(controlEntries.id, input.id));
    return { success: true };
  }),

  createEntry: qualityOperatorProcedure.input(z.object({
    module: qualityModuleSchema,
    title: z.string().min(2).max(180),
    area: z.string().min(2).max(120),
    factoryId: z.number().int().optional(),
    result: resultSchema.optional(),
    notes: z.string().max(3000).optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    performedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    retroactiveReason: retroactiveReasonSchema.optional(),
    retroactiveJustification: z.string().trim().max(1500).optional(),
    plannedTaskId: z.number().int().optional(),
    createNonconformity: z.boolean().default(false),
    severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const authorization = await requireControlAuthorization(db, { module: input.module, factoryId: input.factoryId ?? null, plannedTaskId: input.plannedTaskId, profile: ctx.operatorProfile! });
    const plannedDateKey = authorization.task?.dueAt ? localDateKey(new Date(authorization.task.dueAt)) : null;
    const todayKey = localDateKey(new Date());
    if (input.performedAt && (!authorization.isPreviousPending || !plannedDateKey || input.performedAt < plannedDateKey || input.performedAt > todayKey)) throw new TRPCError({ code: "BAD_REQUEST", message: "A data de realização deve situar-se entre a data prevista do controlo e hoje." });
    if (authorization.isPreviousPending && !input.retroactiveReason) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione a justificação do preenchimento fora da data prevista." });
    if (authorization.isPreviousPending && input.retroactiveReason === "technical_unavailability" && !input.performedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Indique a data real da verificação efetuada após a indisponibilidade técnica." });
    if (authorization.isPreviousPending && input.retroactiveReason === "other" && !input.retroactiveJustification?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Indique a justificação para a opção selecionada." });
    const completedAt = input.performedAt ? new Date(`${input.performedAt}T12:00:00`) : new Date();
    const insertedEntry = await db.insert(controlEntries).values({
      module: input.module,
      title: input.title,
      area: input.area,
      factoryId: input.factoryId ?? null,
      result: input.result ?? null,
      notes: input.notes ?? null,
      payload: {
        ...input.payload,
        plannedTaskId: authorization.task?.id ?? null,
        plannedDate: authorization.task?.dueAt ? new Date(authorization.task.dueAt).toISOString() : null,
        registeredAgainstPreviousPlan: authorization.isPreviousPending ?? false,
        actualVerificationDate: input.performedAt ?? localDateKey(completedAt),
        retroactiveJustification: authorization.isPreviousPending && input.retroactiveReason ? { code: input.retroactiveReason, label: retroactiveReasonLabels[input.retroactiveReason], details: input.retroactiveReason === "other" ? input.retroactiveJustification?.trim() ?? null : null } : null,
      },
      completedAt,
      registeredByProfileId: ctx.operatorProfile!.id,
      registeredByName: ctx.operatorProfile!.name,
      registeredByTitle: ctx.operatorProfile!.title,
      createdBy: ctx.user!.openId,
    });
    const oneSubmissionModules: Array<typeof qualityModuleValues[number]> = ["sensory", "shelf_life", "suggestion_boxes", "dispatch_control", "internal_analysis", "temperature_controls"];
    let plannedControlComplete = Boolean(authorization.task && oneSubmissionModules.includes(input.module));
    if (authorization.task && ["bphf", "metal_detectors", "fragile_items", "monthly_checklist", "food_defense"].includes(input.module)) {
      const [taskEntries, progressAreas, progressFragileItems, progressChecklistItems, progressChecklistAssignments] = await Promise.all([
        db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
        db.select().from(areas).orderBy(areas.name),
        db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
        db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
        db.select().from(checklistItemFactories).orderBy(checklistItemFactories.factoryId),
      ]);
      const taskPayload = (entry: typeof taskEntries[number]) => entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? entry.payload as Record<string, unknown> : {};
      const taskEntriesForPlan = taskEntries.filter((entry) => entry.module === input.module && entry.factoryId === authorization.task!.factoryId && taskPayload(entry).plannedTaskId === authorization.task!.id);
      if (input.module === "bphf") {
        const expectedAreas = progressAreas.filter((area) => area.group === "bphf" && area.factoryId === authorization.task!.factoryId && area.active === "true" && BPHF_AREA_NAMES.includes(area.name as typeof BPHF_AREA_NAMES[number])).map((area) => area.name);
        const expected = (expectedAreas.length || BPHF_AREA_NAMES.length) * BPHF_PROGRESS_CRITERIA_COUNT;
        const completePointAreas = new Set(taskEntriesForPlan.map((entry) => `${taskPayload(entry).criterion ?? entry.title}::${entry.area}`));
        plannedControlComplete = completePointAreas.size >= expected;
      } else if (input.module === "metal_detectors") {
        const expectedAreas = progressAreas.filter((area) => area.group === "metal" && area.factoryId === authorization.task!.factoryId && area.active === "true").map((area) => area.name);
        const completedAreas = new Set(taskEntriesForPlan.map((entry) => entry.area));
        plannedControlComplete = expectedAreas.length > 0 && expectedAreas.every((area) => completedAreas.has(area));
      } else if (input.module === "monthly_checklist") {
        const expectedItemIds = progressChecklistItems.filter((item) => item.active === "true" && (progressChecklistAssignments.some((assignment) => assignment.checklistItemId === item.id) ? progressChecklistAssignments.some((assignment) => assignment.checklistItemId === item.id && assignment.factoryId === authorization.task!.factoryId) : true)).map((item) => item.id);
        const completedItemIds = new Set(taskEntriesForPlan.map((entry) => taskPayload(entry).checklistItemId).filter((id): id is number => typeof id === "number"));
        plannedControlComplete = expectedItemIds.length > 0 && expectedItemIds.every((id) => completedItemIds.has(id));
      } else if (input.module === "food_defense") {
        const criteria = Array.isArray(input.payload.criteria) ? input.payload.criteria : [];
        plannedControlComplete = criteria.length >= FOOD_DEFENSE_EXPECTED_CRITERIA;
      } else if (input.module === "fragile_items") {
        const priorInspections = new Map<number, Date>();
        taskEntries.filter((entry) => entry.module === "fragile_items" && entry.completedAt < new Date(authorization.task!.dueAt)).forEach((entry) => {
          const itemId = taskPayload(entry).fragileItemId;
          if (typeof itemId === "number" && !priorInspections.has(itemId)) priorInspections.set(itemId, entry.completedAt);
        });
        const expectedItemIds = progressFragileItems.filter((item) => item.factoryId === authorization.task!.factoryId && item.status === "active" && isFragileInspectionPending(item.periodicity, priorInspections.get(item.id), new Date(authorization.task!.dueAt))).map((item) => item.id);
        const completedItemIds = new Set(taskEntriesForPlan.map((entry) => taskPayload(entry).fragileItemId).filter((id): id is number => typeof id === "number"));
        plannedControlComplete = expectedItemIds.length > 0 && expectedItemIds.every((id) => completedItemIds.has(id));
      }
    }
    if (authorization.task && plannedControlComplete) {
      await db.update(controlTasks).set({ status: "completed", completedAt, completedByProfileId: ctx.operatorProfile!.id, completedByName: ctx.operatorProfile!.name, completedByTitle: ctx.operatorProfile!.title }).where(eq(controlTasks.id, authorization.task.id));
      if (authorization.isPreviousPending) {
        try {
          await createRetroactiveDailyReportRevision({ taskId: authorization.task.id, entryId: Number((insertedEntry as any)?.[0]?.insertId) || null, dueAt: new Date(authorization.task.dueAt), module: input.module, reason: retroactiveReasonLabels[input.retroactiveReason!], createdBy: ctx.operatorProfile!.name });
        } catch (error) {
          console.error("[DailyReportArchive] Não foi possível criar a revisão retroativa", error);
        }
      }
    }
    const isCriticalMetal = shouldCreateCriticalMetalAlert(input.module, input.result);
    return { success: true, critical: isCriticalMetal, incidence: input.result === "NC" };
  }),

  calculateSensory: qualitySessionProcedure.input(z.object({
    aspeto: z.number().int().min(1).max(5),
    fimDeBoca: z.number().int().min(1).max(5),
    cor: z.number().int().min(1).max(5),
    cheiro: z.number().int().min(1).max(5),
    textura: z.number().int().min(1).max(5),
    sabor: z.number().int().min(1).max(5),
  })).query(({ input }) => calculateSensoryScore(input)),

  calculateDispatchConformity: qualitySessionProcedure.input(z.object({
    orderedBoxes: z.number().int().min(0),
    dispatchedBoxes: z.number().int().min(0),
    productLabelResult: z.enum(["C", "NC"]),
    boxLabelResult: z.enum(["C", "NC"]),
    productTemperature: z.number().min(-100).max(100),
    vehicleTemperature: z.number().min(-100).max(100),
    productTemperatureLimit: z.number().min(-100).max(100),
    vehicleTemperatureLimit: z.number().min(-100).max(100),
  })).query(({ input }) => calculateDispatchConformity(input)),

  parseDispatchOrderPdf: qualityOperatorProcedure.input(z.object({
    fileName: z.string().min(5).max(180),
    mimeType: z.literal("application/pdf"),
    dataUrl: z.string().min(32).max(16_500_000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireControlAuthorization(db, { module: "dispatch_control", factoryId: null, profile: ctx.operatorProfile! });
    const match = /^data:application\/pdf;base64,([A-Za-z0-9+/=\s]+)$/i.exec(input.dataUrl);
    if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "O ficheiro enviado não é um PDF válido." });
    const pdfBuffer = Buffer.from(match[1].replace(/\s/g, ""), "base64");
    if (!pdfBuffer.subarray(0, 4).equals(Buffer.from("%PDF"))) throw new TRPCError({ code: "BAD_REQUEST", message: "O ficheiro enviado não corresponde a um documento PDF." });
    if (pdfBuffer.byteLength > 12_000_000) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "A encomenda PDF deve ter no máximo 12 MB." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const stored = await storagePut(`dispatch-orders/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`, pdfBuffer, input.mimeType);
    const signedUrl = await storageGetSignedUrl(stored.key);
    try {
      const response = await invokeLLM({
        model: "gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Extrai dados de encomendas de panificação em PDF. Nunca inventes valores: quando um campo não estiver legível, devolve uma string vazia, lista vazia ou uma advertência. Quantidades são números inteiros de caixas/unidades pedidas. Devolve apenas JSON conforme o esquema." },
          { role: "user", content: [{ type: "text", text: "Extrai o número da encomenda, cliente e todas as linhas de produto com quantidade pedida." }, { type: "file_url", file_url: { url: signedUrl, mime_type: "application/pdf" } }] },
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
                products: { type: "array", items: { type: "object", properties: { name: { type: "string" }, orderedQuantity: { type: "integer" } }, required: ["name", "orderedQuantity"], additionalProperties: false } },
                warnings: { type: "array", items: { type: "string" } },
              },
              required: ["orderNumber", "customer", "products", "warnings"],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices[0]?.message.content;
      const extracted = dispatchOrderExtractionSchema.parse(JSON.parse(typeof content === "string" ? content : "{}"));
      return { ...extracted, document: { name: input.fileName, url: stored.url } };
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível extrair os dados da encomenda. Confirme se o PDF está legível e preencha os campos manualmente." });
    }
  }),

  registerDispatchControl: qualityOperatorProcedure.input(z.object({
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
    orderItems: z.array(z.object({ name: z.string().min(1).max(180), orderedQuantity: z.number().int().min(0) })).max(30).optional(),
    productChecks: z.array(z.object({
      name: z.string().min(2).max(180),
      orderedQuantity: z.number().int().min(0),
      lots: z.array(z.object({ lot: z.string().min(1).max(120), dispatchedQuantity: z.number().int().min(0) })).min(1).max(20),
      productLabelResult: z.enum(["C", "NC"]),
      boxLabelResult: z.enum(["C", "NC"]),
      productTemperature: z.number().min(-100).max(100),
      observations: z.string().max(3000).optional(),
    })).min(1).max(30).optional(),
    evidencePhotos: z.array(z.object({ key: z.string().min(1), url: z.string().startsWith("/manus-storage/"), fileName: z.string().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) })).max(5).optional(),
    sourceOrderDocument: z.object({ name: z.string().min(1).max(180), url: z.string().startsWith("/manus-storage/") }).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireControlAuthorization(db, { module: "dispatch_control", factoryId: null, profile: ctx.operatorProfile! });
    const profile = getDispatchProfile(input.profile);
    const limits = { product: profile.productTemperatureLimit, vehicle: profile.vehicleTemperatureLimit };
    const productChecks = input.productChecks ?? [{ name: input.product, orderedQuantity: input.orderedBoxes, lots: [{ lot: input.lot, dispatchedQuantity: input.dispatchedBoxes }], productLabelResult: input.productLabelResult, boxLabelResult: input.boxLabelResult, productTemperature: input.productTemperature, observations: input.observations }];
    const productValidations = productChecks.map((check) => {
      const dispatchedQuantity = check.lots.reduce((total, lot) => total + lot.dispatchedQuantity, 0);
      const conformity = calculateDispatchConformity({ orderedBoxes: check.orderedQuantity, dispatchedBoxes: dispatchedQuantity, productLabelResult: check.productLabelResult, boxLabelResult: check.boxLabelResult, productTemperature: check.productTemperature, vehicleTemperature: limits.vehicle, productTemperatureLimit: limits.product, vehicleTemperatureLimit: limits.vehicle });
      if (conformity.result === "NC" && !check.observations?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: `As observações são obrigatórias no produto ${check.name} quando a validação não está conforme.` });
      return { ...check, dispatchedQuantity, conformity };
    });
    const vehicleTemperatureResult = input.vehicleTemperature <= limits.vehicle ? "C" : "NC";
    const reasons = [
      ...productValidations.flatMap((check) => [
        ...(check.conformity.quantityResult === "NC" ? [`${check.name}: quantidade expedida diferente da quantidade pedida.`] : []),
        ...(check.conformity.productTemperatureResult === "NC" ? [`${check.name}: temperatura do produto fora do limite.`] : []),
        ...(check.productLabelResult === "NC" ? [`${check.name}: rotulagem do produto não conforme.`] : []),
        ...(check.boxLabelResult === "NC" ? [`${check.name}: rotulagem da caixa não conforme.`] : []),
      ]),
      ...(vehicleTemperatureResult === "NC" ? [`Temperatura do veículo fora do limite (${input.vehicleTemperature} °C; máximo ${limits.vehicle} °C).`] : []),
    ];
    const conformity = { result: productValidations.every((check) => check.conformity.result === "C") && vehicleTemperatureResult === "C" ? "C" as const : "NC" as const, productValidations, vehicleTemperatureResult, reasons };
    if (vehicleTemperatureResult === "NC" && !input.observations?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "A observação geral é obrigatória quando a temperatura do veículo não está conforme." });
    const completedAt = new Date();
    const title = `Expedição ${input.orderNumber} — ${input.customer}`;
    const area = `Expedição ${input.profile}`;
    const payload = { ...input, productChecks: productValidations, profileLabel: profile.label, temperatureLimits: limits, ...conformity };
    await db.insert(controlEntries).values({ module: "dispatch_control", title, area, factoryId: null, result: conformity.result, notes: input.observations ?? null, payload, completedAt, registeredByProfileId: ctx.operatorProfile!.id, registeredByName: ctx.operatorProfile!.name, registeredByTitle: ctx.operatorProfile!.title, createdBy: ctx.user!.openId });
    return { success: true, conformity, limits, incidence: conformity.result === "NC" };
  }),

  listIncidences: qualitySessionProcedure.input(z.object({
    date: dateInput.optional(),
    startDate: dateInput.optional(),
    endDate: dateInput.optional(),
    factoryId: z.number().int().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    if (input?.startDate && input.endDate && asDateRange(input.startDate).start > asDateRange(input.endDate).start) throw new TRPCError({ code: "BAD_REQUEST", message: "A data final não pode ser anterior à data inicial." });
    const defaultRange = asDateRange(input?.date ?? new Date());
    const start = input?.startDate ? asDateRange(input.startDate).start : input?.date ? defaultRange.start : new Date(0);
    const end = input?.endDate ? asDateRange(input.endDate).end : input?.date ? defaultRange.end : new Date("9999-12-31T23:59:59.999Z");
    const [entries, factoryRows, ncRows] = await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(factories).orderBy(factories.name),
      db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt)),
    ]);
    const factoryNames = new Map(factoryRows.map((factory) => [factory.id, factory.name]));
    return entries.filter((entry) => {
      const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? entry.payload as Record<string, unknown> : {};
      return entry.result === "NC" && !payload.deletedAt && entry.completedAt >= start && entry.completedAt < end && (!input?.factoryId || entry.factoryId === input.factoryId);
    }).map((entry) => {
      const linked = ncRows.find((nc) => nc.sourceEntryId === entry.id);
      const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? entry.payload as Record<string, unknown> : {};
      const occurrenceNumber = typeof payload.nonconformityOccurrenceNumber === "string" ? payload.nonconformityOccurrenceNumber : null;
      const generatedNonconformity = Boolean(linked) || payload.generatedNonconformity === true;
      return { ...entry, factoryName: entry.factoryId ? factoryNames.get(entry.factoryId) ?? "Fábrica não identificada" : "Sem fábrica/linha", generatedNonconformity, nonconformityId: linked?.id ?? null, occurrenceNumber };
    });
  }),

  incidenceRecurrenceAlerts: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const [entries, ncs] = await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(nonconformities),
    ]);
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const linkedEntryIds = new Set(ncs.map((nc) => nc.sourceEntryId).filter((id): id is number => Boolean(id)));
    const grouped = new Map<number, { collaboratorId: number; collaboratorName: string; incidences: typeof entries }>();
    entries.filter((entry) => {
      const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? entry.payload as Record<string, unknown> : {};
      const collaboratorId = Number(payload.collaboratorId);
      const collaboratorName = typeof payload.collaboratorName === "string" ? payload.collaboratorName.trim() : "";
      return entry.result === "NC" && entry.completedAt >= since && collaboratorId > 0 && Boolean(collaboratorName) && !linkedEntryIds.has(entry.id) && payload.generatedNonconformity !== true;
    }).forEach((entry) => {
      const payload = entry.payload as Record<string, unknown>;
      const collaboratorId = Number(payload.collaboratorId);
      const collaboratorName = String(payload.collaboratorName).trim();
      const current = grouped.get(collaboratorId) ?? { collaboratorId, collaboratorName, incidences: [] as typeof entries };
      current.incidences.push(entry);
      grouped.set(collaboratorId, current);
    });
    return Array.from(grouped.values()).filter((item) => item.incidences.length >= 3).map((item) => ({
      collaboratorId: item.collaboratorId,
      collaboratorName: item.collaboratorName,
      total: item.incidences.length,
      mostRecentAt: item.incidences.reduce((latest, entry) => entry.completedAt > latest ? entry.completedAt : latest, item.incidences[0].completedAt),
    })).sort((left, right) => right.total - left.total || right.mostRecentAt.getTime() - left.mostRecentAt.getTime());
  }),

  similarIncidenceAlerts: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const [entries, ncs, factoryRows] = await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(nonconformities),
      db.select().from(factories),
    ]);
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const linkedEntryIds = new Set(ncs.map((nc) => nc.sourceEntryId).filter((id): id is number => Boolean(id)));
    const factoryNames = new Map(factoryRows.map((factory) => [factory.id, factory.name]));
    const grouped = new Map<string, { title: string; module: typeof qualityModuleValues[number]; factoryId: number | null; entries: typeof entries }>();
    entries.forEach((entry) => {
      const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? entry.payload as Record<string, unknown> : {};
      if (entry.result !== "NC" || entry.completedAt < since || linkedEntryIds.has(entry.id) || payload.generatedNonconformity === true || payload.deletedAt) return;
      const normalizedTitle = entry.title.trim().toLocaleLowerCase("pt-PT").replace(/\s+/g, " ");
      const key = `${entry.module}|${entry.factoryId ?? "none"}|${normalizedTitle}`;
      const group = grouped.get(key) ?? { title: entry.title, module: entry.module, factoryId: entry.factoryId, entries: [] as typeof entries };
      group.entries.push(entry);
      grouped.set(key, group);
    });
    return Array.from(grouped.values()).filter((group) => group.entries.length >= 3).map((group) => ({
      title: group.title,
      module: group.module,
      factoryId: group.factoryId,
      factoryName: group.factoryId ? factoryNames.get(group.factoryId) ?? "Fábrica não identificada" : "Sem fábrica/linha",
      total: group.entries.length,
      mostRecentAt: group.entries.reduce((latest, entry) => entry.completedAt > latest ? entry.completedAt : latest, group.entries[0].completedAt),
    })).sort((left, right) => right.total - left.total || right.mostRecentAt.getTime() - left.mostRecentAt.getTime());
  }),

  updateIncidence: qualityOperatorProcedure.input(z.object({
    id: z.number().int(),
    title: z.string().min(2).max(180).optional(),
    area: z.string().min(2).max(120).optional(),
    notes: z.string().max(3000).optional(),
    generatedNonconformity: z.boolean().optional(),
    occurrenceNumber: z.string().max(80).optional(),
    evidencePhotos: z.array(z.object({ key: z.string().min(1), url: z.string().startsWith("/manus-storage/"), fileName: z.string().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) })).max(8).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const entry = (await db.select().from(controlEntries).where(eq(controlEntries.id, input.id)).limit(1))[0];
    if (!entry || entry.result !== "NC") throw new TRPCError({ code: "NOT_FOUND", message: "Incidência diária não encontrada." });
    const isManager = ctx.operatorProfile!.role === "manager";
    const isAuthor = entry.registeredByProfileId === ctx.operatorProfile!.id || (!entry.registeredByProfileId && entry.registeredByName === ctx.operatorProfile!.name);
    if (!isManager && !isAuthor) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o técnico que registou a incidência ou a Responsável de Qualidade a pode editar." });
    if (!isManager && (input.generatedNonconformity !== undefined || input.occurrenceNumber !== undefined)) throw new TRPCError({ code: "FORBIDDEN", message: "A decisão e o número de NC são geridos pela Responsável de Qualidade." });
    const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? { ...entry.payload } as Record<string, unknown> : {};
    if (input.generatedNonconformity !== undefined) payload.generatedNonconformity = input.generatedNonconformity;
    if (input.occurrenceNumber !== undefined) payload.nonconformityOccurrenceNumber = input.occurrenceNumber.trim() || null;
    if (input.evidencePhotos !== undefined) payload.evidencePhotos = input.evidencePhotos;
    const history = Array.isArray(payload.editHistory) ? payload.editHistory : [];
    payload.editHistory = [...history, { action: "updated_incidence", at: new Date().toISOString(), byProfileId: ctx.operatorProfile!.id, byName: ctx.operatorProfile!.name, byTitle: ctx.operatorProfile!.title }];
    await db.update(controlEntries).set({ title: input.title ?? entry.title, area: input.area ?? entry.area, notes: input.notes === undefined ? entry.notes : input.notes.trim() || null, payload }).where(eq(controlEntries.id, input.id));
    return { success: true };
  }),

  deleteIncidence: qualityManagerProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const entry = (await db.select().from(controlEntries).where(eq(controlEntries.id, input.id)).limit(1))[0];
    if (!entry || entry.result !== "NC") throw new TRPCError({ code: "NOT_FOUND", message: "Incidência diária não encontrada." });
    const payload = entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? { ...entry.payload } as Record<string, unknown> : {};
    payload.deletedAt = new Date().toISOString();
    payload.deletedByProfileId = ctx.operatorProfile!.id;
    payload.deletedByName = ctx.operatorProfile!.name;
    await db.update(controlEntries).set({ payload }).where(eq(controlEntries.id, input.id));
    return { success: true };
  }),

  createNonconformity: qualityOperatorProcedure.input(z.object({
    sourceEntryId: z.number().int().optional(),
    module: qualityModuleSchema,
    title: z.string().min(2).max(180),
    description: z.string().min(2).max(5000),
    area: z.string().min(2).max(120),
    factoryId: z.number().int().optional(),
    severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    if (input.sourceEntryId) {
      const source = (await db.select().from(controlEntries).where(eq(controlEntries.id, input.sourceEntryId)).limit(1))[0];
      if (!source || source.result !== "NC") throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma incidência diária NC válida para associar à Não Conformidade." });
      const existing = (await db.select().from(nonconformities).where(eq(nonconformities.sourceEntryId, source.id)).limit(1))[0];
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Esta incidência já está associada a uma Não Conformidade." });
    }
    await db.insert(nonconformities).values({ ...input, sourceEntryId: input.sourceEntryId ?? null, factoryId: input.factoryId ?? null, status: "open", detectedAt: new Date(), reportedByProfileId: ctx.operatorProfile!.id, reportedByName: ctx.operatorProfile!.name, reportedByTitle: ctx.operatorProfile!.title, createdBy: ctx.user!.openId });
    return { success: true };
  }),

  listNcs: qualitySessionProcedure.input(z.object({ factoryId: z.number().int().optional(), startDate: dateInput.optional(), endDate: dateInput.optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    if (input?.startDate && input.endDate && asDateRange(input.startDate).start > asDateRange(input.endDate).start) throw new TRPCError({ code: "BAD_REQUEST", message: "A data final não pode ser anterior à data inicial." });
    const start = input?.startDate ? asDateRange(input.startDate).start : null;
    const end = input?.endDate ? asDateRange(input.endDate).end : null;
    const ncs = await db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt));
    return scopeToFactory(ncs, input?.factoryId).filter((nc) => (!start || nc.detectedAt >= start) && (!end || nc.detectedAt < end));
  }),

  dailyIncidences: qualitySessionProcedure.input(z.object({
    date: dateInput.optional(),
    factoryId: z.number().int().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const referenceDate = input?.date ?? new Date();
    const { start, end } = asDateRange(referenceDate);
    const [entries, factoryRows, ncRows] = await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(factories).orderBy(factories.name),
      db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt)),
    ]);
    const factoryNames = new Map(factoryRows.map((factory) => [factory.id, factory.name]));
    const incidences = scopeToFactory(entries, input?.factoryId)
      .filter((entry) => entry.result === "NC" && entry.completedAt >= start && entry.completedAt < end)
      .map((entry) => {
        const linked = ncRows.find((nc) => nc.sourceEntryId === entry.id);
        return { ...entry, detectedAt: entry.completedAt, factoryName: entry.factoryId ? factoryNames.get(entry.factoryId) ?? "Fábrica não identificada" : "Sem fábrica/linha", generatedNonconformity: Boolean(linked), nonconformityId: linked?.id ?? null };
      });
    const grouped = new Map<string, number>();
    incidences.forEach((incidence) => grouped.set(incidence.factoryName, (grouped.get(incidence.factoryName) ?? 0) + 1));
    return {
      date: start,
      total: incidences.length,
      byFactory: Array.from(grouped, ([factoryName, total]) => ({ factoryName, total })).sort((left, right) => right.total - left.total),
      incidences,
    };
  }),

  dailyIncidenceSummary: qualitySessionProcedure.input(z.object({
    date: dateInput,
    factoryId: z.number().int().optional(),
  })).query(async ({ input }) => {
    const db = await requireDb();
    const { start, end } = asDateRange(input.date);
    const scopeId = input.factoryId ?? 0;
    const [entryRows, ncRows, factoryRows, savedNotes] = await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt)),
      db.select().from(factories).orderBy(factories.name),
      db.select().from(dailyIncidenceSummaries).where(and(eq(dailyIncidenceSummaries.referenceDate, start), eq(dailyIncidenceSummaries.factoryId, scopeId))).limit(1),
    ]);
    const factoryNames = new Map(factoryRows.map((factory) => [factory.id, factory.name]));
    const scopedEntries = entryRows.filter((entry) => (!input.factoryId || entry.factoryId === input.factoryId))
      .filter((entry) => entry.result === "NC" && entry.completedAt >= start && entry.completedAt < end);
    const scopedNcs = ncRows.filter((nc) => (!input.factoryId || nc.factoryId === input.factoryId))
      .filter((nc) => nc.detectedAt >= start && nc.detectedAt < end);
    const incidences = scopedEntries.map((entry) => {
      const linked = scopedNcs.find((nc) => nc.sourceEntryId === entry.id) ?? scopedNcs.find((nc) => !nc.sourceEntryId && nc.module === entry.module && nc.factoryId === entry.factoryId && nc.area === entry.area);
      return {
        id: entry.id,
        title: entry.title,
        module: entry.module,
        area: entry.area,
        factoryId: entry.factoryId,
        factoryName: entry.factoryId ? factoryNames.get(entry.factoryId) ?? "Fábrica não identificada" : "Sem fábrica/linha",
        completedAt: entry.completedAt,
        notes: entry.notes,
        registeredByName: entry.registeredByName,
        registeredByTitle: entry.registeredByTitle,
        generatedNonconformity: Boolean(linked),
        nonconformityId: linked?.id ?? null,
        nonconformitySeverity: linked?.severity ?? null,
        nonconformityStatus: linked?.status ?? null,
      };
    });
    return {
      date: start,
      total: incidences.length,
      withNonconformity: incidences.filter((item) => item.generatedNonconformity).length,
      withoutNonconformity: incidences.filter((item) => !item.generatedNonconformity).length,
      note: savedNotes[0]?.note ?? "",
      noteUpdatedByName: savedNotes[0]?.updatedByName ?? null,
      noteUpdatedAt: savedNotes[0]?.updatedAt ?? null,
      incidences,
    };
  }),

  saveDailyIncidenceNote: qualityOperatorProcedure.input(z.object({
    date: dateInput,
    factoryId: z.number().int().optional(),
    note: z.string().max(4000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const factoryId = input.factoryId ?? 0;
    await db.insert(dailyIncidenceSummaries).values({
      referenceDate: asDateRange(input.date).start,
      factoryId,
      note: input.note.trim(),
      updatedByProfileId: ctx.operatorProfile!.id,
      updatedByName: ctx.operatorProfile!.name,
      updatedByTitle: ctx.operatorProfile!.title,
      createdBy: ctx.user!.openId,
    }).onDuplicateKeyUpdate({ set: {
      note: input.note.trim(),
      updatedByProfileId: ctx.operatorProfile!.id,
      updatedByName: ctx.operatorProfile!.name,
      updatedByTitle: ctx.operatorProfile!.title,
    } });
    return { success: true };
  }),

  updateNc: qualitySessionProcedure.input(z.object({
    id: z.number().int(),
    status: z.enum(["open", "in_progress", "awaiting_validation", "closed"]),
    assignedTo: z.string().max(120).optional(),
    dueAt: dateInput.optional(),
  })).mutation(async ({ ctx, input }) => {
    if (input.status === "closed" && ctx.operatorProfile?.role !== "manager") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas a Responsável de Qualidade pode fechar não conformidades." });
    }
    const db = await requireDb();
    const validatorName = ctx.user.name?.trim() || ctx.user.email?.trim() || ctx.user.openId;
    await db.update(nonconformities).set({
      status: input.status,
      assignedTo: input.assignedTo,
      dueAt: input.dueAt,
      validatedBy: input.status === "closed" ? validatorName : null,
      validatedByOpenId: input.status === "closed" ? ctx.user.openId : null,
      closedAt: input.status === "closed" ? new Date() : null,
    }).where(eq(nonconformities.id, input.id));
    return { success: true };
  }),

  addCorrectiveAction: qualitySessionProcedure.input(z.object({
    nonconformityId: z.number().int(),
    actionType: z.enum(["correction", "corrective"]),
    description: z.string().min(3).max(3000),
    responsible: z.string().min(2).max(120),
    dueAt: dateInput.optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const parentNc = (await db.select().from(nonconformities).where(eq(nonconformities.id, input.nonconformityId)).limit(1))[0];
    if (!parentNc) throw new TRPCError({ code: "NOT_FOUND", message: "Não conformidade não encontrada." });
    await db.insert(correctiveActions).values({ ...input, factoryId: parentNc.factoryId, createdBy: ctx.user.openId, status: "pending" });
    await db.update(nonconformities).set({ status: "in_progress" }).where(eq(nonconformities.id, input.nonconformityId));
    return { success: true };
  }),

  listActions: qualitySessionProcedure.input(z.object({ nonconformityId: z.number().int() })).query(async ({ input }) => {
    const db = await requireDb();
    return db.select().from(correctiveActions).where(eq(correctiveActions.nonconformityId, input.nonconformityId)).orderBy(desc(correctiveActions.createdAt));
  }),

  completeAction: qualitySessionProcedure.input(z.object({ id: z.number().int(), notes: z.string().max(3000).optional() })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.update(correctiveActions).set({ status: "completed", completedAt: new Date(), completionNotes: input.notes ?? null }).where(eq(correctiveActions.id, input.id));
    return { success: true };
  }),

  uploadEvidence: qualitySessionProcedure.input(z.object({
    nonconformityId: z.number().int().optional(),
    correctiveActionId: z.number().int().optional(),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(3).max(120),
    dataUrl: z.string().min(20).max(7_000_000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const base64 = input.dataUrl.split(",")[1];
    if (!base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Anexo inválido." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `quality-evidence/${ctx.user.id}/${Date.now()}-${safeName}`;
    const { key: fileKey, url } = await storagePut(key, Buffer.from(base64, "base64"), input.mimeType);
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

  listEvidences: qualitySessionProcedure.input(z.object({ nonconformityId: z.number().int() })).query(async ({ input }) => {
    const db = await requireDb();
    const actions = await db.select().from(correctiveActions).where(eq(correctiveActions.nonconformityId, input.nonconformityId));
    const direct = await db.select().from(evidences).where(eq(evidences.nonconformityId, input.nonconformityId));
    if (!actions.length) return direct;
    const actionEvidence = await db.select().from(evidences).where(inArray(evidences.correctiveActionId, actions.map((action) => action.id)));
    return [...direct, ...actionEvidence].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }),

  listChecklistItems: qualitySessionProcedure.input(z.object({ factoryId: z.number().int().min(1).max(3) }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const [items, assignments] = await Promise.all([db.select().from(checklistItems).orderBy(checklistItems.area, checklistItems.sortOrder), db.select().from(checklistItemFactories)]);
    return items.map((item) => ({ ...item, factoryIds: assignments.filter((assignment) => assignment.checklistItemId === item.id).map((assignment) => assignment.factoryId) })).filter((item) => item.active === "true" && (!input?.factoryId || item.factoryIds.includes(input.factoryId)));
  }),

  addChecklistItem: qualityManagerProcedure.input(z.object({
    factoryIds: z.array(z.number().int().min(1).max(3)).min(1),
    area: z.string().min(2).max(120),
    label: z.string().min(3).max(500),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const factoryIds = Array.from(new Set(input.factoryIds));
    const inserted = await db.insert(checklistItems).values({ factoryId: factoryIds[0], area: input.area, label: input.label, createdBy: ctx.user!.openId, sortOrder: 100, active: "true" }).$returningId();
    await db.insert(checklistItemFactories).values(factoryIds.map((factoryId) => ({ checklistItemId: inserted[0]!.id, factoryId })));
    return { success: true };
  }),

  updateChecklistItem: qualityManagerProcedure.input(z.object({ id: z.number().int(), factoryIds: z.array(z.number().int().min(1).max(3)).min(1), area: z.string().min(2).max(120), label: z.string().min(3).max(500) })).mutation(async ({ input }) => {
    const db = await requireDb();
    const factoryIds = Array.from(new Set(input.factoryIds));
    await db.update(checklistItems).set({ factoryId: factoryIds[0], area: input.area, label: input.label }).where(eq(checklistItems.id, input.id));
    await db.delete(checklistItemFactories).where(eq(checklistItemFactories.checklistItemId, input.id));
    await db.insert(checklistItemFactories).values(factoryIds.map((factoryId) => ({ checklistItemId: input.id, factoryId })));
    return { success: true };
  }),

  removeChecklistItem: qualityManagerProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.delete(checklistItemFactories).where(eq(checklistItemFactories.checklistItemId, input.id));
    await db.delete(checklistItems).where(eq(checklistItems.id, input.id));
    return { success: true };
  }),

  monthlyChecklistProgress: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [items, assignments, entries, monthlyFactories] = await Promise.all([
      db.select().from(checklistItems),
      db.select().from(checklistItemFactories),
      db.select().from(controlEntries).where(eq(controlEntries.module, "monthly_checklist")),
      db.select().from(factories),
    ]);
    const monthEntries = entries.filter((entry) => entry.completedAt >= startOfMonth && entry.completedAt < startOfNextMonth);
    return monthlyFactories.filter((factory) => [1, 2, 3].includes(factory.id)).map((factory) => {
      const factoryItems = items.filter((item) => assignments.some((assignment) => assignment.checklistItemId === item.id && assignment.factoryId === factory.id) && item.active === "true");
      const completedIds = new Set(monthEntries.filter((entry) => entry.factoryId === factory.id).map((entry) => Number((entry.payload as Record<string, unknown>)?.checklistItemId)).filter(Boolean));
      const completed = factoryItems.filter((item) => completedIds.has(item.id)).length;
      return { factoryId: factory.id, factoryName: factory.name, total: factoryItems.length, completed, percentage: factoryItems.length ? Math.round((completed / factoryItems.length) * 100) : 0 };
    });
  }),

  listFragileItems: qualitySessionProcedure.input(z.object({ factoryId: z.number().int().optional(), periodicity: z.enum(["D", "S", "Q", "M"]).optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const items = await db.select().from(fragileItems).orderBy(fragileItems.location, fragileItems.sortOrder, fragileItems.name);
    return items.filter((item) => item.status === "active" && (!input?.factoryId || item.factoryId === input.factoryId) && (!input?.periodicity || item.periodicity === input.periodicity));
  }),

  fragilePending: qualitySessionProcedure.input(z.object({ factoryId: z.number().int().optional(), periodicity: z.enum(["D", "S", "Q", "M"]).optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const [items, entries] = await Promise.all([
      db.select().from(fragileItems).orderBy(fragileItems.location, fragileItems.sortOrder, fragileItems.name),
      db.select().from(controlEntries).where(eq(controlEntries.module, "fragile_items")).orderBy(desc(controlEntries.completedAt)),
    ]);
    const lastInspections = new Map<number, Date>();
    entries.forEach((entry) => {
      const payload = entry.payload;
      const fragileItemId = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { fragileItemId?: unknown }).fragileItemId : null;
      if (typeof fragileItemId === "number" && !lastInspections.has(fragileItemId)) lastInspections.set(fragileItemId, entry.completedAt);
    });
    const now = new Date();
    return items
      .filter((item) => item.status === "active" && (!input?.factoryId || item.factoryId === input.factoryId) && (!input?.periodicity || item.periodicity === input.periodicity))
      .map((item) => {
        const lastInspectionAt = lastInspections.get(item.id) ?? null;
        return { ...item, lastInspectionAt, dueAt: fragileInspectionDueDate(item.periodicity, lastInspectionAt, now), delayDays: fragileInspectionDelayDays(item.periodicity, lastInspectionAt, now) };
      })
      .filter((item) => isFragileInspectionPending(item.periodicity, item.lastInspectionAt, now))
      .sort((left, right) => (left.lastInspectionAt?.getTime() ?? 0) - (right.lastInspectionAt?.getTime() ?? 0));
  }),

  addFragileItem: qualityOperatorProcedure.input(z.object({
    name: z.string().min(2).max(180),
    location: z.string().min(2).max(120),
    factoryId: z.number().int().optional(),
    periodicity: z.enum(["D", "S", "Q", "M"]).default("M"),
    itemType: z.enum(["Vidro", "Plástico rígido", "Outro"]),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
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

  updateFragileItem: qualityOperatorProcedure.input(z.object({
    id: z.number().int(),
    name: z.string().min(2).max(180),
    location: z.string().min(2).max(120),
    factoryId: z.number().int().nullable(),
    periodicity: z.enum(["D", "S", "Q", "M"]),
    itemType: z.enum(["Vidro", "Plástico rígido", "Outro"]),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const item = (await db.select().from(fragileItems).where(eq(fragileItems.id, input.id)).limit(1))[0];
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Ponto de controlo não encontrado." });
    await db.update(fragileItems).set({
      name: input.name,
      location: input.location,
      factoryId: input.factoryId,
      periodicity: input.periodicity,
      itemType: input.itemType,
      updatedBy: ctx.user!.openId,
      updatedByProfileId: ctx.operatorProfile!.id,
      updatedByName: ctx.operatorProfile!.name,
    }).where(eq(fragileItems.id, input.id));
    return { success: true };
  }),

  renameFragileArea: qualityOperatorProcedure.input(z.object({
    factoryId: z.number().int(),
    currentName: z.string().trim().min(2).max(120),
    nextName: z.string().trim().min(2).max(120),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    if (input.currentName === input.nextName) return { success: true, updated: 0 };
    const matchingItems = await db.select().from(fragileItems).where(and(
      eq(fragileItems.factoryId, input.factoryId),
      eq(fragileItems.location, input.currentName),
      eq(fragileItems.status, "active"),
    ));
    if (!matchingItems.length) throw new TRPCError({ code: "NOT_FOUND", message: "Não foram encontrados pontos ativos nesta área." });
    await db.update(fragileItems).set({
      location: input.nextName,
      updatedBy: ctx.user!.openId,
      updatedByProfileId: ctx.operatorProfile!.id,
      updatedByName: ctx.operatorProfile!.name,
    }).where(and(
      eq(fragileItems.factoryId, input.factoryId),
      eq(fragileItems.location, input.currentName),
      eq(fragileItems.status, "active"),
    ));
    return { success: true, updated: matchingItems.length };
  }),

  mergeFragileAreas: qualityOperatorProcedure.input(z.object({
    factoryId: z.number().int(),
    sourceArea: z.string().trim().min(2).max(120),
    targetArea: z.string().trim().min(2).max(120),
  })).mutation(async ({ ctx, input }) => {
    if (input.sourceArea === input.targetArea) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione duas áreas diferentes para fundir." });
    const db = await requireDb();
    const [sourceItems, targetItems] = await Promise.all([
      db.select().from(fragileItems).where(and(eq(fragileItems.factoryId, input.factoryId), eq(fragileItems.location, input.sourceArea), eq(fragileItems.status, "active"))),
      db.select().from(fragileItems).where(and(eq(fragileItems.factoryId, input.factoryId), eq(fragileItems.location, input.targetArea), eq(fragileItems.status, "active"))),
    ]);
    if (!sourceItems.length) throw new TRPCError({ code: "NOT_FOUND", message: "Não foram encontrados pontos ativos na área de origem." });
    if (!targetItems.length) throw new TRPCError({ code: "NOT_FOUND", message: "A área de destino tem de existir na fábrica selecionada." });
    await db.update(fragileItems).set({
      location: input.targetArea,
      updatedBy: ctx.user!.openId,
      updatedByProfileId: ctx.operatorProfile!.id,
      updatedByName: ctx.operatorProfile!.name,
    }).where(and(eq(fragileItems.factoryId, input.factoryId), eq(fragileItems.location, input.sourceArea), eq(fragileItems.status, "active")));
    return { success: true, updated: sourceItems.length };
  }),

  uploadFragileReferenceImage: qualityOperatorProcedure.input(z.object({
    itemId: z.number().int(),
    fileName: z.string().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    dataUrl: z.string().min(20).max(7_000_000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const item = (await db.select().from(fragileItems).where(eq(fragileItems.id, input.itemId)).limit(1))[0];
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Ponto de controlo não encontrado." });
    const base64 = input.dataUrl.split(",")[1];
    if (!base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `fragile-reference/${input.itemId}/${Date.now()}-${safeName}`;
    const { key: referenceImageKey, url: referenceImageUrl } = await storagePut(key, Buffer.from(base64, "base64"), input.mimeType);
    await db.update(fragileItems).set({ referenceImageKey, referenceImageUrl, referenceImageName: input.fileName, updatedBy: ctx.user!.openId, updatedByProfileId: ctx.operatorProfile!.id, updatedByName: ctx.operatorProfile!.name }).where(eq(fragileItems.id, input.itemId));
    return { success: true, url: referenceImageUrl };
  }),

  uploadFragileInspectionEvidence: qualityOperatorProcedure.input(z.object({
    itemId: z.number().int(),
    fileName: z.string().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    dataUrl: z.string().min(20).max(7_000_000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const item = (await db.select().from(fragileItems).where(eq(fragileItems.id, input.itemId)).limit(1))[0];
    if (!item || item.status !== "active") throw new TRPCError({ code: "NOT_FOUND", message: "Ponto de controlo não encontrado." });
    await requireControlAuthorization(db, { module: "fragile_items", factoryId: item.factoryId, profile: ctx.operatorProfile! });
    const base64 = input.dataUrl.split(",")[1];
    if (!base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { key, url } = await storagePut(`fragile-evidence/${input.itemId}/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`, Buffer.from(base64, "base64"), input.mimeType);
    return { success: true, key, url, fileName: input.fileName, mimeType: input.mimeType };
  }),

  uploadVerificationEvidence: qualityOperatorProcedure.input(z.object({
    module: qualityModuleSchema,
    factoryId: z.number().int().nullable().optional(),
    fileName: z.string().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    dataUrl: z.string().min(20).max(7_000_000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireControlAuthorization(db, { module: input.module, factoryId: input.factoryId ?? null, profile: ctx.operatorProfile! });
    const base64 = input.dataUrl.split(",")[1];
    if (!base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const scope = input.factoryId ?? "comum";
    const { key, url } = await storagePut(`control-evidence/${input.module}/${scope}/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`, Buffer.from(base64, "base64"), input.mimeType);
    return { success: true, key, url, fileName: input.fileName, mimeType: input.mimeType };
  }),

  suggestFoodDefenseMeasure: qualitySessionProcedure.input(z.object({
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
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireControlAuthorization(db, { module: "food_defense", factoryId: input.factoryId, plannedTaskId: input.plannedTaskId, profile: ctx.operatorProfile! });
    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "És especialista em Food Defense numa indústria de panificação. Propõe uma medida de controlo concreta, proporcional ao risco e verificável. Responde em português europeu, sem preâmbulos. A proposta é apenas apoio à decisão: não declares conformidade legal, não inventes factos e recorda implicitamente a necessidade de validação pela equipa." },
        { role: "user", content: `Secção: ${input.section}\nCritério NC: ${input.criterion}\nObservações do técnico: ${input.notes?.trim() || "Não indicadas"}\nProbabilidade: ${input.probability}\nSeveridade: ${input.severity}\nVulnerabilidade: ${input.vulnerability}\nOrientação da matriz: ${input.riskGuidance}\nMedida já escrita: ${input.existingMeasure?.trim() || "Nenhuma"}\n\nPropõe uma única medida de controlo com ação imediata, responsável sugerido e forma de verificar eficácia. Máximo 120 palavras.` },
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
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A sugestão de medida de controlo não ficou disponível. Tente novamente." });
    }
  }),

  deleteFragileItem: qualityOperatorProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const item = (await db.select().from(fragileItems).where(eq(fragileItems.id, input.id)).limit(1))[0];
    if (!item || item.status !== "active") throw new TRPCError({ code: "NOT_FOUND", message: "Ponto de controlo não encontrado." });
    await db.update(fragileItems).set({ status: "inactive" }).where(eq(fragileItems.id, input.id));
    return { success: true };
  }),

  dailyReportArchiveHistory: qualitySessionProcedure.input(z.object({ date: dateInput.optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const archives = input?.date
      ? await db.select().from(dailyReportArchives).where(eq(dailyReportArchives.operationalDate, input.date)).orderBy(desc(dailyReportArchives.revision))
      : await db.select().from(dailyReportArchives).orderBy(desc(dailyReportArchives.operationalDate), desc(dailyReportArchives.revision));
    return archives.map((archive) => {
      const snapshot = archive.snapshot && typeof archive.snapshot === "object" && !Array.isArray(archive.snapshot) ? archive.snapshot as Record<string, unknown> : {};
      return { id: archive.id, operationalDate: archive.operationalDate, revision: archive.revision, archiveKind: archive.archiveKind, revisionReason: archive.revisionReason, createdBy: archive.createdBy, createdAt: archive.createdAt, controls: Array.isArray(snapshot.controlEntries) ? snapshot.controlEntries.length : 0, plannedTasks: Array.isArray(snapshot.plannedTasks) ? snapshot.plannedTasks.length : 0, incidences: Array.isArray(snapshot.incidences) ? snapshot.incidences.length : 0 };
    });
  }),

  dailyReportArchiveDetail: qualitySessionProcedure.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const db = await requireDb();
    const archive = (await db.select().from(dailyReportArchives).where(eq(dailyReportArchives.id, input.id)).limit(1))[0];
    if (!archive) throw new TRPCError({ code: "NOT_FOUND", message: "Versão de arquivo não encontrada." });
    return archive;
  }),

  dailyReportArchiveAttention: qualitySessionProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [archives, views] = await Promise.all([
      db.select().from(dailyReportArchives).orderBy(desc(dailyReportArchives.operationalDate), desc(dailyReportArchives.revision)),
      db.select().from(dailyReportArchiveViews).where(eq(dailyReportArchiveViews.profileId, ctx.operatorProfile!.id)).orderBy(desc(dailyReportArchiveViews.viewedAt)),
    ]);
    const viewedArchiveIds = new Set(views.map((view) => view.archiveId));
    const pending = archives.filter((archive) => archive.archiveKind === "retroactive_revision" && !viewedArchiveIds.has(archive.id));
    return { count: pending.length, revisions: pending.slice(0, 3).map((archive) => ({ id: archive.id, operationalDate: archive.operationalDate, revision: archive.revision, revisionReason: archive.revisionReason, createdBy: archive.createdBy, createdAt: archive.createdAt })) };
  }),

  markDailyReportArchiveViewed: qualitySessionProcedure.input(z.object({ archiveId: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const archive = (await db.select().from(dailyReportArchives).where(eq(dailyReportArchives.id, input.archiveId)).limit(1))[0];
    if (!archive) throw new TRPCError({ code: "NOT_FOUND", message: "Versão de arquivo não encontrada." });
    if (archive.archiveKind !== "retroactive_revision") return { success: true, tracked: false };
    await db.insert(dailyReportArchiveViews).values({ archiveId: archive.id, profileId: ctx.operatorProfile!.id, viewedAt: new Date() }).onDuplicateKeyUpdate({ set: { viewedAt: new Date() } });
    return { success: true, tracked: true };
  }),

  reports: qualitySessionProcedure.input(z.object({
    factoryId: z.number().int().optional(),
    startDate: dateInput.optional(),
    endDate: dateInput.optional(),
    module: qualityModuleSchema.optional(),
    result: resultSchema.optional(),
    ncStatus: z.enum(["open", "in_progress", "awaiting_validation", "closed"]).optional(),
    orderNumber: z.string().trim().min(1).max(80).optional(),
    analysisProduct: z.string().trim().min(1).max(180).optional(),
    analysisClient: z.string().trim().min(1).max(180).optional(),
    collaboratorProfileId: z.number().int().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const [entries, tasks, ncs] = await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(controlTasks),
      db.select().from(nonconformities),
    ]);
    const start = input?.startDate ? asDateRange(input.startDate).start : null;
    const end = input?.endDate ? asDateRange(input.endDate).end : null;
    if (input?.startDate && input.endDate && asDateRange(input.startDate).start > asDateRange(input.endDate).start) throw new TRPCError({ code: "BAD_REQUEST", message: "A data final não pode ser anterior à data inicial." });
    const withinPeriod = (date: Date) => (!start || date >= start) && (!end || date < end);
    const payloadRecord = (payload: unknown) => payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
    const isDeletedEntry = (entry: typeof entries[number]) => {
      const lifecycle = payloadRecord(entry.payload).recordLifecycle;
      return Boolean(lifecycle && typeof lifecycle === "object" && !Array.isArray(lifecycle) && (lifecycle as Record<string, unknown>).status === "deleted");
    };
    const dispatchEntries = scopeToFactory(entries, input?.factoryId).filter((entry) => !isDeletedEntry(entry) && withinPeriod(entry.completedAt) && entry.module === "dispatch_control");
    const dispatchOrdersByNumber = new Map<string, { orderNumber: string; customer: string | null; result: "C" | "NC" | "N/A" | null; completedAt: Date }>();
    dispatchEntries.forEach((entry) => {
      const payload = payloadRecord(entry.payload);
      const orderNumber = typeof payload.orderNumber === "string" ? payload.orderNumber : null;
      const customer = typeof payload.customer === "string" ? payload.customer : null;
      if (orderNumber) dispatchOrdersByNumber.set(orderNumber, { orderNumber, customer, result: entry.result, completedAt: entry.completedAt });
    });
    const dispatchOrders = Array.from(dispatchOrdersByNumber.values());
    const normalized = (value: string) => value.toLocaleLowerCase("pt-PT").trim();
    const matchesInternalAnalysis = (entry: typeof entries[number]) => {
      if (!input?.analysisProduct && !input?.analysisClient) return true;
      if (entry.module !== "internal_analysis") return false;
      const payload = payloadRecord(entry.payload);
      const samples = Array.isArray(payload.samples) ? payload.samples : [];
      const legacySample = { product: payload.product, client: payload.client ?? payload.samplePoint ?? payload.sampleId };
      const candidates = samples.length ? samples : [legacySample];
      return candidates.some((sample) => {
        const values = sample && typeof sample === "object" ? sample as Record<string, unknown> : {};
        const product = typeof values.product === "string" ? values.product : "";
        const client = [values.client, values.samplePoint].filter((value): value is string => typeof value === "string").join(" ");
        return (!input.analysisProduct || normalized(product).includes(normalized(input.analysisProduct))) && (!input.analysisClient || normalized(client).includes(normalized(input.analysisClient)));
      });
    };
    const scopedEntries = scopeToFactory(entries, input?.factoryId).filter((entry) => {
      const orderNumber = typeof payloadRecord(entry.payload).orderNumber === "string" ? payloadRecord(entry.payload).orderNumber as string : null;
      return !isDeletedEntry(entry) && withinPeriod(entry.completedAt) && (!input?.module || entry.module === input.module) && (!input?.result || entry.result === input.result) && (!input?.orderNumber || orderNumber === input.orderNumber) && (!input?.collaboratorProfileId || entry.registeredByProfileId === input.collaboratorProfileId) && matchesInternalAnalysis(entry);
    });
    const scopedTasks = scopeToFactory(tasks, input?.factoryId).filter((task) => task.status !== "cancelled" && withinPeriod(task.dueAt) && (!input?.collaboratorProfileId || task.completedByProfileId === input.collaboratorProfileId));
    const scopedNcs = scopeToFactory(ncs, input?.factoryId).filter((nc) => withinPeriod(nc.detectedAt) && (!input?.module || nc.module === input.module) && (!input?.ncStatus || nc.status === input.ncStatus) && (!input?.collaboratorProfileId || nc.reportedByProfileId === input.collaboratorProfileId));
    const modules = qualityModuleValues.map((module) => {
      const moduleEntries = scopedEntries.filter((entry) => entry.module === module);
      return {
        module,
        total: moduleEntries.length,
        conformity: calculateConformityRate(moduleEntries.map((entry) => entry.result)),
        nc: moduleEntries.filter((entry) => entry.result === "NC").length,
      };
    });
    const areaNames = Array.from(new Set(scopedEntries.map((entry) => entry.area)));
    const areas = areaNames.map((area) => {
      const areaEntries = scopedEntries.filter((entry) => entry.area === area);
      return { area, total: areaEntries.length, conformity: calculateConformityRate(areaEntries.map((entry) => entry.result)) };
    });
    const defaultEnd = asDateRange(new Date()).end;
    const periodStart = start ?? new Date(defaultEnd.getFullYear(), defaultEnd.getMonth(), defaultEnd.getDate() - 30);
    const periodEnd = end ?? defaultEnd;
    const periodDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000));
    const bucketCount = Math.min(10, periodDays);
    const bucketSize = Math.max(1, Math.ceil(periodDays / bucketCount));
    const trends = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = new Date(periodStart);
      bucketStart.setDate(bucketStart.getDate() + index * bucketSize);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketEnd.getDate() + bucketSize);
      if (bucketEnd > periodEnd) bucketEnd.setTime(periodEnd.getTime());
      const bucketEntries = scopedEntries.filter((entry) => entry.completedAt >= bucketStart && entry.completedAt < bucketEnd);
      const labelStart = bucketStart.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
      const labelEnd = new Date(Math.max(bucketStart.getTime(), bucketEnd.getTime() - 1)).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
      return { label: bucketSize === 1 ? labelStart : `${labelStart}–${labelEnd}`, entries: bucketEntries.length, c: bucketEntries.filter((entry) => entry.result === "C").length, nc: bucketEntries.filter((entry) => entry.result === "NC").length };
    });
    const filteredSummary = { total: scopedEntries.length, conforming: scopedEntries.filter((entry) => entry.result === "C").length, nonconforming: scopedEntries.filter((entry) => entry.result === "NC").length, conformity: calculateConformityRate(scopedEntries.map((entry) => entry.result)) };
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
      filters: { startDate: start, endDate: end, module: input?.module ?? null, result: input?.result ?? null, ncStatus: input?.ncStatus ?? null, orderNumber: input?.orderNumber ?? null, analysisProduct: input?.analysisProduct ?? null, analysisClient: input?.analysisClient ?? null },
    };
  }),

  initializeChecklist: qualityManagerProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const existing = await db.select().from(checklistItems).limit(1);
    if (existing.length) return { success: true, created: 0 };
    await db.insert(checklistItems).values(MONTHLY_CHECKLIST_TEMPLATE.map((label, index) => ({
      area: "Geral",
      label,
      sortOrder: index + 1,
      active: "true" as const,
      createdBy: ctx.user!.openId,
    })));
    return { success: true, created: MONTHLY_CHECKLIST_TEMPLATE.length };
  }),
});
