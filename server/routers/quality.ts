import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  areas,
  factories,
  checklistItems,
  controlPlans,
  controlEntries,
  controlTasks,
  dailyIncidenceSummaries,
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
import { businessDayAfter, calculateConformityRate, calculateDispatchConformity, calculateSensoryScore, fragileInspectionDelayDays, fragileInspectionDueDate, isBusinessDay, isFragileInspectionPending, isMonthlyChecklistAvailable, nextBusinessDay, shouldCreateCriticalMetalAlert } from "../quality.logic";
import { calculatePlanCompliance, countOpenNonconformities, scopeToFactory } from "../factory.scope.logic";
import { storageGetSignedUrl, storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import { createSessionToken, hashPin, hashSessionToken, QUALITY_OPERATOR_COOKIE, QUALITY_SESSION_HOURS, QUALITY_TEAM_DEFAULTS, validatePin, verifyPin } from "../team-access";
import { getSessionCookieOptions } from "../_core/cookies";
import { protectedProcedure, publicProcedure, qualityManagerProcedure, qualityOperatorProcedure, qualitySessionProcedure, router } from "../_core/trpc";
import { getDispatchProfile } from "../../shared/dispatch-control";

const qualityModuleSchema = z.enum(qualityModuleValues);
const resultSchema = z.enum(resultValues);
const dateInput = z.coerce.date();
const BPHF_AREA_NAMES = ["Produção", "Embalagem", "Logística", "Manutenção", "Limpeza", "Outros"] as const;
const REQUIRED_MODULE_FREQUENCIES = [
  { module: "bphf", frequency: "daily", title: "BPHF obrigatório" },
  { module: "shelf_life", frequency: "daily", title: "Shelf-life obrigatório" },
  { module: "dispatch_control", frequency: "daily", title: "Expedição obrigatória" },
  { module: "suggestion_boxes", frequency: "weekly", title: "Caixas de sugestões obrigatórias" },
  { module: "sensory", frequency: "weekly", title: "Controlo sensorial obrigatório" },
  { module: "monthly_checklist", frequency: "monthly", title: "Checklist mensal obrigatório" },
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
  if (frequency === "monthly") return isMonthlyChecklistAvailable(date);
  return false;
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
    pins: z.array(z.object({ code: z.string().min(3).max(48), pin: z.string().regex(/^\d{4,8}$/) })).min(1).max(3),
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
    const [persistedAreas, persistedFactories] = await Promise.all([
      db.select().from(areas).orderBy(areas.group, areas.name),
      db.select().from(factories).orderBy(factories.name),
    ]);
    return {
      areas: persistedAreas.map((area) => ({ id: area.id, name: area.name, group: area.group, factoryId: area.factoryId })),
      factories: persistedFactories.map((factory) => ({ id: factory.id, code: factory.code, name: factory.name })),
      modules: [
      { id: "bphf", label: "Verificação de BPHF" },
      { id: "metal_detectors", label: "Verificação de detetores de metais" },
      { id: "sensory", label: "Controlo sensorial de produto acabado" },
      { id: "shelf_life", label: "Controlo de amostras em shelf-life" },
      { id: "monthly_checklist", label: "Checklist mensal por área" },
      { id: "suggestion_boxes", label: "Verificação de caixas de sugestões" },
      { id: "fragile_items", label: "Verificação de quebráveis" },
      { id: "dispatch_control", label: "Controlo à expedição" },
      ],
    };
  }),

  listAreas: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(areas).orderBy(areas.group, areas.name);
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
    const bphfAreasToCreate = currentFactories.flatMap((factory) => BPHF_AREA_NAMES
      .filter((name) => !existingBphfAreas.some((area) => area.factoryId === factory.id && area.name === name))
      .map((name) => ({ name, group: "bphf" as const, factoryId: factory.id, active: "true" as const, createdBy: ctx.user!.openId })));
    if (bphfAreasToCreate.length) { await db.insert(areas).values(bphfAreasToCreate); created += bphfAreasToCreate.length; }
    return { success: true, created };
  }),

  dashboard: qualitySessionProcedure.input(z.object({ factoryId: z.number().int().optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const [tasks, ncs, entries, actions, fragileCatalog, plans, areaCatalog, factoryCatalog] = await Promise.all([
      db.select().from(controlTasks).orderBy(controlTasks.dueAt),
      db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt)),
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(correctiveActions).orderBy(correctiveActions.dueAt),
      db.select().from(fragileItems).orderBy(fragileItems.location, fragileItems.sortOrder, fragileItems.name),
      db.select().from(controlPlans).orderBy(controlPlans.module, controlPlans.title),
      db.select().from(areas).orderBy(areas.name),
      db.select().from(factories).orderBy(factories.name),
    ]);
    const scopedTasks = scopeToFactory(tasks, input?.factoryId);
    const scopedNcs = scopeToFactory(ncs, input?.factoryId);
    const scopedEntries = scopeToFactory(entries, input?.factoryId);
    const scopedActions = scopeToFactory(actions, input?.factoryId);
    const scopedFragileCatalog = scopeToFactory(fragileCatalog, input?.factoryId);
    const scopedPlans = plans.filter((plan) => plan.active === "true" && (!input?.factoryId || plan.factoryId === input.factoryId || plan.factoryId === null));
    const now = new Date();
    const operationalDate = nextBusinessDay(now);
    const { start, end } = asDateRange(operationalDate);
    const tomorrowDate = businessDayAfter(operationalDate);
    const { start: tomorrowStart, end: tomorrowEnd } = asDateRange(tomorrowDate);
    const workingWeekStart = startOfWorkingWeek(operationalDate);
    const workingWeekEnd = new Date(workingWeekStart);
    workingWeekEnd.setDate(workingWeekEnd.getDate() + 5);
    const businessTasks = scopedTasks.filter((task) => isBusinessDay(task.dueAt) && task.status !== "cancelled");
    const pending = businessTasks.filter((task) => task.status === "pending");
    const overdue = pending.filter((task) => task.dueAt < start);
    const completedToday = scopedEntries.filter((entry) => entry.completedAt >= start && entry.completedAt < end);
    const todayTasks = businessTasks.filter((task) => task.dueAt >= start && task.dueAt < end);
    const completedTasksToday = todayTasks.filter((task) => task.status === "completed" && task.completedAt && task.completedAt >= start && task.completedAt < end);
    const areasById = new Map(areaCatalog.map((area) => [area.id, area.name]));
    const lastFragileInspections = new Map<number, Date>();
    scopedEntries.filter((entry) => entry.module === "fragile_items").forEach((entry) => {
      const payload = entry.payload;
      const fragileItemId = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { fragileItemId?: unknown }).fragileItemId : null;
      if (typeof fragileItemId === "number" && !lastFragileInspections.has(fragileItemId)) lastFragileInspections.set(fragileItemId, entry.completedAt);
    });
    type ScheduledPlan = { id: number; title: string; module: typeof qualityModuleValues[number]; areaId: number; factoryId: number | null; frequency: string; fragileItemId?: number };
    const manualPlans: ScheduledPlan[] = scopedPlans.map((plan) => ({ id: plan.id, title: plan.title, module: plan.module, areaId: plan.areaId, factoryId: plan.factoryId, frequency: plan.frequency }));
    const requiredPlans: ScheduledPlan[] = REQUIRED_MODULE_FREQUENCIES.filter((rule) => isPlanDue(rule.frequency, operationalDate)).flatMap((rule, ruleIndex) => factoryCatalog.filter((factory) => !input?.factoryId || factory.id === input.factoryId).filter((factory) => !manualPlans.some((plan) => plan.module === rule.module && plan.frequency === rule.frequency && (plan.factoryId === factory.id || plan.factoryId === null))).map((factory) => ({ id: -((ruleIndex + 1) * 1000 + factory.id), title: rule.title, module: rule.module, areaId: 0, factoryId: factory.id, frequency: rule.frequency })));
    const fragileRequiredPlans: ScheduledPlan[] = scopedFragileCatalog.filter((item) => item.status === "active" && isFragileInspectionPending(item.periodicity, lastFragileInspections.get(item.id), operationalDate)).map((item) => ({ id: -(90_000 + item.id), title: `Quebrável — ${item.name}`, module: "fragile_items", areaId: 0, factoryId: item.factoryId, frequency: item.periodicity, fragileItemId: item.id }));
    const duePlans = [...manualPlans.filter((plan) => isPlanDue(plan.frequency, operationalDate)), ...requiredPlans, ...fragileRequiredPlans];
    const completedDuePlans = duePlans.filter((plan) => {
      if (plan.fragileItemId) return completedToday.some((entry) => entry.module === "fragile_items" && entry.factoryId === plan.factoryId && Boolean(entry.payload && typeof entry.payload === "object" && (entry.payload as { fragileItemId?: unknown }).fragileItemId === plan.fragileItemId));
      const planArea = areasById.get(plan.areaId);
      return completedToday.some((entry) => entry.module === plan.module && (!plan.factoryId || entry.factoryId === plan.factoryId) && (!planArea || entry.area === planArea));
    });
    const dailyExpectedCount = todayTasks.length + duePlans.length;
    const dailyCompletedCount = completedTasksToday.length + completedDuePlans.length;
    const effectiveDailyExpectedCount = dailyExpectedCount || completedToday.length;
    const moduleProgress = Object.fromEntries(qualityModuleValues.map((module) => {
      const moduleTasks = todayTasks.filter((task) => task.module === module);
      const modulePlans = duePlans.filter((plan) => plan.module === module);
      const moduleCompletedTasks = completedTasksToday.filter((task) => task.module === module);
      const moduleCompletedPlans = completedDuePlans.filter((plan) => plan.module === module);
      const registeredToday = completedToday.filter((entry) => entry.module === module).length;
      const expected = moduleTasks.length + modulePlans.length;
      const completed = moduleCompletedTasks.length + moduleCompletedPlans.length;
      const denominator = expected || registeredToday;
      const pendingTaskTitles = moduleTasks.filter((task) => task.status !== "completed").map((task) => task.title);
      const pendingPlanTitles = modulePlans.filter((plan) => !moduleCompletedPlans.some((completedPlan) => completedPlan.id === plan.id)).map((plan) => `${plan.title}${areasById.get(plan.areaId) ? ` — ${areasById.get(plan.areaId)}` : ""}`);
      const completionTimes = [
        ...moduleCompletedTasks.map((task) => task.completedAt),
        ...completedToday.filter((entry) => entry.module === module).map((entry) => entry.completedAt),
      ].filter((date): date is Date => Boolean(date));
      const lastCompletedAt = completionTimes.reduce<Date | undefined>((latest, date) => !latest || date > latest ? date : latest, undefined);
      return [module, { expected, completed: expected ? completed : registeredToday, registeredToday, pending: Array.from(new Set([...pendingTaskTitles, ...pendingPlanTitles])), percentage: denominator ? Number(((expected ? completed : registeredToday) / denominator * 100).toFixed(1)) : 0, lastCompletedAt }];
    }));
    const visibleFactories = input?.factoryId ? factoryCatalog.filter((factory) => factory.id === input.factoryId) : factoryCatalog;
    const moduleProgressByFactory = Object.fromEntries(qualityModuleValues.map((module) => [module, visibleFactories.map((factory) => {
      const factoryTasks = todayTasks.filter((task) => task.module === module && task.factoryId === factory.id);
      const factoryPlans = duePlans.filter((plan) => plan.module === module && plan.factoryId === factory.id);
      const factoryCompletedTasks = completedTasksToday.filter((task) => task.module === module && task.factoryId === factory.id);
      const factoryCompletedPlans = completedDuePlans.filter((plan) => plan.module === module && plan.factoryId === factory.id);
      const registeredToday = completedToday.filter((entry) => entry.module === module && entry.factoryId === factory.id).length;
      const expected = factoryTasks.length + factoryPlans.length;
      const completed = factoryCompletedTasks.length + factoryCompletedPlans.length;
      const denominator = expected || registeredToday;
      return { factoryId: factory.id, expected, completed: expected ? completed : registeredToday, registeredToday, percentage: denominator ? Number(((expected ? completed : registeredToday) / denominator * 100).toFixed(1)) : 0 };
    })]));
    const critical = scopedNcs.filter((nc) => nc.status !== "closed" && nc.severity === "critical");
    const openActions = scopedActions.filter((action) => action.status !== "verified");
    const fragilePending = scopedFragileCatalog.filter((item) => item.status === "active" && isFragileInspectionPending(item.periodicity, lastFragileInspections.get(item.id), now));

    return {
      tasks: businessTasks.slice(0, 20),
      operationalDate,
      taskGroups: {
        today: businessTasks.filter((task) => task.dueAt >= start && task.dueAt < end),
        tomorrow: businessTasks.filter((task) => task.dueAt >= tomorrowStart && task.dueAt < tomorrowEnd),
        thisWeek: businessTasks.filter((task) => task.dueAt >= workingWeekStart && task.dueAt < workingWeekEnd && !(task.dueAt >= start && task.dueAt < tomorrowEnd)),
      },
      criticalNcs: critical.slice(0, 6),
      dueActions: openActions.filter((action) => action.dueAt && action.dueAt < now).slice(0, 6),
      metrics: {
        pending: pending.length,
        overdue: overdue.length,
        criticalOpen: critical.length,
        completedToday: completedToday.length,
        fragilePending: fragilePending.length,
        dailyExecutionRate: effectiveDailyExpectedCount ? Number(((dailyExpectedCount ? dailyCompletedCount : completedToday.length) / effectiveDailyExpectedCount * 100).toFixed(1)) : 0,
      },
      moduleProgress,
      moduleProgressByFactory,
    };
  }),

  listTasks: qualitySessionProcedure.input(z.object({ factoryId: z.number().int().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const [tasks, entries] = await Promise.all([
      db.select().from(controlTasks).orderBy(controlTasks.dueAt),
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
    ]);
    const profile = ctx.operatorProfile!;
    return scopeToFactory(tasks, input?.factoryId).filter((task) => {
      const assignees = Array.isArray(task.assigneeProfileIds) ? task.assigneeProfileIds : [];
      return isBusinessDay(task.dueAt) && task.status !== "cancelled" && (profile.role === "manager" || assignees.includes(profile.id));
    }).map((task) => {
      const report = entries.find((entry) => entry.payload?.taskId === task.id);
      const storedPhotos = report?.payload && typeof report.payload.executionReport === "object" && report.payload.executionReport && !Array.isArray(report.payload.executionReport) ? (report.payload.executionReport as { evidencePhotos?: unknown }).evidencePhotos : [];
      const evidencePhotos = Array.isArray(storedPhotos) ? storedPhotos.filter((photo): photo is { url: string; fileName: string; mimeType: string } => Boolean(photo && typeof photo === "object" && typeof (photo as { url?: unknown }).url === "string" && typeof (photo as { fileName?: unknown }).fileName === "string" && typeof (photo as { mimeType?: unknown }).mimeType === "string")) : [];
      return report ? { ...task, executionReport: { result: report.result, notes: report.notes, completedAt: report.completedAt, registeredByName: report.registeredByName, registeredByTitle: report.registeredByTitle, evidencePhotos } } : { ...task, executionReport: null };
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

  createEntry: qualityOperatorProcedure.input(z.object({
    module: qualityModuleSchema,
    title: z.string().min(2).max(180),
    area: z.string().min(2).max(120),
    factoryId: z.number().int().optional(),
    result: resultSchema.optional(),
    notes: z.string().max(3000).optional(),
    payload: z.record(z.string(), z.unknown()).default({}),
    createNonconformity: z.boolean().default(false),
    severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  })).mutation(async ({ ctx, input }) => {
    if (input.module === "monthly_checklist" && !isMonthlyChecklistAvailable(new Date())) throw new TRPCError({ code: "BAD_REQUEST", message: "O checklist mensal fica disponível a partir do dia 20 ou do primeiro dia útil seguinte." });
    const db = await requireDb();
    const completedAt = new Date();
    await db.insert(controlEntries).values({
      module: input.module,
      title: input.title,
      area: input.area,
      factoryId: input.factoryId ?? null,
      result: input.result ?? null,
      notes: input.notes ?? null,
      payload: input.payload,
      completedAt,
      registeredByProfileId: ctx.operatorProfile!.id,
      registeredByName: ctx.operatorProfile!.name,
      registeredByTitle: ctx.operatorProfile!.title,
      createdBy: ctx.user!.openId,
    });
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
    factoryId: z.number().int(),
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
    sourceOrderDocument: z.object({ name: z.string().min(1).max(180), url: z.string().startsWith("/manus-storage/") }).optional(),
  })).mutation(async ({ ctx, input }) => {
    const profile = getDispatchProfile(input.profile);
    const limits = { product: profile.productTemperatureLimit, vehicle: profile.vehicleTemperatureLimit };
    const conformity = calculateDispatchConformity({
      orderedBoxes: input.orderedBoxes,
      dispatchedBoxes: input.dispatchedBoxes,
      productLabelResult: input.productLabelResult,
      boxLabelResult: input.boxLabelResult,
      productTemperature: input.productTemperature,
      vehicleTemperature: input.vehicleTemperature,
      productTemperatureLimit: limits.product,
      vehicleTemperatureLimit: limits.vehicle,
    });
    if (conformity.result === "NC" && !input.observations?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "As observações são obrigatórias quando a expedição não está conforme." });
    const db = await requireDb();
    const completedAt = new Date();
    const title = `Expedição ${input.orderNumber} — ${input.customer}`;
    const area = `Expedição ${input.profile}`;
    const payload = { ...input, profileLabel: profile.label, temperatureLimits: limits, ...conformity };
    await db.insert(controlEntries).values({ module: "dispatch_control", title, area, factoryId: input.factoryId, result: conformity.result, notes: input.observations ?? null, payload, completedAt, registeredByProfileId: ctx.operatorProfile!.id, registeredByName: ctx.operatorProfile!.name, registeredByTitle: ctx.operatorProfile!.title, createdBy: ctx.user!.openId });
    return { success: true, conformity, limits, incidence: conformity.result === "NC" };
  }),

  listIncidences: qualitySessionProcedure.input(z.object({
    date: dateInput.optional(),
    factoryId: z.number().int().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const reference = input?.date ?? new Date();
    const { start, end } = asDateRange(reference);
    const [entries, factoryRows, ncRows] = await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(factories).orderBy(factories.name),
      db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt)),
    ]);
    const factoryNames = new Map(factoryRows.map((factory) => [factory.id, factory.name]));
    return entries.filter((entry) => entry.result === "NC" && entry.completedAt >= start && entry.completedAt < end && (!input?.factoryId || entry.factoryId === input.factoryId)).map((entry) => {
      const linked = ncRows.find((nc) => nc.sourceEntryId === entry.id);
      return { ...entry, factoryName: entry.factoryId ? factoryNames.get(entry.factoryId) ?? "Fábrica não identificada" : "Sem fábrica/linha", generatedNonconformity: Boolean(linked), nonconformityId: linked?.id ?? null };
    });
  }),

  updateIncidence: qualityOperatorProcedure.input(z.object({
    id: z.number().int(),
    title: z.string().min(2).max(180),
    area: z.string().min(2).max(120),
    notes: z.string().max(3000).optional(),
  })).mutation(async ({ input }) => {
    const db = await requireDb();
    const entry = (await db.select().from(controlEntries).where(eq(controlEntries.id, input.id)).limit(1))[0];
    if (!entry || entry.result !== "NC") throw new TRPCError({ code: "NOT_FOUND", message: "Incidência diária não encontrada." });
    await db.update(controlEntries).set({ title: input.title, area: input.area, notes: input.notes?.trim() || null }).where(eq(controlEntries.id, input.id));
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

  listNcs: qualitySessionProcedure.input(z.object({ factoryId: z.number().int().optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const ncs = await db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt));
    return scopeToFactory(ncs, input?.factoryId);
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

  listChecklistItems: qualitySessionProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(checklistItems).orderBy(checklistItems.area, checklistItems.sortOrder);
  }),

  addChecklistItem: qualityManagerProcedure.input(z.object({
    area: z.string().min(2).max(120),
    label: z.string().min(3).max(500),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.insert(checklistItems).values({ ...input, createdBy: ctx.user!.openId, sortOrder: 100, active: "true" });
    return { success: true };
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

  addFragileItem: qualityManagerProcedure.input(z.object({
    name: z.string().min(2).max(180),
    location: z.string().min(2).max(120),
    factoryId: z.number().int().optional(),
    periodicity: z.enum(["D", "S", "Q", "M"]).default("M"),
    itemType: z.enum(["Vidro", "Plástico rígido", "Outro"]),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.insert(fragileItems).values({ ...input, factoryId: input.factoryId ?? null, status: "active", createdBy: ctx.user!.openId });
    return { success: true };
  }),

  updateFragileItem: qualityOperatorProcedure.input(z.object({
    id: z.number().int(),
    name: z.string().min(2).max(180),
    location: z.string().min(2).max(120),
    factoryId: z.number().int().nullable(),
    periodicity: z.enum(["D", "S", "Q", "M"]),
    itemType: z.enum(["Vidro", "Plástico rígido", "Outro"]),
  })).mutation(async ({ input }) => {
    const db = await requireDb();
    const item = (await db.select().from(fragileItems).where(eq(fragileItems.id, input.id)).limit(1))[0];
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Ponto de controlo não encontrado." });
    await db.update(fragileItems).set({
      name: input.name,
      location: input.location,
      factoryId: input.factoryId,
      periodicity: input.periodicity,
      itemType: input.itemType,
    }).where(eq(fragileItems.id, input.id));
    return { success: true };
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
    await db.update(fragileItems).set({ referenceImageKey, referenceImageUrl, referenceImageName: input.fileName }).where(eq(fragileItems.id, input.itemId));
    return { success: true, url: referenceImageUrl };
  }),

  deleteFragileItem: qualityOperatorProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = await requireDb();
    const item = (await db.select().from(fragileItems).where(eq(fragileItems.id, input.id)).limit(1))[0];
    if (!item || item.status !== "active") throw new TRPCError({ code: "NOT_FOUND", message: "Ponto de controlo não encontrado." });
    await db.update(fragileItems).set({ status: "inactive" }).where(eq(fragileItems.id, input.id));
    return { success: true };
  }),

  reports: qualitySessionProcedure.input(z.object({
    factoryId: z.number().int().optional(),
    startDate: dateInput.optional(),
    endDate: dateInput.optional(),
    module: qualityModuleSchema.optional(),
    result: resultSchema.optional(),
    ncStatus: z.enum(["open", "in_progress", "awaiting_validation", "closed"]).optional(),
  }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const [entries, tasks, ncs] = await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(controlTasks),
      db.select().from(nonconformities),
    ]);
    const start = input?.startDate ? asDateRange(input.startDate).start : null;
    const end = input?.endDate ? asDateRange(input.endDate).end : null;
    if (start && end && start >= end) throw new TRPCError({ code: "BAD_REQUEST", message: "A data final deve ser posterior à data inicial." });
    const withinPeriod = (date: Date) => (!start || date >= start) && (!end || date < end);
    const scopedEntries = scopeToFactory(entries, input?.factoryId).filter((entry) => withinPeriod(entry.completedAt) && (!input?.module || entry.module === input.module) && (!input?.result || entry.result === input.result));
    const scopedTasks = scopeToFactory(tasks, input?.factoryId).filter((task) => task.status !== "cancelled" && withinPeriod(task.dueAt));
    const scopedNcs = scopeToFactory(ncs, input?.factoryId).filter((nc) => withinPeriod(nc.detectedAt) && (!input?.module || nc.module === input.module) && (!input?.ncStatus || nc.status === input.ncStatus));
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
    const now = new Date();
    const trends = Array.from({ length: 6 }, (_, index) => {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (5 - index) * 7 - 6);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const weeklyEntries = scopedEntries.filter((entry) => entry.completedAt >= start && entry.completedAt < end);
      return {
        label: `S${index + 1}`,
        entries: weeklyEntries.length,
        nc: weeklyEntries.filter((entry) => entry.result === "NC").length,
      };
    });
    return {
      modules,
      areas,
      trends,
      recentEntries: scopedEntries.slice(0, 12),
      planCompliance: calculatePlanCompliance(scopedTasks),
      openNcs: countOpenNonconformities(scopedNcs).open,
      criticalOpen: countOpenNonconformities(scopedNcs).criticalOpen,
      filters: { startDate: start, endDate: end, module: input?.module ?? null, result: input?.result ?? null, ncStatus: input?.ncStatus ?? null },
    };
  }),

  initializeChecklist: qualityManagerProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const existing = await db.select().from(checklistItems).limit(1);
    if (existing.length) return { success: true, created: 0 };
    const defaults = [
      "Cumprimento do plano de higienização",
      "Estado de limpeza de paredes e tectos",
      "Proteção de MP e embalagens primárias contra contaminações físicas",
      "Estado de conservação de utensílios e equipamentos de trabalho",
      "Higiene pessoal dos colaboradores",
      "Zonas de passagem desobstruídas",
      "Cumprimento do Plano de Controlo de Pragas",
    ];
    await db.insert(checklistItems).values(defaults.map((label, index) => ({
      area: "Geral",
      label,
      sortOrder: index + 1,
      active: "true" as const,
      createdBy: ctx.user!.openId,
    })));
    return { success: true, created: defaults.length };
  }),
});
