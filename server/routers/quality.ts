import { TRPCError } from "@trpc/server";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  areas,
  factories,
  checklistItems,
  controlPlans,
  controlEntries,
  controlTasks,
  correctiveActions,
  evidences,
  fragileItems,
  nonconformities,
  qualityModuleValues,
  resultValues,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { calculateConformityRate, calculateSensoryScore, isFragileInspectionPending, shouldCreateCriticalMetalAlert } from "../quality.logic";
import { calculatePlanCompliance, countOpenNonconformities, scopeToFactory } from "../factory.scope.logic";
import { storagePut } from "../storage";
import { protectedProcedure, router } from "../_core/trpc";

const qualityModuleSchema = z.enum(qualityModuleValues);
const resultSchema = z.enum(resultValues);
const dateInput = z.coerce.date();

function asDateRange(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A base de dados não está disponível." });
  return db;
}

function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem alterar a checklist mensal." });
  }
}

export const qualityRouter = router({
  metadata: protectedProcedure.query(async () => {
    const db = await requireDb();
    const [persistedAreas, persistedFactories] = await Promise.all([
      db.select().from(areas).orderBy(areas.group, areas.name),
      db.select().from(factories).orderBy(factories.name),
    ]);
    return {
      areas: persistedAreas.map((area) => ({ id: area.id, name: area.name, group: area.group })),
      factories: persistedFactories.map((factory) => ({ id: factory.id, code: factory.code, name: factory.name })),
      modules: [
      { id: "bphf", label: "Verificação de BPHF" },
      { id: "metal_detectors", label: "Verificação de detetores de metais" },
      { id: "sensory", label: "Controlo sensorial de produto acabado" },
      { id: "shelf_life", label: "Controlo de amostras em shelf-life" },
      { id: "monthly_checklist", label: "Checklist mensal por área" },
      { id: "suggestion_boxes", label: "Verificação de caixas de sugestões" },
      { id: "fragile_items", label: "Verificação de quebráveis" },
      ],
    };
  }),

  listAreas: protectedProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(areas).orderBy(areas.group, areas.name);
  }),

  listFactories: protectedProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(factories).orderBy(factories.name);
  }),

  addArea: protectedProcedure.input(z.object({
    name: z.string().min(2).max(120),
    group: z.enum(["bphf", "metal", "general"]),
  })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user.role);
    const db = await requireDb();
    await db.insert(areas).values({ ...input, active: "true", createdBy: ctx.user.openId });
    return { success: true };
  }),

  listPlans: protectedProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(controlPlans).orderBy(controlPlans.module, controlPlans.title);
  }),

  addPlan: protectedProcedure.input(z.object({
    title: z.string().min(2).max(180),
    module: qualityModuleSchema,
    areaId: z.number().int(),
    factoryId: z.number().int().optional(),
    frequency: z.enum(["daily", "weekly", "monthly", "per_shift", "per_lot"]),
    critical: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user.role);
    const db = await requireDb();
    await db.insert(controlPlans).values({ ...input, factoryId: input.factoryId ?? null, critical: input.critical ? "true" : "false", active: "true", createdBy: ctx.user.openId });
    return { success: true };
  }),

  initializeMasterData: protectedProcedure.mutation(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
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
    if (!existingAreas.length) { await db.insert(areas).values(defaultAreas.map((area) => ({ ...area, active: "true" as const, createdBy: ctx.user.openId }))); created += defaultAreas.length; }
    if (!existingFactories.length) { await db.insert(factories).values(defaultFactories.map((factory) => ({ ...factory, active: "true" as const, createdBy: ctx.user.openId }))); created += defaultFactories.length; }
    return { success: true, created };
  }),

  dashboard: protectedProcedure.input(z.object({ factoryId: z.number().int().optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const [tasks, ncs, entries, actions, fragileCatalog] = await Promise.all([
      db.select().from(controlTasks).orderBy(controlTasks.dueAt),
      db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt)),
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(correctiveActions).orderBy(correctiveActions.dueAt),
      db.select().from(fragileItems).orderBy(fragileItems.location, fragileItems.sortOrder, fragileItems.name),
    ]);
    const scopedTasks = scopeToFactory(tasks, input?.factoryId);
    const scopedNcs = scopeToFactory(ncs, input?.factoryId);
    const scopedEntries = scopeToFactory(entries, input?.factoryId);
    const scopedActions = scopeToFactory(actions, input?.factoryId);
    const scopedFragileCatalog = scopeToFactory(fragileCatalog, input?.factoryId);
    const now = new Date();
    const { start, end } = asDateRange(now);
    const pending = scopedTasks.filter((task) => task.status === "pending");
    const overdue = pending.filter((task) => task.dueAt < now);
    const completedToday = scopedEntries.filter((entry) => entry.completedAt >= start && entry.completedAt < end);
    const todayTasks = scopedTasks.filter((task) => task.dueAt >= start && task.dueAt < end);
    const completedTasksToday = todayTasks.filter((task) => task.status === "completed" && task.completedAt && task.completedAt >= start && task.completedAt < end);
    const critical = scopedNcs.filter((nc) => nc.status !== "closed" && nc.severity === "critical");
    const openActions = scopedActions.filter((action) => action.status !== "verified");
    const lastFragileInspections = new Map<number, Date>();
    scopedEntries.filter((entry) => entry.module === "fragile_items").forEach((entry) => {
      const payload = entry.payload;
      const fragileItemId = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { fragileItemId?: unknown }).fragileItemId : null;
      if (typeof fragileItemId === "number" && !lastFragileInspections.has(fragileItemId)) lastFragileInspections.set(fragileItemId, entry.completedAt);
    });
    const fragilePending = scopedFragileCatalog.filter((item) => item.status === "active" && isFragileInspectionPending(item.periodicity, lastFragileInspections.get(item.id), now));

    return {
      tasks: scopedTasks.slice(0, 20),
      criticalNcs: critical.slice(0, 6),
      dueActions: openActions.filter((action) => action.dueAt && action.dueAt < now).slice(0, 6),
      metrics: {
        pending: pending.length,
        overdue: overdue.length,
        criticalOpen: critical.length,
        completedToday: completedToday.length,
        fragilePending: fragilePending.length,
        dailyExecutionRate: todayTasks.length ? Number(((completedTasksToday.length / todayTasks.length) * 100).toFixed(1)) : 0,
      },
    };
  }),

  listTasks: protectedProcedure.input(z.object({ factoryId: z.number().int().optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const tasks = await db.select().from(controlTasks).orderBy(controlTasks.dueAt);
    return scopeToFactory(tasks, input?.factoryId);
  }),

  createTask: protectedProcedure.input(z.object({
    title: z.string().min(2).max(180),
    module: qualityModuleSchema,
    area: z.string().min(2).max(120),
    factoryId: z.number().int().optional(),
    dueAt: dateInput,
    responsible: z.string().min(2).max(120),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.insert(controlTasks).values({ ...input, factoryId: input.factoryId ?? null, createdBy: ctx.user.openId });
    return { success: true };
  }),

  completeTask: protectedProcedure.input(z.object({
    id: z.number().int(),
    result: resultSchema,
    notes: z.string().max(3000).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const task = (await db.select().from(controlTasks).where(eq(controlTasks.id, input.id)).limit(1))[0];
    if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada." });
    const completedAt = new Date();
    await db.update(controlTasks).set({ status: "completed", completedAt }).where(eq(controlTasks.id, input.id));
    await db.insert(controlEntries).values({
      module: task.module,
      title: task.title,
      area: task.area,
      factoryId: task.factoryId,
      result: input.result,
      notes: input.notes ?? null,
      payload: { taskId: task.id },
      completedAt,
      createdBy: ctx.user.openId,
    });
    if (shouldCreateCriticalMetalAlert(task.module, input.result)) {
      await db.insert(nonconformities).values({
        module: "metal_detectors",
        title: `Falha no detetor de metais — ${task.area}`,
        description: input.notes || "Resultado NC registado na verificação do detetor de metais.",
        area: task.area,
        factoryId: task.factoryId,
        severity: "critical",
        status: "open",
        detectedAt: completedAt,
        createdBy: ctx.user.openId,
      });
    }
    return { success: true };
  }),

  createEntry: protectedProcedure.input(z.object({
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
      createdBy: ctx.user.openId,
    });
    const isCriticalMetal = shouldCreateCriticalMetalAlert(input.module, input.result);
    if (input.createNonconformity || isCriticalMetal) {
      await db.insert(nonconformities).values({
        module: input.module,
        title: isCriticalMetal ? `Alerta crítico — ${input.title}` : input.title,
        description: input.notes || "Não conformidade registada a partir de um controlo operacional.",
        area: input.area,
        factoryId: input.factoryId ?? null,
        severity: isCriticalMetal ? "critical" : input.severity,
        status: "open",
        detectedAt: completedAt,
        createdBy: ctx.user.openId,
      });
    }
    return { success: true, critical: isCriticalMetal };
  }),

  calculateSensory: protectedProcedure.input(z.object({
    aspeto: z.number().int().min(1).max(5),
    fimDeBoca: z.number().int().min(1).max(5),
    cor: z.number().int().min(1).max(5),
    cheiro: z.number().int().min(1).max(5),
    textura: z.number().int().min(1).max(5),
    sabor: z.number().int().min(1).max(5),
  })).query(({ input }) => calculateSensoryScore(input)),

  listNcs: protectedProcedure.input(z.object({ factoryId: z.number().int().optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const ncs = await db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt));
    return scopeToFactory(ncs, input?.factoryId);
  }),

  updateNc: protectedProcedure.input(z.object({
    id: z.number().int(),
    status: z.enum(["open", "in_progress", "awaiting_validation", "closed"]),
    assignedTo: z.string().max(120).optional(),
    dueAt: dateInput.optional(),
  })).mutation(async ({ ctx, input }) => {
    if (input.status === "closed") {
      requireAdmin(ctx.user.role);
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

  addCorrectiveAction: protectedProcedure.input(z.object({
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

  listActions: protectedProcedure.input(z.object({ nonconformityId: z.number().int() })).query(async ({ input }) => {
    const db = await requireDb();
    return db.select().from(correctiveActions).where(eq(correctiveActions.nonconformityId, input.nonconformityId)).orderBy(desc(correctiveActions.createdAt));
  }),

  completeAction: protectedProcedure.input(z.object({ id: z.number().int(), notes: z.string().max(3000).optional() })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.update(correctiveActions).set({ status: "completed", completedAt: new Date(), completionNotes: input.notes ?? null }).where(eq(correctiveActions.id, input.id));
    return { success: true };
  }),

  uploadEvidence: protectedProcedure.input(z.object({
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

  listEvidences: protectedProcedure.input(z.object({ nonconformityId: z.number().int() })).query(async ({ input }) => {
    const db = await requireDb();
    const actions = await db.select().from(correctiveActions).where(eq(correctiveActions.nonconformityId, input.nonconformityId));
    const direct = await db.select().from(evidences).where(eq(evidences.nonconformityId, input.nonconformityId));
    if (!actions.length) return direct;
    const actionEvidence = await db.select().from(evidences).where(inArray(evidences.correctiveActionId, actions.map((action) => action.id)));
    return [...direct, ...actionEvidence].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }),

  listChecklistItems: protectedProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(checklistItems).orderBy(checklistItems.area, checklistItems.sortOrder);
  }),

  addChecklistItem: protectedProcedure.input(z.object({
    area: z.string().min(2).max(120),
    label: z.string().min(3).max(500),
  })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx.user.role);
    const db = await requireDb();
    await db.insert(checklistItems).values({ ...input, createdBy: ctx.user.openId, sortOrder: 100, active: "true" });
    return { success: true };
  }),

  listFragileItems: protectedProcedure.input(z.object({ factoryId: z.number().int().optional(), periodicity: z.enum(["D", "S", "Q", "M"]).optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const items = await db.select().from(fragileItems).orderBy(fragileItems.location, fragileItems.sortOrder, fragileItems.name);
    return items.filter((item) => (!input?.factoryId || item.factoryId === input.factoryId) && (!input?.periodicity || item.periodicity === input.periodicity));
  }),

  fragilePending: protectedProcedure.input(z.object({ factoryId: z.number().int().optional(), periodicity: z.enum(["D", "S", "Q", "M"]).optional() }).optional()).query(async ({ input }) => {
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
      .map((item) => ({ ...item, lastInspectionAt: lastInspections.get(item.id) ?? null }))
      .filter((item) => isFragileInspectionPending(item.periodicity, item.lastInspectionAt, now))
      .sort((left, right) => (left.lastInspectionAt?.getTime() ?? 0) - (right.lastInspectionAt?.getTime() ?? 0));
  }),

  addFragileItem: protectedProcedure.input(z.object({
    name: z.string().min(2).max(180),
    location: z.string().min(2).max(120),
    factoryId: z.number().int().optional(),
    periodicity: z.enum(["D", "S", "Q", "M"]).default("M"),
    itemType: z.enum(["Vidro", "Plástico rígido", "Outro"]),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.insert(fragileItems).values({ ...input, factoryId: input.factoryId ?? null, status: "active", createdBy: ctx.user.openId });
    return { success: true };
  }),

  updateFragileItem: protectedProcedure.input(z.object({
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

  uploadFragileReferenceImage: protectedProcedure.input(z.object({
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
    const key = `fragile-reference/${ctx.user.id}/${input.itemId}/${Date.now()}-${safeName}`;
    const { key: referenceImageKey, url: referenceImageUrl } = await storagePut(key, Buffer.from(base64, "base64"), input.mimeType);
    await db.update(fragileItems).set({ referenceImageKey, referenceImageUrl, referenceImageName: input.fileName }).where(eq(fragileItems.id, input.itemId));
    return { success: true, url: referenceImageUrl };
  }),

  reports: protectedProcedure.input(z.object({ factoryId: z.number().int().optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const [entries, tasks, ncs] = await Promise.all([
      db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
      db.select().from(controlTasks),
      db.select().from(nonconformities),
    ]);
    const scopedEntries = scopeToFactory(entries, input?.factoryId);
    const scopedTasks = scopeToFactory(tasks, input?.factoryId);
    const scopedNcs = scopeToFactory(ncs, input?.factoryId);
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
      planCompliance: calculatePlanCompliance(scopedTasks),
      openNcs: countOpenNonconformities(scopedNcs).open,
      criticalOpen: countOpenNonconformities(scopedNcs).criticalOpen,
    };
  }),

  initializeChecklist: protectedProcedure.mutation(async ({ ctx }) => {
    requireAdmin(ctx.user.role);
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
      createdBy: ctx.user.openId,
    })));
    return { success: true, created: defaults.length };
  }),
});
