import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { occurrenceAccessProfiles, occurrences, supplierComplaints } from "../../drizzle/schema";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import { qualityManagerProcedure, qualityOperatorProcedure, qualitySessionProcedure, router } from "../_core/trpc";

const occurrenceTypes = ["NC", "Nnc"] as const;
const occurrenceOrigins = ["I", "R", "F", "AI", "AE"] as const;
const occurrenceStates = ["ABERTO", "FECHADO"] as const;
const BRC_REFERENCE = `BRCGS Food Safety Issue 9 — use apenas requisitos desta lista: 1.1 compromisso da gestão; 2.7 análise de perigos; 2.8 PCC; 2.10 monitorização PCC; 3.4 auditorias internas; 3.5.1 aprovação de fornecedores; 3.7 ações corretivas; 3.8 produto não conforme; 3.9 rastreabilidade; 3.10 reclamações; 3.11 incidentes, retirada e recolha; 4.7 manutenção; 4.10 deteção de corpos estranhos; 4.11 limpeza e higiene; 4.14 controlo de pragas; 4.15 armazenamento; 4.16 expedição e transporte; 5.2 alergénios; 5.7 food defence; 6.1 controlo de operações; 6.2 rotulagem; 6.3 quantidade; 6.4 calibração; 7.1 formação; 7.2 higiene pessoal; 7.4 vestuário de proteção.`;

const optionalText = z.string().max(12_000).optional().nullable();
const optionalDate = z.string().date().optional().nullable();

const occurrenceInput = z.object({
  occurredOn: z.string().date(),
  factoryCode: z.string().max(48).optional().nullable(),
  type: z.enum(occurrenceTypes),
  origin: z.enum(occurrenceOrigins),
  clientSupplierAuditor: optionalText,
  brcRequirement: z.string().max(100).optional().nullable(),
  sgsqaScope: z.string().max(255).optional().nullable(),
  affectedProduct: z.string().max(255).optional().nullable(),
  lot: z.string().max(100).optional().nullable(),
  expiry: z.string().max(50).optional().nullable(),
  rawMaterialLot: z.string().max(100).optional().nullable(),
  quantity: z.string().max(100).optional().nullable(),
  nonconformingProductClass: z.enum(["PNC C1", "PNC C2", ""]).optional().nullable(),
  description: z.string().min(1).max(12_000),
  descriptionImages: optionalText,
  hazardType: z.string().max(255).optional().nullable(),
  hazardDescription: optionalText,
  justification: optionalText,
  rootCauseAnalysis: optionalText,
  correction: optionalText,
  correctionResponsible: z.string().max(255).optional().nullable(),
  correctionImplementedOn: optionalDate,
  correctionEvidence: optionalText,
  correctionEvidenceImages: optionalText,
  correctiveAction: optionalText,
  correctiveActionResponsible: z.string().max(255).optional().nullable(),
  correctiveActionDueOn: optionalDate,
  correctiveActionClosedOn: optionalDate,
  correctiveActionEvidence: optionalText,
  correctiveActionEvidenceImages: optionalText,
  implementationDueOn: optionalDate,
  responsible: z.string().max(255).optional().nullable(),
  status: z.enum(occurrenceStates).optional(),
  closedOn: optionalDate,
  closingResponsible: z.string().max(255).optional().nullable(),
  effectivenessResponsible: z.string().max(255).optional().nullable(),
  effectivenessEvidence: optionalText,
  assessmentMethod: optionalText,
  effectiveness: z.enum(["Satisfatória", "Não Satisfatória", ""]).optional().nullable(),
  recurrent: z.boolean().optional(),
  recurrenceOfId: z.number().int().optional().nullable(),
  impactsObjectives: z.enum(["Sim", "Não", ""]).optional().nullable(),
  effect: optionalText,
  observations: optionalText,
});

const complaintInput = z.object({
  number: z.string().max(50).optional().nullable(),
  complaintOn: z.string().date(),
  supplier: z.string().min(1).max(255),
  sector: z.string().max(255).optional().nullable(),
  affectedProducts: optionalText,
  lots: optionalText,
  expiry: z.string().max(100).optional().nullable(),
  quantity: z.string().max(100).optional().nullable(),
  category: z.enum(["PRODUTO", "SERVICO"]).optional().nullable(),
  description: optionalText,
  descriptionImages: optionalText,
  hazardType: z.string().max(100).optional().nullable(),
  correction: optionalText,
  correctionResponsible: z.string().max(255).optional().nullable(),
  correctionImplementedOn: optionalDate,
  correctionEvidence: optionalText,
  correctionEvidenceImages: optionalText,
  correctiveAction: optionalText,
  correctiveActionResponsible: z.string().max(255).optional().nullable(),
  correctiveActionDueOn: optionalDate,
  correctiveActionClosedOn: optionalDate,
  correctiveActionEvidence: optionalText,
  correctiveActionEvidenceImages: optionalText,
  preventiveAction: optionalText,
  implementationDueOn: z.string().max(100).optional().nullable(),
  responsible: z.string().max(255).optional().nullable(),
  recurrent: z.boolean().optional(),
  recurrenceOfId: z.number().int().optional().nullable(),
  status: z.enum(occurrenceStates).optional(),
  closedOn: optionalDate,
  closingResponsible: z.string().max(255).optional().nullable(),
  closingObservations: optionalText,
  observations: optionalText,
  evidence: optionalText,
});

const filtersInput = z.object({
  type: z.string().optional(), origin: z.string().optional(), status: z.string().optional(), product: z.string().optional(),
  search: z.string().optional(), dataInicio: z.string().date().optional(), dataFim: z.string().date().optional(),
  sortBy: z.string().optional(), sortDir: z.enum(["asc", "desc"]).optional(), page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(10_000).optional(), semEficacia: z.boolean().optional(), factoryCode: z.string().optional(),
  responsible: z.string().optional(), dueStatus: z.string().optional(), brcRequirement: z.string().optional(), hazardType: z.string().optional(), sgsqaScope: z.string().optional(),
}).optional();

const complaintFiltersInput = z.object({
  search: z.string().optional(), supplier: z.string().optional(), status: z.enum(occurrenceStates).optional(),
  category: z.enum(["PRODUTO", "SERVICO"]).optional(), dataInicio: z.string().date().optional(), dataFim: z.string().date().optional(),
}).optional();

function asDate(value?: string | null) { return value ? new Date(`${value}T00:00:00`) : null; }
function toDateString(value: Date | string | null | undefined) { return value ? new Date(value).toISOString().slice(0, 10) : null; }
function normalized<T extends Record<string, unknown>>(data: T) { return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value])) as T; }
function calculateStatus(data: z.infer<typeof occurrenceInput>, explicit?: typeof occurrenceStates[number]) {
  if (explicit === "FECHADO") return "FECHADO" as const;
  return data.correction?.trim() && data.correctiveAction?.trim() && data.responsible?.trim() && data.implementationDueOn ? (explicit ?? "ABERTO") : "ABERTO" as const;
}
function daysUntil(value: Date | string | null) { return value ? Math.floor((new Date(value).getTime() - Date.now()) / 86_400_000) : null; }

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A base de dados não está disponível." });
  return db;
}

type OccurrenceAccess = { role: "user" | "admin" | "gestao"; scope: "all" | "reclamacoes" };
async function getOccurrenceAccess(ctx: { operatorProfile: { id: number; role: "technician" | "manager" | "viewer" } | null }): Promise<OccurrenceAccess> {
  const db = await requireDb();
  const record = (await db.select().from(occurrenceAccessProfiles).where(eq(occurrenceAccessProfiles.qualityProfileId, ctx.operatorProfile!.id)).limit(1))[0];
  if (record) return { role: record.role, scope: record.scope };
  return { role: ctx.operatorProfile!.role === "manager" ? "admin" : ctx.operatorProfile!.role === "viewer" ? "gestao" : "user", scope: "all" };
}
function ensureOccurrencesScope(access: OccurrenceAccess) {
  if (access.scope === "reclamacoes") throw new TRPCError({ code: "FORBIDDEN", message: "O seu perfil está limitado a reclamações a fornecedores." });
}
function ensureOccurrenceWrite(access: OccurrenceAccess) {
  ensureOccurrencesScope(access);
  if (access.role === "gestao") throw new TRPCError({ code: "FORBIDDEN", message: "O perfil de Gestão tem acesso apenas de consulta." });
}
function ensureOccurrenceAdmin(access: OccurrenceAccess) {
  ensureOccurrencesScope(access);
  if (access.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Esta ação requer perfil de administração de ocorrências." });
}
function ensureComplaintWrite(access: OccurrenceAccess) {
  if (access.role === "gestao") throw new TRPCError({ code: "FORBIDDEN", message: "O perfil de Gestão tem acesso apenas de consulta." });
}

function applyFilters(rows: (typeof occurrences.$inferSelect)[], filters: NonNullable<z.infer<typeof filtersInput>>) {
  return rows.filter((item) => {
    const date = toDateString(item.occurredOn) ?? "";
    const search = filters.search?.trim().toLowerCase();
    const content = [item.number, item.description, item.affectedProduct, item.lot, item.brcRequirement, item.responsible].join(" ").toLowerCase();
    const dueDays = daysUntil(item.implementationDueOn);
    return (!filters.type || item.type === filters.type)
      && (!filters.origin || item.origin === filters.origin)
      && (!filters.status || item.status === filters.status)
      && (!filters.factoryCode || item.factoryCode === filters.factoryCode)
      && (!filters.product || item.affectedProduct?.toLowerCase().includes(filters.product.toLowerCase()))
      && (!filters.responsible || item.responsible?.toLowerCase().includes(filters.responsible.toLowerCase()))
      && (!filters.brcRequirement || item.brcRequirement === filters.brcRequirement)
      && (!filters.hazardType || item.hazardType === filters.hazardType)
      && (!filters.sgsqaScope || item.sgsqaScope === filters.sgsqaScope)
      && (!filters.dataInicio || date >= filters.dataInicio)
      && (!filters.dataFim || date <= filters.dataFim)
      && (!filters.semEficacia || (item.status === "FECHADO" && !item.effectiveness))
      && (!filters.dueStatus || (filters.dueStatus === "vencido" ? dueDays !== null && dueDays < 0 : filters.dueStatus === "proximo" ? dueDays !== null && dueDays >= 0 && dueDays <= 7 : true))
      && (!search || content.includes(search));
  });
}

function occurrenceRecord(data: z.infer<typeof occurrenceInput>, userOpenId: string, profileId: number, existing?: typeof occurrences.$inferSelect) {
  const status = calculateStatus(data, data.status);
  const treatmentStarted = Boolean(data.correction?.trim() || data.correctiveAction?.trim());
  return normalized({
    ...data,
    occurredOn: asDate(data.occurredOn)!, factoryCode: data.factoryCode ?? "", status,
    correctionImplementedOn: asDate(data.correctionImplementedOn), correctiveActionDueOn: asDate(data.correctiveActionDueOn),
    correctiveActionClosedOn: asDate(data.correctiveActionClosedOn), implementationDueOn: asDate(data.implementationDueOn), closedOn: asDate(data.closedOn),
    nonconformingProductClass: data.nonconformingProductClass ?? "", hazardType: data.hazardType ?? "NA", effectiveness: data.effectiveness ?? "", impactsObjectives: data.impactsObjectives ?? "",
    recurrent: data.recurrent ?? false, openedByProfileId: existing?.openedByProfileId ?? profileId,
    treatmentByProfileId: treatmentStarted ? (existing?.treatmentByProfileId ?? profileId) : (existing?.treatmentByProfileId ?? null),
    effectivenessByProfileId: existing?.effectivenessByProfileId ?? null, updatedBy: userOpenId,
  });
}

function occurrenceToInput(item: typeof occurrences.$inferSelect): z.infer<typeof occurrenceInput> {
  return {
    occurredOn: toDateString(item.occurredOn)!, factoryCode: item.factoryCode, type: item.type, origin: item.origin,
    clientSupplierAuditor: item.clientSupplierAuditor, brcRequirement: item.brcRequirement, sgsqaScope: item.sgsqaScope,
    affectedProduct: item.affectedProduct, lot: item.lot, expiry: item.expiry, rawMaterialLot: item.rawMaterialLot,
    quantity: item.quantity, nonconformingProductClass: item.nonconformingProductClass, description: item.description,
    descriptionImages: item.descriptionImages, hazardType: item.hazardType, hazardDescription: item.hazardDescription,
    justification: item.justification, rootCauseAnalysis: item.rootCauseAnalysis, correction: item.correction,
    correctionResponsible: item.correctionResponsible, correctionImplementedOn: toDateString(item.correctionImplementedOn),
    correctionEvidence: item.correctionEvidence, correctionEvidenceImages: item.correctionEvidenceImages,
    correctiveAction: item.correctiveAction, correctiveActionResponsible: item.correctiveActionResponsible,
    correctiveActionDueOn: toDateString(item.correctiveActionDueOn), correctiveActionClosedOn: toDateString(item.correctiveActionClosedOn),
    correctiveActionEvidence: item.correctiveActionEvidence, correctiveActionEvidenceImages: item.correctiveActionEvidenceImages,
    implementationDueOn: toDateString(item.implementationDueOn), responsible: item.responsible, status: item.status,
    closedOn: toDateString(item.closedOn), closingResponsible: item.closingResponsible,
    effectivenessResponsible: item.effectivenessResponsible, effectivenessEvidence: item.effectivenessEvidence,
    assessmentMethod: item.assessmentMethod, effectiveness: item.effectiveness, recurrent: item.recurrent,
    recurrenceOfId: item.recurrenceOfId, impactsObjectives: item.impactsObjectives, effect: item.effect, observations: item.observations,
  };
}

function applyComplaintFilters(rows: (typeof supplierComplaints.$inferSelect)[], filters: NonNullable<z.infer<typeof complaintFiltersInput>>) {
  return rows.filter((item) => {
    const date = toDateString(item.complaintOn) ?? "";
    const search = filters.search?.trim().toLowerCase();
    const content = [item.number, item.supplier, item.sector, item.affectedProducts, item.lots, item.description, item.responsible].join(" ").toLowerCase();
    return (!filters.supplier || item.supplier.toLowerCase().includes(filters.supplier.toLowerCase()))
      && (!filters.status || item.status === filters.status)
      && (!filters.category || item.category === filters.category)
      && (!filters.dataInicio || date >= filters.dataInicio)
      && (!filters.dataFim || date <= filters.dataFim)
      && (!search || content.includes(search));
  });
}

function complaintRecord(data: z.infer<typeof complaintInput>, userOpenId: string) {
  return normalized({ ...data, complaintOn: asDate(data.complaintOn)!, correctionImplementedOn: asDate(data.correctionImplementedOn), correctiveActionDueOn: asDate(data.correctiveActionDueOn), correctiveActionClosedOn: asDate(data.correctiveActionClosedOn), closedOn: asDate(data.closedOn), recurrent: data.recurrent ?? false, status: data.status ?? "ABERTO", createdBy: userOpenId, updatedBy: userOpenId });
}

async function nextComplaintNumber(db: Awaited<ReturnType<typeof requireDb>>, complaintOn: string) {
  const year = new Date(`${complaintOn}T00:00:00`).getFullYear();
  const rows = await db.select({ number: supplierComplaints.number }).from(supplierComplaints);
  const highest = rows.reduce((current, row) => {
    const match = row.number?.match(new RegExp(`^(\\d+)[./]${year}$`));
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `${highest + 1}/${year}`;
}

export const occurrencesRouter = router({
  access: qualitySessionProcedure.query(async ({ ctx }) => getOccurrenceAccess(ctx)),
  listAccessProfiles: qualityManagerProcedure.query(async () => (await requireDb()).select().from(occurrenceAccessProfiles)),
  updateAccessProfile: qualityManagerProcedure.input(z.object({ qualityProfileId: z.number().int(), role: z.enum(["user", "admin", "gestao"]), scope: z.enum(["all", "reclamacoes"]) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.insert(occurrenceAccessProfiles).values({ ...input, updatedBy: ctx.user!.openId }).onDuplicateKeyUpdate({ set: { role: input.role, scope: input.scope, updatedBy: ctx.user!.openId } });
    return { success: true };
  }),
  list: qualitySessionProcedure.input(filtersInput).query(async ({ ctx, input }) => {
    const db = await requireDb();
    ensureOccurrencesScope(await getOccurrenceAccess(ctx));
    const filters = input ?? {};
    const rows = applyFilters(await db.select().from(occurrences).orderBy(desc(occurrences.occurredOn)), filters);
    const sortKey = filters.sortBy === "number" ? "number" : filters.sortBy === "implementationDueOn" ? "implementationDueOn" : "occurredOn";
    const direction = filters.sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => ((a[sortKey] ?? "") > (b[sortKey] ?? "") ? direction : -direction));
    const page = filters.page ?? 1, pageSize = filters.pageSize ?? 25;
    return { data: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
  }),

  get: qualitySessionProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    ensureOccurrencesScope(await getOccurrenceAccess(ctx));
    const item = (await db.select().from(occurrences).where(eq(occurrences.id, input.id)).limit(1))[0];
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência não encontrada." });
    return item;
  }),

  create: qualityOperatorProcedure.input(occurrenceInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    ensureOccurrenceWrite(await getOccurrenceAccess(ctx));
    const latest = (await db.select({ number: occurrences.number }).from(occurrences).orderBy(desc(occurrences.number)).limit(1))[0];
    const [created] = await db.insert(occurrences).values({ ...occurrenceRecord(input, ctx.user!.openId, ctx.operatorProfile!.id), number: (latest?.number ?? 0) + 1, createdBy: ctx.user!.openId }).$returningId();
    return { id: created.id };
  }),

  update: qualityOperatorProcedure.input(z.object({ id: z.number().int(), data: occurrenceInput.partial() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const access = await getOccurrenceAccess(ctx);
    ensureOccurrenceWrite(access);
    const existing = (await db.select().from(occurrences).where(eq(occurrences.id, input.id)).limit(1))[0];
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ocorrência não encontrada." });
    if (access.role !== "admin" && (Boolean(input.data.effectiveness) || Boolean(input.data.effectivenessResponsible) || Boolean(input.data.effectivenessEvidence) || Boolean(input.data.assessmentMethod))) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o perfil de administração de ocorrências pode avaliar a eficácia." });
    const complete = { ...occurrenceToInput(existing), ...input.data } as z.infer<typeof occurrenceInput>;
    const record = occurrenceRecord(complete, ctx.user!.openId, ctx.operatorProfile!.id, existing);
    await db.update(occurrences).set(record).where(eq(occurrences.id, input.id));
    return { success: true };
  }),

  updateEffectiveness: qualityOperatorProcedure.input(z.object({ id: z.number().int(), closedOn: optionalDate, effectivenessResponsible: z.string().max(255).optional().nullable(), effectivenessEvidence: optionalText, assessmentMethod: optionalText, effectiveness: z.enum(["Satisfatória", "Não Satisfatória", ""]) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    ensureOccurrenceAdmin(await getOccurrenceAccess(ctx));
    const existing = (await db.select().from(occurrences).where(eq(occurrences.id, input.id)).limit(1))[0];
    if (!existing || existing.type !== "NC") throw new TRPCError({ code: "BAD_REQUEST", message: "A eficácia aplica-se apenas a ocorrências NC." });
    await db.update(occurrences).set({ closedOn: asDate(input.closedOn), effectivenessResponsible: input.effectivenessResponsible ?? null, effectivenessEvidence: input.effectivenessEvidence ?? null, assessmentMethod: input.assessmentMethod ?? null, effectiveness: input.effectiveness, effectivenessByProfileId: ctx.operatorProfile!.id, updatedBy: ctx.user!.openId }).where(eq(occurrences.id, input.id));
    return { success: true };
  }),

  delete: qualityOperatorProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    ensureOccurrenceAdmin(await getOccurrenceAccess(ctx));
    await db.delete(occurrences).where(eq(occurrences.id, input.id));
    return { success: true };
  }),

  dashboard: qualitySessionProcedure.input(filtersInput).query(async ({ ctx, input }) => {
    const db = await requireDb();
    ensureOccurrencesScope(await getOccurrenceAccess(ctx));
    const rows = applyFilters(await db.select().from(occurrences), input ?? {});
    const now = new Date();
    const open = rows.filter((row) => row.status === "ABERTO");
    const group = <T extends string | null>(items: typeof rows, selector: (row: typeof rows[number]) => T) => Object.entries(items.reduce<Record<string, number>>((acc, row) => { const key = selector(row) ?? ""; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {})).map(([key, count]) => ({ ["key"]: key, count }));
    const monthly = rows.reduce<Record<string, number>>((acc, row) => { const key = toDateString(row.occurredOn)?.slice(0, 7) ?? ""; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
    return {
      total: rows.length, open: open.length, closed: rows.filter((row) => row.status === "FECHADO").length,
      overdue: open.filter((row) => row.implementationDueOn && new Date(row.implementationDueOn) < now).length,
      upcoming: open.filter((row) => { const days = daysUntil(row.implementationDueOn); return days !== null && days >= 0 && days <= 7; }).length,
      withoutEffectiveness: rows.filter((row) => row.status === "FECHADO" && !row.effectiveness).length,
      monthly: Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
      byOrigin: group(rows, (row) => row.origin).map((item) => ({ origin: item.key, count: item.count })),
      byFactory: group(rows, (row) => row.factoryCode).map((item) => ({ factoryCode: item.key, count: item.count })),
      byScope: group(rows, (row) => row.sgsqaScope).map((item) => ({ scope: item.key, count: item.count })),
      byBrcRequirement: group(rows, (row) => row.brcRequirement).map((item) => ({ requirement: item.key, count: item.count })),
      effectiveness: group(rows.filter((row) => row.effectiveness), (row) => row.effectiveness).map((item) => ({ effectiveness: item.key, count: item.count })),
    };
  }),

  uploadImage: qualityOperatorProcedure.input(z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().regex(/^image\//), dataUrl: z.string().min(20).max(7_000_000) })).mutation(async ({ ctx, input }) => {
    ensureOccurrenceWrite(await getOccurrenceAccess(ctx));
    const base64 = input.dataUrl.split(",")[1];
    if (!base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { url } = await storagePut(`occurrences/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`, Buffer.from(base64, "base64"), input.mimeType);
    return { url };
  }),
  uploadComplaintImage: qualityOperatorProcedure.input(z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().regex(/^image\//), dataUrl: z.string().min(20).max(7_000_000) })).mutation(async ({ ctx, input }) => {
    ensureComplaintWrite(await getOccurrenceAccess(ctx));
    const base64 = input.dataUrl.split(",")[1];
    if (!base64) throw new TRPCError({ code: "BAD_REQUEST", message: "Imagem inválida." });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { url } = await storagePut(`supplier-complaints/${ctx.operatorProfile!.id}/${Date.now()}-${safeName}`, Buffer.from(base64, "base64"), input.mimeType);
    return { url };
  }),

  suggestTreatment: qualityOperatorProcedure.input(z.object({ kind: z.enum(["correction", "correctiveAction"]), description: z.string().min(12).max(12_000), type: z.enum(occurrenceTypes).optional(), origin: z.enum(occurrenceOrigins).optional(), sgsqaScope: z.string().max(255).optional(), affectedProduct: z.string().max(255).optional(), hazardType: z.string().max(255).optional(), rootCauseAnalysis: z.string().max(12_000).optional(), existingCorrection: z.string().max(12_000).optional() })).mutation(async ({ ctx, input }) => {
    ensureOccurrenceWrite(await getOccurrenceAccess(ctx));
    const objective = input.kind === "correction" ? "Sugere uma correção imediata, concreta e verificável para conter o desvio e proteger o produto." : "Sugere uma ação corretiva/preventiva concreta que elimine a causa-raiz, previna reincidência e indique uma verificação de eficácia.";
    const response = await invokeLLM({ messages: [{ role: "system", content: "És especialista em segurança alimentar BRCGS. Responde em português europeu, de forma técnica, concisa e sem preâmbulos." }, { role: "user", content: `${objective}\n\nOcorrência: ${input.description}\nTipo: ${input.type ?? "N/D"}\nOrigem: ${input.origin ?? "N/D"}\nÂmbito SGSQA: ${input.sgsqaScope ?? "N/D"}\nProduto: ${input.affectedProduct ?? "N/D"}\nPerigo: ${input.hazardType ?? "N/D"}\nCausa-raiz: ${input.rootCauseAnalysis ?? "N/D"}\nCorreção existente: ${input.existingCorrection ?? "N/D"}` }], maxTokens: 500 });
    const content = response.choices?.[0]?.message.content;
    return { suggestion: typeof content === "string" ? content.trim() : "" };
  }),

  suggestBrc: qualityOperatorProcedure.input(z.object({ description: z.string().min(12).max(12_000), type: z.enum(occurrenceTypes).optional(), origin: z.enum(occurrenceOrigins).optional(), sgsqaScope: z.string().max(255).optional(), affectedProduct: z.string().max(255).optional(), hazardType: z.string().max(255).optional() })).mutation(async ({ ctx, input }) => {
    ensureOccurrenceWrite(await getOccurrenceAccess(ctx));
    const response = await invokeLLM({ messages: [{ role: "system", content: `És auditor BRCGS Food Safety Issue 9. ${BRC_REFERENCE}` }, { role: "user", content: `Analisa a ocorrência e devolve somente JSON válido com requisitoBRC e causaRaiz. Descrição: ${input.description}\nTipo: ${input.type ?? "N/D"}\nOrigem: ${input.origin ?? "N/D"}\nÂmbito: ${input.sgsqaScope ?? "N/D"}\nProduto: ${input.affectedProduct ?? "N/D"}\nPerigo: ${input.hazardType ?? "N/D"}` }], response_format: { type: "json_schema", json_schema: { name: "brc_occurrence_analysis", strict: true, schema: { type: "object", properties: { requisitoBRC: { type: "string" }, causaRaiz: { type: "string" } }, required: ["requisitoBRC", "causaRaiz"], additionalProperties: false } } }, maxTokens: 700 });
    const content = response.choices?.[0]?.message.content;
    try {
      const parsed = JSON.parse(typeof content === "string" ? content : "{}");
      return { requirement: String(parsed.requisitoBRC ?? "").trim(), rootCause: String(parsed.causaRaiz ?? "").trim() };
    } catch { throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A sugestão BRC não ficou disponível. Tente novamente." }); }
  }),

  listSupplierComplaints: qualitySessionProcedure.input(complaintFiltersInput).query(async ({ ctx, input }) => {
    await getOccurrenceAccess(ctx);
    return applyComplaintFilters(await (await requireDb()).select().from(supplierComplaints).orderBy(desc(supplierComplaints.complaintOn)), input ?? {});
  }),
  getSupplierComplaint: qualitySessionProcedure.input(z.object({ id: z.number().int() })).query(async ({ ctx, input }) => {
    await getOccurrenceAccess(ctx);
    const complaint = (await (await requireDb()).select().from(supplierComplaints).where(eq(supplierComplaints.id, input.id)).limit(1))[0];
    if (!complaint) throw new TRPCError({ code: "NOT_FOUND", message: "Reclamação a fornecedor não encontrada." });
    return complaint;
  }),
  supplierComplaintStats: qualitySessionProcedure.input(complaintFiltersInput).query(async ({ ctx, input }) => {
    await getOccurrenceAccess(ctx);
    const rows = applyComplaintFilters(await (await requireDb()).select().from(supplierComplaints), input ?? {});
    const bySupplier = Object.values(rows.reduce<Record<string, { supplier: string; total: number; open: number; closed: number }>>((acc, row) => { const key = row.supplier || "Não especificado"; const group = acc[key] ?? { supplier: key, total: 0, open: 0, closed: 0 }; group.total += 1; if (row.status === "ABERTO") group.open += 1; else group.closed += 1; acc[key] = group; return acc; }, {}));
    const byMonth = Object.values(rows.reduce<Record<string, { month: string; open: number; closed: number }>>((acc, row) => { const month = (toDateString(row.complaintOn) ?? "").slice(0, 7); const group = acc[month] ?? { month, open: 0, closed: 0 }; if (row.status === "ABERTO") group.open += 1; else group.closed += 1; acc[month] = group; return acc; }, {})).sort((a, b) => a.month.localeCompare(b.month));
    const bySupplierCategory = Object.values(rows.reduce<Record<string, { supplier: string; produto: number; servico: number; noCategory: number }>>((acc, row) => { const key = row.supplier || "Não especificado"; const group = acc[key] ?? { supplier: key, produto: 0, servico: 0, noCategory: 0 }; if (row.category === "PRODUTO") group.produto += 1; else if (row.category === "SERVICO") group.servico += 1; else group.noCategory += 1; acc[key] = group; return acc; }, {}));
    return { total: rows.length, open: rows.filter((row) => row.status === "ABERTO").length, closed: rows.filter((row) => row.status === "FECHADO").length, bySupplier, byMonth, bySupplierCategory };
  }),
  listComplaintSuppliers: qualitySessionProcedure.query(async ({ ctx }) => {
    await getOccurrenceAccess(ctx);
    return Array.from(new Set((await (await requireDb()).select({ supplier: supplierComplaints.supplier }).from(supplierComplaints)).map((row) => row.supplier).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }),
  createSupplierComplaint: qualityOperatorProcedure.input(complaintInput).mutation(async ({ ctx, input }) => {
    ensureComplaintWrite(await getOccurrenceAccess(ctx));
    const db = await requireDb();
    const [created] = await db.insert(supplierComplaints).values({ ...complaintRecord(input, ctx.user!.openId), number: await nextComplaintNumber(db, input.complaintOn) }).$returningId();
    return { id: created.id };
  }),
  updateSupplierComplaint: qualityOperatorProcedure.input(z.object({ id: z.number().int(), data: complaintInput.partial() })).mutation(async ({ ctx, input }) => {
    ensureComplaintWrite(await getOccurrenceAccess(ctx));
    const db = await requireDb();
    const existing = (await db.select().from(supplierComplaints).where(eq(supplierComplaints.id, input.id)).limit(1))[0];
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Reclamação a fornecedor não encontrada." });
    const merged = { ...existing, ...input.data, complaintOn: input.data.complaintOn ?? toDateString(existing.complaintOn)! } as z.infer<typeof complaintInput>;
    const record = complaintRecord(merged, ctx.user!.openId);
    const { createdBy, ...update } = record;
    await db.update(supplierComplaints).set(update).where(eq(supplierComplaints.id, input.id));
    return { success: true };
  }),
  deleteSupplierComplaint: qualityOperatorProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const access = await getOccurrenceAccess(ctx);
    if (access.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "A eliminação requer perfil de administração de ocorrências." });
    await (await requireDb()).delete(supplierComplaints).where(eq(supplierComplaints.id, input.id));
    return { success: true };
  }),
});
