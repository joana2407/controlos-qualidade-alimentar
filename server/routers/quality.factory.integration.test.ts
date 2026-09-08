import { beforeEach, describe, expect, it, vi } from "vitest";
import { areas, checklistAreas, checklistItemAreas, checklistItemFactories, checklistItems, controlPlans, correctiveActions, controlEntries, controlTasks, dailyReportArchives, dailyReportArchiveViews, factories, fragileAreas, fragileItems, nonconformities, qualityPinProfiles } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { entryMatchesPlannedTask, isHistoricalPlanTaskSatisfied, qualityRouter } from "./quality";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../storage", () => ({ storagePut: vi.fn(), storageGetSignedUrl: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/notification", () => ({ notifyOwner: vi.fn() }));

const now = new Date(2026, 7, 14, 10, 0, 0);
const tasks = [
  { id: 1, factoryId: 1, status: "completed", dueAt: now, completedAt: now, module: "bphf", area: "Produção T", title: "BPHF F1", responsible: "Ana", assigneeProfileIds: [1] },
  { id: 2, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "metal_detectors", area: "Tradicional 1", title: "Metal F1", responsible: "Ana", assigneeProfileIds: [2] },
  { id: 3, factoryId: 2, status: "completed", dueAt: now, completedAt: now, module: "bphf", area: "Granel", title: "BPHF F2", responsible: "Bruno", assigneeProfileIds: [1] },
];
const initialTasks = tasks.map((task) => ({ ...task, assigneeProfileIds: [...task.assigneeProfileIds] }));
function addPublishedControlTask(module: string, factoryId: number | null, assigneeProfileIds = [1]) {
  tasks.push({ id: 100 + tasks.length, factoryId, status: "pending", dueAt: now, completedAt: null, module, area: "Plano do Dia", title: `Plano do Dia — ${module}`, responsible: "Equipa atribuída", assigneeProfileIds });
}
const entries = [
  { id: 1, factoryId: 1, module: "bphf", area: "Produção T", result: "C", completedAt: now, registeredByProfileId: 3, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade" },
  { id: 2, factoryId: 1, module: "metal_detectors", area: "Tradicional 1", result: "NC", completedAt: now },
  { id: 3, factoryId: 2, module: "bphf", area: "Granel", result: "C", completedAt: now },
  { id: 4, factoryId: 1, module: "fragile_items", area: "Zona Tratamento Térmico", result: "C", completedAt: now, payload: { fragileItemId: 1 } },
];
const ncs = [
  { id: 1, factoryId: 1, status: "open", severity: "critical", module: "metal_detectors", area: "Tradicional 1", title: "NC F1", detectedAt: now, reportedByProfileId: 1, reportedByName: "Sabrina Esteves", reportedByTitle: "Tec. Qualidade" },
  { id: 2, factoryId: 1, status: "closed", severity: "medium", module: "bphf", area: "Produção T", title: "NC fechada F1", detectedAt: now },
  { id: 3, factoryId: 2, status: "open", severity: "high", module: "bphf", area: "Granel", title: "NC F2", detectedAt: now },
];
const actions = [
  { id: 1, factoryId: 1, status: "pending", dueAt: now },
  { id: 2, factoryId: 2, status: "pending", dueAt: now },
];
const factoryRows = [
  { id: 1, code: "F1_FATIADO", name: "Fábrica 1 (Fatiado)" },
  { id: 2, code: "F2_GRANEL", name: "Fábrica 2 (granel)" },
  { id: 3, code: "F3_SEM_GLUTEN", name: "Fabrica 3 (Sem Gluten)" },
];
const areaRows = [{ id: 101, name: "Produção T", group: "bphf", factoryId: 1, active: "true" }];
const monthlyAreaRows = [{ id: 201, name: "Geral", active: "true" }];
const monthlyRows = [{ id: 301, area: "Geral", active: "true" }, { id: 302, area: "Geral", active: "true" }];
const monthlyAssignments = [{ checklistItemId: 301, factoryId: 1 }, { checklistItemId: 302, factoryId: 1 }];
const monthlyAreaAssignments = [{ checklistItemId: 301, checklistAreaId: 201 }, { checklistItemId: 302, checklistAreaId: 201 }];
const archiveRows: any[] = [];
const archiveViewRows: any[] = [];
const profileRows = [{ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", active: "true", role: "technician" }, { id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", active: "true", role: "technician" }, { id: 3, name: "Joana Pina", title: "Resp. Qualidade", active: "true", role: "manager" }];
const plans: Array<{ id: number; title: string; module: "bphf"; areaId: number; factoryId: number; frequency: "daily"; active: "true" }> = [];
const fragile = [
  { id: 1, factoryId: 1, periodicity: "D", location: "Zona Tratamento Térmico", name: "Portas forno Anelar 1", status: "active" },
  { id: 2, factoryId: 1, periodicity: "S", location: "Zona Tratamento Térmico", name: "Iluminação Calhas", status: "active" },
  { id: 3, factoryId: 2, periodicity: "M", location: "Z. PRODUÇÃO", name: "Janelas-Exterior", status: "active" },
];
const fragileAreaRows = [
  { id: 1, factoryId: 1, name: "Zona Tratamento Térmico", active: "true" },
  { id: 2, factoryId: 2, name: "Produção", active: "true" },
  { id: 3, factoryId: 3, name: "Embalamento primário", active: "true" },
];
const dbUpdates: Record<string, unknown>[] = [];
const dbInserts: Record<string, unknown>[] = [];
let persistInsertedControlEntries = false;

function createContext(operatorProfile: TrpcContext["operatorProfile"] = { id: 3, name: "Joana Pina", title: "Resp. Qualidade", role: "manager" }): TrpcContext {
  return {
    user: { id: 1, openId: "quality-admin", name: "Ana", email: "ana@example.com", loginMethod: "manus", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now },
    operatorProfile,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function mockDatabase() {
  const sourceFor = (table: unknown) => {
    if (table === controlTasks) return tasks;
    if (table === controlEntries) return entries;
    if (table === nonconformities) return ncs;
    if (table === correctiveActions) return actions;
    if (table === factories) return factoryRows;
    if (table === areas) return areaRows;
    if (table === checklistAreas) return monthlyAreaRows;
    if (table === checklistItems) return monthlyRows;
    if (table === checklistItemAreas) return monthlyAreaAssignments;
    if (table === checklistItemFactories) return monthlyAssignments;
    if (table === dailyReportArchives) return archiveRows;
    if (table === dailyReportArchiveViews) return archiveViewRows;
    if (table === qualityPinProfiles) return profileRows;
    if (table === controlPlans) return plans;
    if (table === fragileItems) return fragile;
    if (table === fragileAreas) return fragileAreaRows;
    return [];
  };
  return {
    select: () => ({
      from: (table: unknown) => {
        const records = sourceFor(table);
        const filteredQuery = {
          limit: async () => records,
          orderBy: () => ({
            limit: async () => records,
            then: <T>(resolve: (value: unknown[]) => T | PromiseLike<T>) =>
              Promise.resolve(records).then(resolve),
          }),
          then: <T>(resolve: (value: unknown[]) => T | PromiseLike<T>) => Promise.resolve(records).then(resolve),
        };
        return {
          orderBy: async () => records,
          then: <T>(resolve: (value: unknown[]) => T | PromiseLike<T>) => Promise.resolve(records).then(resolve),
          where: () => filteredQuery,
        };
      },
    }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { dbUpdates.push(values); return { success: true }; } }) }),
    insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => { dbInserts.push(values); if (table === controlEntries && persistInsertedControlEntries) entries.push({ id: 10_000 + dbInserts.length, ...values } as any); return { $returningId: async () => [{ id: dbInserts.length }], success: true, onDuplicateKeyUpdate: async () => ({ success: true }) }; } }),
  };
}

describe("procedimentos de qualidade por fábrica", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); tasks.splice(0, tasks.length, ...initialTasks.map((task) => ({ ...task, assigneeProfileIds: [...task.assigneeProfileIds] }))); monthlyAreaRows.splice(0, monthlyAreaRows.length, { id: 201, name: "Geral", active: "true" }); monthlyRows.splice(0, monthlyRows.length, { id: 301, area: "Geral", active: "true" }, { id: 302, area: "Geral", active: "true" }); monthlyAreaAssignments.splice(0, monthlyAreaAssignments.length, { checklistItemId: 301, checklistAreaId: 201 }, { checklistItemId: 302, checklistAreaId: 201 }); plans.length = 0; archiveRows.length = 0; archiveViewRows.length = 0; dbUpdates.length = 0; dbInserts.length = 0; persistInsertedControlEntries = false; vi.clearAllMocks(); vi.mocked(getDb).mockResolvedValue(mockDatabase() as any); vi.mocked(storagePut).mockResolvedValue({ key: "dispatch-orders/3/encomenda.pdf", url: "/manus-storage/dispatch-orders/3/encomenda.pdf" }); vi.mocked(storageGetSignedUrl).mockResolvedValue("https://storage.example/encomenda.pdf"); });

  it("filtra o painel e as tarefas pela fábrica selecionada", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard({ factoryId: 1 });
    const filteredTasks = await caller.listTasks({ factoryId: 1 });
    expect(dashboard.tasks.map((task) => task.id)).toEqual([1, 2]);
    expect(dashboard.metrics).toMatchObject({ pending: 1, criticalOpen: 1, completedToday: 3, fragilePending: 0, dailyExecutionRate: 50 });
    expect(dashboard.plannedControls).toEqual([]);
    expect(dashboard.moduleProgress.bphf).toMatchObject({ expected: 0, completed: 0, pending: [], percentage: 0 });
    expect(dashboard.moduleProgress.metal_detectors).toMatchObject({ expected: 0, completed: 0, pending: [], percentage: 0 });
    expect(dashboard.moduleProgressByFactory.bphf).toEqual([{ factoryId: 1, expected: 0, completed: 0, registeredToday: 0, percentage: 0 }]);
    expect(dashboard.moduleProgressByFactory.metal_detectors).toEqual([{ factoryId: 1, expected: 0, completed: 0, registeredToday: 0, percentage: 0 }]);
    expect(filteredTasks.map((task) => task.id)).toEqual([1, 2]);
  });

  it("associa um registo de 00:32 em Lisboa à tarefa do novo dia, mesmo estando no dia UTC anterior", () => {
    const task = { id: 509, module: "bphf" as const, factoryId: 1, dueAt: new Date("2026-09-08T12:00:00.000Z") };
    const entry = { module: "bphf", factoryId: 1, completedAt: new Date("2026-09-07T23:32:39.000Z"), payload: {} };
    expect(entryMatchesPlannedTask(entry, task)).toBe(true);
  });

  it("não associa um registo eliminado à tarefa planeada para efeitos de completitude", () => {
    const task = {
      id: 501,
      module: "sensory" as const,
      factoryId: 1,
      dueAt: now,
    };
    const deletedEntry = {
      module: "sensory",
      factoryId: 1,
      completedAt: now,
      payload: {
        plannedTaskId: 501,
        recordLifecycle: { status: "deleted" },
      },
    };

    expect(entryMatchesPlannedTask(deletedEntry, task)).toBe(false);
  });

  it("mantém a completitude estável pela cobertura planeada em todos os tipos de controlo", () => {
    const slot = (type: string, ...parts: Array<string | number>) =>
      JSON.stringify([type, ...parts]);
    const cases = [
      {
        module: "bphf" as const,
        plannedCoverage: [slot("bphf", "Produção", "Fardamento")],
        entry: { area: "Produção", title: "Fardamento", payload: {} },
      },
      {
        module: "metal_detectors" as const,
        plannedCoverage: [slot("metal", "Linha 1")],
        entry: { area: "Linha 1", payload: {} },
      },
      {
        module: "temperature_controls" as const,
        plannedCoverage: [slot("temperature", "arca-1")],
        entry: { area: "Temperaturas", payload: { equipment: [{ id: "arca-1" }] } },
      },
      {
        module: "monthly_checklist" as const,
        plannedCoverage: [slot("monthly", 41, "Produção")],
        entry: { area: "Produção", payload: { checklistItemId: 41 } },
      },
      {
        module: "food_defense" as const,
        plannedCoverage: [slot("food_defense", "fd-1")],
        entry: { area: "Segurança geral", payload: { foodDefenseCriterionId: "fd-1" } },
      },
      {
        module: "fragile_items" as const,
        plannedCoverage: [slot("fragile", 71)],
        entry: { area: "Produção", payload: { fragileItemId: 71 } },
      },
      {
        module: "suggestion_boxes" as const,
        plannedCoverage: [slot("suggestion", "Caixa WC feminino")],
        entry: { area: "Caixa WC feminino", payload: {} },
      },
      {
        module: "sensory" as const,
        plannedCoverage: [slot("submission")],
        entry: { area: "Controlo sensorial", payload: {} },
      },
    ];

    cases.forEach((item, index) => {
      const task = {
        id: 700 + index,
        module: item.module,
        factoryId: 1,
        dueAt: now,
        plannedCoverage: item.plannedCoverage,
      };
      const entry = {
        id: 800 + index,
        module: item.module,
        factoryId: 1,
        completedAt: now,
        result: "C",
        title: "title" in item.entry ? item.entry.title : undefined,
        ...item.entry,
        payload: { ...item.entry.payload, plannedTaskId: task.id },
      };

      expect(
        isHistoricalPlanTaskSatisfied(task, [entry], [], [], [], [], [], [], [])
      ).toBe(true);
    });
  });

  it("devolve os controlos publicados para a data selecionada no painel Hoje", async () => {
    const plannedDate = new Date(2026, 7, 18, 10, 0, 0);
    tasks.push({ id: 88, factoryId: 2, status: "pending", dueAt: plannedDate, completedAt: null, module: "bphf", area: "Plano do Dia", title: "Plano do Dia — BPHF F2", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    const caller = qualityRouter.createCaller(createContext());

    const dashboard = await caller.dashboard({ date: plannedDate });

    expect(dashboard.operationalDate).toEqual(new Date(2026, 7, 18));
    expect(dashboard.plannedControls).toEqual([expect.objectContaining({ id: 88, factoryId: 2, module: "bphf" })]);
  });

  it("identifica as tarefas do Plano do Dia com o módulo para abrir o formulário de controlo", async () => {
    addPublishedControlTask("bphf", 1, [3]);
    const caller = qualityRouter.createCaller(createContext());

    const listedTasks = await caller.listTasks({ factoryId: 1 });

    expect(listedTasks).toEqual(expect.arrayContaining([expect.objectContaining({ area: "Plano do Dia", module: "bphf", qualityModule: "bphf", factoryId: 1 })]));
    expect(listedTasks).toEqual(expect.arrayContaining([expect.objectContaining({ area: "Produção T", qualityModule: null })]));
  });

  it("agrega a completitude canónica, as incidências e a atividade técnica no painel analítico", async () => {
    const originalEntryLength = entries.length;
    const originalNcLength = ncs.length;
    const originalAreaLength = areaRows.length;
    areaRows.push({ id: 102, name: "Produção", group: "bphf", factoryId: 1, active: "true" });
    tasks.push({
      id: 550,
      factoryId: 1,
      status: "pending",
      dueAt: now,
      completedAt: null,
      module: "bphf",
      area: "Plano do Dia",
      title: "Plano analítico BPHF F1",
      responsible: "Equipa atribuída",
      assigneeProfileIds: [1],
      bphfCriteria: ["Higienização das mãos dos manipuladores"],
    } as any);
    entries.push(
      {
        id: 551,
        factoryId: 1,
        module: "bphf",
        area: "Produção",
        title: "Higienização das mãos dos manipuladores",
        result: "C",
        completedAt: now,
        registeredByProfileId: 1,
        registeredByName: "Sabrina Esteves",
        registeredByTitle: "Tec. Qualidade",
        payload: { plannedTaskId: 550 },
      },
      {
        id: 552,
        factoryId: 1,
        module: "metal_detectors",
        area: "Tradicional 1",
        title: "Detetor de metais",
        result: "NC",
        completedAt: now,
        registeredByProfileId: 1,
        registeredByName: "Sabrina Esteves",
        registeredByTitle: "Tec. Qualidade",
        payload: { incidenceTreatment: { status: "in_progress" } },
      }
    );
    ncs.push({
      id: 553,
      sourceEntryId: 552,
      factoryId: 1,
      status: "closed",
      severity: "high",
      module: "metal_detectors",
      area: "Tradicional 1",
      title: "NC analítica",
      detectedAt: now,
    } as any);
    try {
      const caller = qualityRouter.createCaller(createContext());
      const analytics = await caller.operationalAnalytics({
        period: "day",
        referenceDate: now,
      });

      expect(analytics.completionByControl).toContainEqual(
        expect.objectContaining({ module: "bphf", completed: 3, conforming: 3 })
      );
      expect(analytics.completionByFactory).toContainEqual(
        expect.objectContaining({ factoryId: 1, completed: 2 })
      );
      expect(analytics.incidences.byTreatment).toContainEqual({
        status: "in_progress",
        total: 1,
      });
      expect(analytics.incidences.nonconformities.byStatus).toContainEqual({
        status: "closed",
        total: 2,
      });
      expect(analytics.activityByTechnician).toContainEqual(
        expect.objectContaining({
          profileId: 1,
          name: "Sabrina Esteves",
          total: 2,
          incidences: 1,
          generatedNonconformities: 1,
        })
      );
    } finally {
      tasks.splice(tasks.findIndex(task => task.id === 550), 1);
      entries.splice(originalEntryLength);
      ncs.splice(originalNcLength);
      areaRows.splice(originalAreaLength);
    }
  });

  it("não reabre na análise uma tarefa histórica persistida como concluída quando o catálogo atual mudou", async () => {
    const historicalDate = new Date(2026, 7, 30, 10, 0, 0);
    const historicalTask = {
      id: 590,
      factoryId: 1,
      status: "completed",
      dueAt: historicalDate,
      completedAt: historicalDate,
      module: "bphf",
      area: "Plano do Dia",
      title: "Plano histórico BPHF F1",
      responsible: "Equipa atribuída",
      assigneeProfileIds: [1],
      bphfCriteria: ["Higienização das mãos dos manipuladores"],
      plannedCoverage: ["bphf:area-antiga:criterion-antigo"],
    } as any;
    tasks.push(historicalTask);
    try {
      const caller = qualityRouter.createCaller(createContext());
      const analytics = await caller.operationalAnalytics({ period: "day", referenceDate: historicalDate });
      expect(analytics.completion).toMatchObject({ total: 1, completed: 1, pending: 0, rate: 100 });
    } finally {
      tasks.splice(tasks.findIndex(task => task.id === historicalTask.id), 1);
    }
  });

  it("aceita um intervalo inclusivo personalizado no painel analítico", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const analytics = await caller.operationalAnalytics({
      period: "custom",
      referenceDate: now,
      startDate: new Date(2026, 7, 14, 12, 0, 0),
      endDate: new Date(2026, 7, 14, 12, 0, 0),
    });

    expect(analytics.periodStart).toEqual(new Date("2026-08-13T23:00:00.000Z"));
    expect(analytics.periodEnd).toEqual(new Date("2026-08-14T23:00:00.000Z"));
  });

  it("calcula agosto como um mês completo de Lisboa sem perder o último dia", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const analytics = await caller.operationalAnalytics({ period: "month", referenceDate: new Date("2026-08-14T12:00:00.000Z") });
    expect(analytics.periodStart).toEqual(new Date("2026-07-31T23:00:00.000Z"));
    expect(analytics.periodEnd).toEqual(new Date("2026-08-31T23:00:00.000Z"));
    expect(analytics.activityTrend).toHaveLength(31);
  });

  it("mantém visível um registo BPHF N/A sem colaborador para concluir a área respetiva", async () => {
    const entryId = 740;
    entries.push({
      id: entryId,
      factoryId: 1,
      module: "bphf",
      area: "Limpeza",
      title: "Higienização das mãos dos manipuladores",
      result: "N/A",
      completedAt: now,
      payload: {
        criterion: "Higienização das mãos dos manipuladores",
        plannedTaskId: 750029,
        collaboratorName: "Não aplicável",
      },
    } as any);
    try {
      const caller = qualityRouter.createCaller(createContext());
      const inspections = await caller.listBphfCollaboratorInspections({
        factoryId: 1,
        operationalDate: now,
        plannedTaskId: 750029,
      });

      expect(inspections).toContainEqual(
        expect.objectContaining({
          id: entryId,
          area: "Limpeza",
          criterion: "Higienização das mãos dos manipuladores",
          result: "N/A",
          collaboratorId: null,
          collaboratorName: "Não aplicável",
        })
      );
    } finally {
      entries.splice(entries.findIndex(entry => entry.id === entryId), 1);
    }
  });

  it("autoriza Food Defense apenas na fábrica incluída na avaliação anual da técnica", async () => {
    addPublishedControlTask("food_defense", 1, [1]);
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    const access = await caller.controlAuthorization({ module: "food_defense", factoryId: 1 });
    const outsideScope = await caller.controlAuthorization({ module: "food_defense", factoryId: 3 });

    expect(access).toMatchObject({ allowed: true, taskId: expect.any(Number) });
    expect(outsideScope).toMatchObject({ allowed: false, taskId: null });
  });

  it("permite ao perfil Gestão consultar, mas bloqueia operações de alteração", async () => {
    const caller = qualityRouter.createCaller(createContext({ id: 9, name: "Gestão", title: "Consulta", role: "viewer" }));

    await caller.metadata();
    await expect(caller.addBphfInspectionEmployee({ name: "Colaborador bloqueado" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.generateMissingDailyReportArchiveBackups()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.createManualDailyReportArchive({ operationalDate: "2026-08-14" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("permite à Responsável guardar manualmente o arquivo diário solicitado nos Relatórios", async () => {
    const caller = qualityRouter.createCaller(createContext());

    const result = await caller.createManualDailyReportArchive({ operationalDate: "2026-08-14" });

    expect(result).toMatchObject({ created: true, revision: 1 });
    expect(dbInserts).toEqual(expect.arrayContaining([
      expect.objectContaining({ archiveKind: "initial", createdBy: "Arquivo manual por Joana Pina" }),
    ]));
  });

  it("permite à Responsável iniciar manualmente a geração quando não há arquivos pendentes", async () => {
    const caller = qualityRouter.createCaller(createContext());

    await expect(caller.generateMissingDailyReportArchiveBackups()).resolves.toEqual({ requested: 0, generated: 0, alreadyPresent: 0 });
  });

  it("gera manualmente cada backup pendente e não duplica os que já existem", async () => {
    archiveRows.push({ id: 901, operationalDate: now, revision: 1, archiveKind: "initial", snapshot: { plannedTasks: [], controlEntries: [], incidences: [], dailyNotes: [] }, backupFileKey: null, backupFileUrl: null, backupGeneratedAt: null, backupSizeBytes: null, createdBy: "Arquivo automático", createdAt: now });
    const caller = qualityRouter.createCaller(createContext());

    await expect(caller.generateMissingDailyReportArchiveBackups()).resolves.toEqual({ requested: 1, generated: 1, alreadyPresent: 0 });
    expect(storagePut).toHaveBeenCalledWith(expect.stringContaining("qualicontrol/backups-diarios/"), expect.anything(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(dbUpdates).toEqual(expect.arrayContaining([expect.objectContaining({ backupFileKey: "dispatch-orders/3/encomenda.pdf" })]));
  });

  it("associa o progresso de uma pendência à tarefa e à data prevista original", async () => {
    const previousDate = new Date(2026, 7, 13, 10, 0, 0);
    tasks.push({ id: 501, factoryId: 1, status: "pending", dueAt: previousDate, completedAt: null, module: "bphf", area: "Plano do Dia", title: "Plano do Dia — BPHF F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    const dashboard = await caller.dashboard({ date: previousDate });
    const access = await caller.controlAuthorization({ module: "bphf", factoryId: 1, plannedTaskId: 501 });

    expect(dashboard.moduleProgressByFactory.bphf[0]).toMatchObject({ factoryId: 1, pendingTaskId: 501 });
    expect(access).toMatchObject({ allowed: true, taskId: 501, dueAt: previousDate, isPreviousPending: true });
  });

  it("mostra progresso Food Defense apenas nas fábricas incluídas no Plano do Dia", async () => {
    addPublishedControlTask("food_defense", 1, [1]);
    addPublishedControlTask("food_defense", 3, [1]);
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard();

    expect(dashboard.moduleProgressByFactory.food_defense).toEqual([
      expect.objectContaining({ factoryId: 1, expected: 131, completed: 0, registeredToday: 0, percentage: 0, pendingTaskId: expect.any(Number) }),
      { factoryId: 2, expected: 0, completed: 0, registeredToday: 0, percentage: 0 },
      expect.objectContaining({ factoryId: 3, expected: 131, completed: 0, registeredToday: 0, percentage: 0, pendingTaskId: expect.any(Number) }),
    ]);
  });

  it("publica Controlos de Temperatura para F1 e F2 sem bloquear um Plano do Dia que também inclua F3", async () => {
    const caller = qualityRouter.createCaller(createContext());

    const result = await caller.publishDailyPlan({ date: now, factoryIds: [1, 2, 3], assigneeProfileIds: [1, 2, 3], modules: ["temperature_controls"] });

    expect(result).toMatchObject({ success: true, created: 2 });
    expect(dbInserts[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: "temperature_controls", factoryId: 1, area: "Plano do Dia", assigneeProfileIds: [1, 2, 3] }),
      expect.objectContaining({ module: "temperature_controls", factoryId: 2, area: "Plano do Dia", assigneeProfileIds: [1, 2, 3] }),
    ]));
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("guarda no Plano do Dia apenas as inspeções BPHF selecionadas", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const planDate = new Date(2026, 7, 19, 10, 0, 0);
    const selectedCriterion = "Higienização das mãos dos manipuladores";

    await caller.publishDailyPlan({
      date: planDate,
      factoryIds: [1],
      assigneeProfileIds: [1, 2, 3],
      modules: ["bphf"],
      bphfCriteria: [selectedCriterion],
    });

    expect(dbInserts.at(-1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: "bphf",
          factoryId: 1,
          bphfCriteria: [selectedCriterion],
        }),
      ])
    );
  });

  it("cria uma adenda de Cacifos quando é publicado BPHF para um plano já existente", async () => {
    const originalPlan = {
      id: 890,
      factoryId: 1,
      status: "completed",
      dueAt: now,
      completedAt: now,
      module: "bphf",
      area: "Plano do Dia",
      title: "Plano do Dia — BPHF F1",
      responsible: "Sabrina Esteves",
      assigneeProfileIds: [1, 2, 3],
      bphfCriteria: [
        "Estado de limpeza e conservação do fardamento",
        "Higienização das mãos dos manipuladores",
        "Cumprimento geral das regras de BPHF",
      ],
      plannedCoverage: [],
      planRevision: 1,
      createdAt: now,
    } as any;
    tasks.push(originalPlan);
    try {
      const result = await qualityRouter.createCaller(createContext()).publishDailyPlan({
        date: now,
        factoryIds: [1],
        assigneeProfileIds: [1, 2, 3],
        modules: ["bphf"],
        bphfCriteria: ["Estado de limpeza e organização dos cacifos do pessoal e de trabalho"],
      });

      expect(result).toMatchObject({ success: true, created: 1, addendaCreated: 1, alreadyPresent: 1 });
      expect(dbInserts.at(-1)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          module: "bphf",
          area: "Plano do Dia",
          parentTaskId: originalPlan.id,
          planRevision: 2,
          bphfCriteria: ["Estado de limpeza e organização dos cacifos do pessoal e de trabalho"],
          status: "pending",
        }),
      ]));
    } finally {
      tasks.splice(tasks.findIndex(task => task.id === originalPlan.id), 1);
    }
  });

  it("guarda no Plano do Dia apenas as linhas de Detetores selecionadas por fábrica", async () => {
    const metalAreas = [
      { id: 901, name: "Linha 1", group: "metal", factoryId: 1, active: "true" },
      { id: 902, name: "Linha 2", group: "metal", factoryId: 1, active: "true" },
      { id: 903, name: "Linha granel", group: "metal", factoryId: 2, active: "true" },
      { id: 904, name: "Linha de embalagem", group: "metal", factoryId: 2, active: "true" },
    ];
    areaRows.push(...metalAreas as any);
    try {
      const caller = qualityRouter.createCaller(createContext());
      await caller.publishDailyPlan({
        date: new Date(2026, 7, 20, 10, 0, 0),
        factoryIds: [1, 2],
        assigneeProfileIds: [1, 2, 3],
        modules: ["metal_detectors"],
        metalDetectorLinesByFactory: {
          "1": ["Linha 1"],
          "2": ["Linha granel"],
        },
      });

      expect(dbInserts.at(-1)).toEqual(expect.arrayContaining([
        expect.objectContaining({ module: "metal_detectors", factoryId: 1, metalDetectorLines: ["Linha 1"] }),
        expect.objectContaining({ module: "metal_detectors", factoryId: 2, metalDetectorLines: ["Linha granel"] }),
      ]));
    } finally {
      areaRows.splice(-metalAreas.length, metalAreas.length);
    }
  });

  it("considera concluído o BPHF quando todos os critérios selecionados no Plano foram preenchidos", async () => {
    const plannedTaskId = 519;
    const selectedCriterion = "Higienização das mãos dos manipuladores";
    tasks.push({ id: plannedTaskId, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "bphf", area: "Plano do Dia", title: "Plano do Dia — BPHF F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1], bphfCriteria: [selectedCriterion] } as any);
    entries.push(...["Produção", "Embalagem", "Limpeza"].map((area, index) => ({ id: 519 + index, factoryId: 1, module: "bphf", area, title: selectedCriterion, result: "C", completedAt: now, payload: { plannedTaskId, plannedDate: now.toISOString() } } as any)));
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const dashboard = await caller.dashboard({ date: now });

      expect(dashboard.moduleProgressByFactory.bphf[0]).toMatchObject({ factoryId: 1, expected: 3, completed: 3, percentage: 100 });
    } finally {
      entries.splice(-3, 3);
      tasks.pop();
    }
  });

  it("publica o mesmo Plano do Dia em várias datas úteis e devolve o resumo por data", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const nextDate = new Date(now);
    nextDate.setDate(nextDate.getDate() + 3);

    const result = await caller.publishDailyPlan({ dates: [now, nextDate], factoryIds: [1], assigneeProfileIds: [1, 2, 3], modules: ["internal_analysis"] });

    expect(result).toMatchObject({ success: true, created: 2, alreadyPresent: 0, dates: [
      { date: now.toISOString().slice(0, 10), created: 1, alreadyPresent: 0 },
      { date: nextDate.toISOString().slice(0, 10), created: 1, alreadyPresent: 0 },
    ] });
    expect(dbInserts.at(-1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: "internal_analysis", factoryId: null, dueAt: now }),
      expect.objectContaining({ module: "internal_analysis", factoryId: null, dueAt: nextDate }),
    ]));
  });

  it("mantém o BPHF do dia acessível para verificações adicionais depois de cumprir o mínimo", async () => {
    tasks.push({ id: 513, factoryId: 1, status: "completed", dueAt: now, completedAt: now, module: "bphf", area: "Plano do Dia", title: "Plano do Dia — BPHF F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const authorization = await caller.controlAuthorization({ module: "bphf", factoryId: 1, plannedTaskId: 513 });

      expect(authorization).toMatchObject({ allowed: true, taskId: 513 });
    } finally {
      tasks.pop();
    }
  });

  it("não mantém Temperaturas como pendência retroativa quando a data operacional já está completa", async () => {
    const previousDate = new Date(2026, 7, 13, 10, 0, 0);
    tasks.push({ id: 510, factoryId: 1, status: "pending", dueAt: previousDate, completedAt: null, module: "temperature_controls", area: "Plano do Dia", title: "Plano do Dia — Temperaturas F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    entries.push({ id: 510, factoryId: 1, module: "temperature_controls", area: "Área da Qualidade", result: "C", completedAt: now, payload: { plannedTaskId: 510, plannedDate: previousDate.toISOString(), equipment: [{ id: "f1-freezer-1" }, { id: "f1-freezer-2" }] } } as any);
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const dashboard = await caller.dashboard({ date: previousDate });
      const listedTasks = await caller.listTasks();
      const access = await caller.controlAuthorization({ module: "temperature_controls", factoryId: 1, plannedTaskId: 510 });

      expect(dashboard.moduleProgressByFactory.temperature_controls[0]).toMatchObject({ factoryId: 1, expected: 2, completed: 2, percentage: 100 });
      expect(dashboard.moduleProgressByFactory.temperature_controls[0]).not.toHaveProperty("pendingTaskId");
      expect(dashboard.moduleProgress.temperature_controls.pending).toEqual([]);
      expect(listedTasks.map((task) => task.id)).not.toContain(510);
      expect(access).toMatchObject({ allowed: false, isPreviousPending: false });
    } finally {
      entries.pop();
    }
  });

  it("reconcilia no dashboard uma tarefa concluída por registo associado mesmo sem data planeada no payload legado", async () => {
    const previousDate = new Date(2026, 7, 12, 10, 0, 0);
    const plannedTaskId = 530;
    tasks.push({ id: plannedTaskId, factoryId: 1, status: "pending", dueAt: previousDate, completedAt: null, module: "temperature_controls", area: "Plano do Dia", title: "Plano do Dia — Temperaturas F1 legado", responsible: "Sabrina Esteves", assigneeProfileIds: [1], temperatureEquipmentIds: ["f1-freezer-1", "f1-freezer-2"] });
    entries.push({ id: plannedTaskId, factoryId: 1, module: "temperature_controls", area: "Área da Qualidade", result: "C", completedAt: now, payload: { plannedTaskId, equipment: [{ id: "f1-freezer-1" }, { id: "f1-freezer-2" }] } } as any);
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const dashboard = await caller.dashboard({ date: previousDate });
      const plannedControl = dashboard.plannedControls.find(item => item.id === plannedTaskId);
      const listedTasks = await caller.listTasks({ factoryId: 1 });

      expect(plannedControl).toMatchObject({ id: plannedTaskId, completed: true, missingVerificationCount: 0 });
      expect(listedTasks.map(task => task.id)).not.toContain(plannedTaskId);
    } finally {
      entries.splice(entries.findIndex(entry => entry.id === plannedTaskId), 1);
      tasks.splice(tasks.findIndex(task => task.id === plannedTaskId), 1);
    }
  });

  it("mantém a tarefa F2 de Temperaturas pendente quando falta um equipamento previsto, mesmo com estado técnico concluído", async () => {
    const plannedTaskId = 511;
    tasks.push({ id: plannedTaskId, factoryId: 2, status: "completed", dueAt: now, completedAt: now, module: "temperature_controls", area: "Plano do Dia", title: "Plano do Dia — Temperaturas F2", responsible: "Sabrina Esteves", assigneeProfileIds: [1], temperatureEquipmentIds: ["f2-cold-room", "f2-dispatch-freezer"] });
    entries.push({ id: 511, factoryId: 2, module: "temperature_controls", area: "Câmara de Frio", result: "C", completedAt: now, payload: { plannedTaskId, plannedDate: now.toISOString(), equipment: [{ id: "f2-cold-room" }] } } as any);
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const dashboard = await caller.dashboard({ date: now });
      const listedTasks = await caller.listTasks({ factoryId: 2 });
      const access = await caller.controlAuthorization({ module: "temperature_controls", factoryId: 2, plannedTaskId });
      const progress = dashboard.moduleProgressByFactory.temperature_controls.find(item => item.factoryId === 2);
      const plannedControl = dashboard.plannedControls.find(item => item.id === plannedTaskId);

      expect(progress).toMatchObject({ expected: 2, completed: 1, percentage: 50, pendingTaskId: plannedTaskId });
      expect(dashboard.moduleProgress.temperature_controls.pending).toContain("Plano do Dia — Temperaturas F2");
      expect(dashboard.metrics).toMatchObject({ pending: expect.any(Number) });
      expect(dashboard.metrics.pending).toBeGreaterThan(0);
      expect(plannedControl).toMatchObject({ missingVerificationCount: 1, missingVerifications: ["Arca de Congelação expedição"] });
      expect(listedTasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: plannedTaskId, status: "pending" })]));
      expect(access).toMatchObject({ allowed: true, taskId: plannedTaskId });
    } finally {
      entries.splice(entries.findIndex(entry => entry.id === 511), 1);
      tasks.splice(tasks.findIndex(task => task.id === plannedTaskId), 1);
    }
  });

  it("mantém Temperaturas do dia acessíveis para registos adicionais depois da verificação mínima", async () => {
    tasks.push({ id: 512, factoryId: 1, status: "completed", dueAt: now, completedAt: now, module: "temperature_controls", area: "Plano do Dia", title: "Plano do Dia — Temperaturas F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const authorization = await caller.controlAuthorization({ module: "temperature_controls", factoryId: 1, plannedTaskId: 512 });

      expect(authorization).toMatchObject({ allowed: true, taskId: 512 });
    } finally {
      tasks.pop();
    }
  });

  it("remove Quebráveis preenchidos das pendências, da autorização e do painel Hoje na data original", async () => {
    const previousDate = new Date(2026, 7, 13, 10, 0, 0);
    const plannedTaskId = 520;
    tasks.push({ id: plannedTaskId, factoryId: 1, status: "pending", dueAt: previousDate, completedAt: null, module: "fragile_items", area: "Plano do Dia", title: "Plano do Dia — Quebráveis F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    entries.push({ id: plannedTaskId, factoryId: 1, module: "fragile_items", area: "Zona Tratamento Térmico", result: "C", completedAt: now, payload: { plannedTaskId, plannedDate: previousDate.toISOString(), fragileItemId: 1 } } as any);
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const dashboard = await caller.dashboard({ date: previousDate });
      const listedTasks = await caller.listTasks({ factoryId: 1 });
      const pendingTasks = await caller.pendingControlTasks({ module: "fragile_items", factoryId: 1 });
      const authorization = await caller.controlAuthorization({ module: "fragile_items", factoryId: 1, plannedTaskId });

      expect(dashboard.plannedControls).toEqual(expect.arrayContaining([expect.objectContaining({ id: plannedTaskId, completed: true })]));
      expect(dashboard.moduleProgressByFactory.fragile_items[0]).toMatchObject({ factoryId: 1, expected: 1, completed: 1, percentage: 100 });
      expect(listedTasks.map((task) => task.id)).not.toContain(plannedTaskId);
      expect(pendingTasks.map((task) => task.id)).not.toContain(plannedTaskId);
      expect(authorization).toMatchObject({ allowed: false, isPreviousPending: false });
    } finally {
      entries.pop();
      tasks.pop();
    }
  });

  it("não apresenta uma tarefa cancelada como pendência, mesmo quando foi atribuída a vários técnicos", async () => {
    const previousDate = new Date(2026, 7, 13, 10, 0, 0);
    const cancelledTaskId = 521;
    tasks.push({
      id: cancelledTaskId,
      factoryId: 1,
      status: "cancelled",
      dueAt: previousDate,
      completedAt: null,
      module: "bphf",
      area: "Plano do Dia",
      title: "Plano do Dia — BPHF F1 cancelado",
      responsible: "Sabrina Esteves, Neuza Antunes",
      assigneeProfileIds: [1, 2],
    });
    try {
      const sabrina = qualityRouter.createCaller(
        createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" })
      );
      const neuza = qualityRouter.createCaller(
        createContext({ id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" })
      );

      const [sabrinaPending, neuzaPending, listedTasks] = await Promise.all([
        sabrina.pendingControlTasks({ module: "bphf", factoryId: 1 }),
        neuza.pendingControlTasks({ module: "bphf", factoryId: 1 }),
        sabrina.listTasks({ factoryId: 1 }),
      ]);

      expect(sabrinaPending.map(task => task.id)).not.toContain(cancelledTaskId);
      expect(neuzaPending.map(task => task.id)).not.toContain(cancelledTaskId);
      expect(listedTasks.map(task => task.id)).not.toContain(cancelledTaskId);
    } finally {
      tasks.pop();
    }
  });

  it("mantém o Controlo sensorial do dia acessível para validar produtos adicionais", async () => {
    tasks.push({ id: 514, factoryId: 1, status: "completed", dueAt: now, completedAt: now, module: "sensory", area: "Plano do Dia", title: "Plano do Dia — Controlo sensorial F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const authorization = await caller.controlAuthorization({ module: "sensory", factoryId: 1, plannedTaskId: 514 });

      expect(authorization).toMatchObject({ allowed: true, taskId: 514, isPreviousPending: false });
    } finally {
      tasks.pop();
    }
  });

  it("mantém as Análises internas do dia acessíveis para validar outra análise após a primeira", async () => {
    tasks.push({ id: 517, factoryId: null, status: "completed", dueAt: now, completedAt: now, module: "internal_analysis", area: "Plano do Dia", title: "Plano do Dia — Análises internas", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      await expect(caller.controlAuthorization({ module: "internal_analysis", plannedTaskId: 517 })).resolves.toMatchObject({ allowed: true, taskId: 517, isPreviousPending: false });
      await expect(caller.createEntry({ module: "internal_analysis", title: "Teste rápido mostarda", area: "Mostarda", result: "C", plannedTaskId: 517, payload: { category: "Mostarda", test: "Teste rápido mostarda", tests: ["Teste rápido mostarda"], analyses: [{ category: "Mostarda", test: "Teste rápido mostarda" }], samples: [{ product: "Produto 2", client: "Cliente", lot: "L-2", result: "negative", controlResult: "C" }] }, createNonconformity: false, severity: "medium" })).resolves.toMatchObject({ success: true });
      expect(dbInserts).toEqual(expect.arrayContaining([expect.objectContaining({ module: "internal_analysis", title: "Teste rápido mostarda", factoryId: null })]));
    } finally {
      tasks.pop();
    }
  });

  it("aceita submeter outro produto sensorial depois de o primeiro ter concluído a tarefa", async () => {
    tasks.push({ id: 515, factoryId: 1, status: "completed", dueAt: now, completedAt: now, module: "sensory", area: "Plano do Dia", title: "Plano do Dia — Controlo sensorial F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const result = await caller.createEntry({ module: "sensory", title: "Controlo sensorial — Produto 2", area: "Controlo sensorial", factoryId: 1, result: "C", payload: { product: "Produto 2", lot: "L2", validity: "2026-09-01" }, createNonconformity: false, severity: "medium" });

      expect(result).toMatchObject({ success: true });
      expect(dbInserts).toEqual(expect.arrayContaining([expect.objectContaining({ module: "sensory", title: "Controlo sensorial — Produto 2", factoryId: 1 })]));
      expect(dbUpdates).toEqual(expect.arrayContaining([expect.objectContaining({ status: "completed", completedByProfileId: 1 })]));
    } finally {
      tasks.pop();
    }
  });

  it("mantém os Detetores de Metais do dia acessíveis para registar produtos adicionais depois do mínimo", async () => {
    tasks.push({ id: 518, factoryId: 2, status: "completed", dueAt: now, completedAt: now, module: "metal_detectors", area: "Plano do Dia", title: "Plano do Dia — Detetores de metais F2", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      await expect(caller.controlAuthorization({ module: "metal_detectors", factoryId: 2, plannedTaskId: 518 })).resolves.toMatchObject({ allowed: true, taskId: 518, isPreviousPending: false });
      await expect(caller.createEntry({ module: "metal_detectors", title: "Detetor de metais — Linha principal · Produto adicional", area: "Linha principal", factoryId: 2, result: "C", plannedTaskId: 518, payload: { product: "Produto adicional", lot: "L-2", productValidation: "C" }, createNonconformity: false, severity: "critical" })).resolves.toMatchObject({ success: true });
    } finally {
      tasks.pop();
    }
  });

  it("mantém as Caixas de Sugestões incompletas quando só uma localização foi verificada", async () => {
    tasks.push({ id: 516, factoryId: 1, status: "completed", dueAt: now, completedAt: now, module: "suggestion_boxes", area: "Plano do Dia", title: "Plano do Dia — Caixas F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    entries.push({ id: 516, factoryId: 1, module: "suggestion_boxes", area: "Caixa WC feminino", result: "C", completedAt: now, payload: { plannedTaskId: 516, plannedDate: now.toISOString(), location: "Caixa WC feminino" } } as any);
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const dashboard = await caller.dashboard({ date: now });
      const access = await caller.controlAuthorization({ module: "suggestion_boxes", factoryId: 1, plannedTaskId: 516 });

      expect(dashboard.moduleProgressByFactory.suggestion_boxes[0]).toMatchObject({ factoryId: 1, expected: 3, completed: 1, percentage: 33.3 });
      expect(dashboard.moduleProgress.suggestion_boxes).toMatchObject({ expected: 3, completed: 1, percentage: 33.3 });
      expect(dashboard.moduleProgress.suggestion_boxes.pending).toContain("Plano do Dia — Caixas F1");
      expect(access).toMatchObject({ allowed: true, taskId: 516 });
    } finally {
      entries.pop();
      tasks.pop();
    }
  });

  it("não mantém Detetores de Metais como pendência quando todas as linhas planeadas foram verificadas", async () => {
    const previousDate = new Date(2026, 7, 13, 10, 0, 0);
    tasks.push({ id: 511, factoryId: 1, status: "pending", dueAt: previousDate, completedAt: null, module: "metal_detectors", area: "Plano do Dia", title: "Plano do Dia — Detetores F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    areaRows.push({ id: 201, name: "Linha 1", group: "metal", factoryId: 1, active: "true" } as any, { id: 202, name: "Linha 2", group: "metal", factoryId: 1, active: "true" } as any, { id: 203, name: "Linha Croutons", group: "metal", factoryId: 1, active: "true" } as any);
    entries.push(...["Linha 1", "Linha 2", "Linha Croutons"].map((area, index) => ({ id: 511 + index, factoryId: 1, module: "metal_detectors", area, result: "C", completedAt: now, payload: { plannedTaskId: 511, plannedDate: previousDate.toISOString() } } as any)));
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const dashboard = await caller.dashboard({ date: previousDate });
      const listedTasks = await caller.listTasks();
      const access = await caller.controlAuthorization({ module: "metal_detectors", factoryId: 1, plannedTaskId: 511 });

      expect(dashboard.moduleProgressByFactory.metal_detectors[0]).toMatchObject({ factoryId: 1, expected: 3, completed: 3, percentage: 100 });
      expect(dashboard.moduleProgressByFactory.metal_detectors[0]).not.toHaveProperty("pendingTaskId");
      expect(dashboard.moduleProgress.metal_detectors.pending).toEqual([]);
      expect(listedTasks.map((task) => task.id)).not.toContain(511);
      expect(access).toMatchObject({ allowed: false, isPreviousPending: false });
    } finally {
      entries.splice(-3, 3);
      areaRows.splice(-3, 3);
    }
  });

  it("fecha a tarefa de Detetores quando a única linha selecionada no Plano fica verificada", async () => {
    const plannedTaskId = 519;
    tasks.push({ id: plannedTaskId, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "metal_detectors", area: "Plano do Dia", title: "Plano do Dia — Detetores F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1], metalDetectorLines: ["Linha 1"] });
    areaRows.push({ id: 204, name: "Linha 1", group: "metal", factoryId: 1, active: "true" } as any, { id: 205, name: "Linha 2", group: "metal", factoryId: 1, active: "true" } as any);
    persistInsertedControlEntries = true;
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      await expect(caller.createEntry({ module: "metal_detectors", title: "Detetor de metais — Linha 1 · Produto adicional", area: "Linha 1", factoryId: 1, result: "C", plannedTaskId, payload: { product: "Produto adicional", lot: "L-1", productValidation: "C" }, createNonconformity: false, severity: "critical" })).resolves.toMatchObject({ success: true });

      expect(dbUpdates).toEqual(expect.arrayContaining([expect.objectContaining({ status: "completed", completedByProfileId: 1 })]));
    } finally {
      persistInsertedControlEntries = false;
      entries.splice(-1, 1);
      areaRows.splice(-2, 2);
      tasks.pop();
    }
  });

  it("não mantém Checklist Mensal como pendência quando todos os itens aplicáveis foram registados", async () => {
    const previousDate = new Date(2026, 7, 13, 10, 0, 0);
    tasks.push({ id: 512, factoryId: 1, status: "pending", dueAt: previousDate, completedAt: null, module: "monthly_checklist", area: "Plano do Dia", title: "Plano do Dia — Checklist F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    entries.push({ id: 512, factoryId: 1, module: "monthly_checklist", area: "Geral", result: "C", completedAt: now, payload: { plannedTaskId: 512, plannedDate: previousDate.toISOString(), checklistItemId: 301 } } as any, { id: 513, factoryId: 1, module: "monthly_checklist", area: "Geral", result: "C", completedAt: now, payload: { plannedTaskId: 512, plannedDate: previousDate.toISOString(), checklistItemId: 302 } } as any);
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const dashboard = await caller.dashboard({ date: previousDate });
      const listedTasks = await caller.listTasks();
      const access = await caller.controlAuthorization({ module: "monthly_checklist", factoryId: 1, plannedTaskId: 512 });

      expect(dashboard.moduleProgressByFactory.monthly_checklist[0]).toMatchObject({ factoryId: 1, expected: 2, completed: 2, percentage: 100 });
      expect(dashboard.moduleProgressByFactory.monthly_checklist[0]).not.toHaveProperty("pendingTaskId");
      expect(dashboard.moduleProgress.monthly_checklist.pending).toEqual([]);
      expect(listedTasks.map((task) => task.id)).not.toContain(512);
      expect(access).toMatchObject({ allowed: false, isPreviousPending: false });
    } finally {
      entries.splice(-2, 2);
    }
  });

  it("mantém a Checklist Mensal pendente até todas as Áreas/Zonas de cada ponto serem preenchidas", async () => {
    const previousDate = new Date(2026, 7, 13, 10, 0, 0);
    const plannedTaskId = 520;
    tasks.push({ id: plannedTaskId, factoryId: 1, status: "pending", dueAt: previousDate, completedAt: null, module: "monthly_checklist", area: "Plano do Dia", title: "Plano do Dia — Checklist F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    monthlyAreaRows.push({ id: 202, name: "Embalamento", active: "true" });
    monthlyAreaAssignments.push({ checklistItemId: 301, checklistAreaId: 202 });
    entries.push(
      { id: 520, factoryId: 1, module: "monthly_checklist", area: "Geral", result: "C", completedAt: now, payload: { plannedTaskId, plannedDate: previousDate.toISOString(), checklistItemId: 301 } } as any,
      { id: 521, factoryId: 1, module: "monthly_checklist", area: "Geral", result: "C", completedAt: now, payload: { plannedTaskId, plannedDate: previousDate.toISOString(), checklistItemId: 302 } } as any
    );
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      const dashboard = await caller.dashboard({ date: previousDate });
      const listedTasks = await caller.listTasks();
      const access = await caller.controlAuthorization({ module: "monthly_checklist", factoryId: 1, plannedTaskId });
      const pendingControls = await caller.pendingControlTasks({ module: "monthly_checklist", factoryId: 1 });

      expect(dashboard.moduleProgressByFactory.monthly_checklist[0]).toMatchObject({ factoryId: 1, expected: 3, completed: 2, percentage: 66.7, pendingTaskId: plannedTaskId });
      expect(listedTasks.map(task => task.id)).toContain(plannedTaskId);
      expect(access).toMatchObject({ allowed: true, taskId: plannedTaskId, isPreviousPending: true });
      expect(pendingControls.map(task => task.id)).toContain(plannedTaskId);
    } finally {
      entries.splice(-2, 2);
      monthlyAreaAssignments.pop();
      monthlyAreaRows.pop();
      tasks.pop();
    }
  });

  it("identifica para cada perfil as revisões retroativas que ainda não abriu", async () => {
    const previousDate = new Date(2026, 7, 13, 10, 0, 0);
    archiveRows.push({ id: 701, operationalDate: previousDate, revision: 2, archiveKind: "retroactive_revision", revisionReason: "Registo retroativo concluído.", createdBy: "Sabrina Esteves", createdAt: now, snapshot: {} }, { id: 702, operationalDate: previousDate, revision: 1, archiveKind: "initial", revisionReason: null, createdBy: "Sistema", createdAt: now, snapshot: {} });
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    const attention = await caller.dailyReportArchiveAttention();
    const marked = await caller.markDailyReportArchiveViewed({ archiveId: 701 });

    expect(attention).toMatchObject({ count: 1, revisions: [expect.objectContaining({ id: 701, revision: 2 })] });
    expect(marked).toEqual({ success: true, tracked: true });
    expect(dbInserts.at(-1)).toMatchObject({ archiveId: 701, profileId: 1 });
  });

  it("filtra os resultados de Temperaturas por período e equipamento", async () => {
    entries.push({ id: 77, factoryId: 1, module: "temperature_controls", area: "Área da Qualidade", result: "NC", completedAt: now, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade", payload: { equipment: [{ id: "f1-freezer-1", name: "Equipamento de congelação 1", area: "Área da Qualidade", limit: -18, temperature: -16, result: "NC", notes: "Ajuste solicitado" }, { id: "f1-freezer-2", name: "Equipamento de congelação 2", area: "Área da Qualidade", limit: -18, temperature: -19, result: "C", notes: "" }] } } as any);
    const caller = qualityRouter.createCaller(createContext());

    const results = await caller.temperatureHistory({ startDate: now, endDate: now, equipmentId: "f1-freezer-1" });

    expect(results).toEqual([expect.objectContaining({ equipmentId: "f1-freezer-1", temperature: -16, result: "NC", notes: "Ajuste solicitado", completedAt: now, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" })]);
    entries.pop();
  });

  it("consulta as observações de uma fábrica sem exigir a conclusão global do módulo", async () => {
    const originalNotes = entries[0]!.notes;
    entries[0]!.notes = "Registo concluído, com acompanhamento parcial noutra fábrica.";
    const caller = qualityRouter.createCaller(createContext());

    const observations = await caller.controlObservations({ module: "bphf", factoryId: 1 });

    expect(observations.entries).toHaveLength(1);
    expect(observations.entries[0]).toMatchObject({ area: "Produção T", notes: "Registo concluído, com acompanhamento parcial noutra fábrica." });
    entries[0]!.notes = originalNotes;
  });

  it("permite consultar a operação com um perfil PIN mesmo sem conta Manus", async () => {
    const pinOnlyContext = { ...createContext(), user: null, operatorProfile: { id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" as const } };
    const caller = qualityRouter.createCaller(pinOnlyContext);

    await expect(caller.metadata()).resolves.toMatchObject({ factories: factoryRows });
    await expect(caller.dashboard({ factoryId: 1 })).resolves.toMatchObject({ metrics: { dailyExecutionRate: 50 } });
  });

  it("não cria obrigações automáticas a partir do catálogo de planos", async () => {
    plans.push({ id: 1, title: "BPHF diário", module: "bphf", areaId: 101, factoryId: 1, frequency: "daily", active: "true" });
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard({ factoryId: 1 });

    expect(dashboard.metrics.dailyExecutionRate).toBe(50);
    expect(dashboard.moduleProgress.bphf).toMatchObject({ expected: 0, completed: 0, percentage: 0 });
  });

  it("não apresenta controlos pendentes quando não existe Plano do Dia", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const dateWithoutSchedule = new Date(2026, 7, 23, 10, 0, 0);
    const dashboard = await caller.dashboard({ factoryId: 1, date: dateWithoutSchedule });

    expect(dashboard.metrics.dailyExecutionRate).toBe(0);
    expect(dashboard.metrics).toMatchObject({ pending: 0, overdue: 0, completedToday: 0 });
    expect(dashboard.tasks).toEqual([]);
    expect(dashboard.taskGroups).toEqual({ today: [], tomorrow: [], thisWeek: [] });
    expect(dashboard.plannedControls).toEqual([]);
    expect(dashboard.moduleProgress.bphf).toMatchObject({ expected: 0, completed: 0, registeredToday: 0, percentage: 0 });
  });

  it("não agenda automaticamente a expedição comum", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard();
    expect(dashboard.moduleProgress.dispatch_control).toMatchObject({ expected: 0, completed: 0, registeredToday: 0, percentage: 0, pending: [] });
    expect(dashboard.moduleProgressByFactory.dispatch_control.every((entry) => entry.expected === 0)).toBe(true);
  });

  it("apresenta o estado previsto dos controlos comuns quando estão no Plano do Dia", async () => {
    addPublishedControlTask("dispatch_control", null, [1]);
    addPublishedControlTask("internal_analysis", null, [1]);
    const caller = qualityRouter.createCaller(createContext());

    const dashboard = await caller.dashboard();

    expect(dashboard.moduleProgress.dispatch_control).toMatchObject({ expected: 1, completed: 0, registeredToday: 0, percentage: 0, pending: ["Plano do Dia — dispatch_control"] });
    expect(dashboard.moduleProgress.internal_analysis).toMatchObject({ expected: 1, completed: 0, registeredToday: 0, percentage: 0, pending: ["Plano do Dia — internal_analysis"] });
  });

  it("mostra o progresso apenas das fábricas incluídas no Plano do Dia", async () => {
    tasks.push(
      { id: 4, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "bphf", area: "Plano do Dia", title: "Plano do Dia — BPHF F1", responsible: "Ana", assigneeProfileIds: [1] },
      { id: 5, factoryId: 2, status: "pending", dueAt: now, completedAt: null, module: "bphf", area: "Plano do Dia", title: "Plano do Dia — BPHF F2", responsible: "Ana", assigneeProfileIds: [1] },
    );
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard();

    expect(dashboard.plannedControls.map((control) => control.factoryId)).toEqual([1, 2]);
    expect(dashboard.moduleProgress.bphf).toMatchObject({ expected: 24, completed: 0, percentage: 0 });
    expect(dashboard.moduleProgressByFactory.bphf).toEqual([
      { factoryId: 1, expected: 12, completed: 0, registeredToday: 0, percentage: 0, pendingTaskId: 4 },
      { factoryId: 2, expected: 12, completed: 0, registeredToday: 0, percentage: 0, pendingTaskId: 5 },
      { factoryId: 3, expected: 0, completed: 0, registeredToday: 0, percentage: 0 },
    ]);
  });

  it("filtra NC e agrega os relatórios sem misturar a fábrica 2", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const filteredNcs = await caller.listNcs({ factoryId: 1 });
    const report = await caller.reports({ factoryId: 1 });
    expect(filteredNcs.map((nc) => nc.id)).toEqual([1, 2]);
    expect(report).toMatchObject({ planCompliance: 50, openNcs: 1, criticalOpen: 1 });
    expect(report.modules.find((module) => module.module === "bphf")).toMatchObject({ total: 1, conformity: 100, nc: 0 });
    expect(report.modules.find((module) => module.module === "metal_detectors")).toMatchObject({ total: 1, conformity: 0, nc: 1 });
    expect(report.recentEntries[0]).toMatchObject({ registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade" });
  });

  it("filtra o dashboard analítico por período, módulo, resultado e estado de NC", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const report = await caller.reports({ factoryId: 1, startDate: new Date(2026, 7, 14), endDate: new Date(2026, 7, 15), module: "bphf", result: "C", ncStatus: "open" });

    expect(report.modules.find((module) => module.module === "bphf")).toMatchObject({ total: 1, conformity: 100, nc: 0 });
    expect(report.modules.find((module) => module.module === "metal_detectors")).toMatchObject({ total: 0, conformity: 0, nc: 0 });
    expect(report.openNcs).toBe(0);
    expect(report.filteredEntries).toHaveLength(1);
    expect(report.filteredEntries[0]).toMatchObject({ module: "bphf", result: "C" });
    expect(report.filters).toMatchObject({ module: "bphf", result: "C", ncStatus: "open" });
  });

  it("filtra relatórios pelas variáveis específicas de cada controlo", async () => {
    const originalEntries = [...entries];
    entries.push(
      { id: 101, factoryId: 1, module: "bphf", area: "Embalagem", result: "C", completedAt: new Date(2026, 7, 14, 11, 0), payload: { criterion: "Higiene pessoal", collaboratorName: "Maria Silva", line: "Linha 2" } },
      { id: 102, factoryId: 1, module: "sensory", area: "Controlo sensorial", result: "NC", completedAt: new Date(2026, 7, 14, 12, 0), payload: { product: "Pão de centeio", lot: "L-2026-08", validity: "2026-09-01", calculation: { percentage: 42 } } },
      { id: 103, factoryId: 1, module: "temperature_controls", area: "Fábrica 1", result: "C", completedAt: new Date(2026, 7, 14, 13, 0), payload: { equipment: [{ name: "Arca de congelação 1", area: "Qualidade", temperature: -20 }] } },
    );
    const caller = qualityRouter.createCaller(createContext());
    const bphf = await caller.reports({ module: "bphf", inspectedCollaborator: "Maria", verificationType: "Higiene" });
    expect(bphf.filteredEntries.map((entry) => entry.id)).toEqual([101]);
    const sensory = await caller.reports({ module: "sensory", productName: "centeio", lot: "L-2026-08" });
    expect(sensory.filteredEntries.map((entry) => entry.id)).toEqual([102]);
    const temperatures = await caller.reports({ module: "temperature_controls", equipment: "Arca de congelação 1" });
    expect(temperatures.filteredEntries.map((entry) => entry.id)).toEqual([103]);
    const freeSearch = await caller.reports({ detailSearch: "L-2026-08" });
    expect(freeSearch.filteredEntries.map((entry) => entry.id)).toEqual([102]);
    entries.splice(0, entries.length, ...originalEntries);
  });

  it("filtra relatórios por colaborador e alerta ao acumular três incidências sem NC em seis meses", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const report = await caller.reports({ collaboratorProfileId: 3 });
    expect(report.filteredEntries.map((entry) => entry.id)).toEqual([1]);

    const originalEntries = [...entries];
    entries.push(
      { id: 91, factoryId: 1, module: "bphf", area: "Produção", result: "NC", completedAt: new Date(2026, 6, 4), payload: { collaboratorId: 42, collaboratorName: "Marco Monteiro" } },
      { id: 92, factoryId: 1, module: "bphf", area: "Produção", result: "NC", completedAt: new Date(2026, 6, 18), payload: { collaboratorId: 42, collaboratorName: "Marco Monteiro" } },
      { id: 93, factoryId: 1, module: "bphf", area: "Produção", result: "NC", completedAt: new Date(2026, 7, 2), payload: { collaboratorId: 42, collaboratorName: "Marco Monteiro" } },
    );
    const alerts = await caller.incidenceRecurrenceAlerts();
    expect(alerts).toContainEqual(expect.objectContaining({ collaboratorId: 42, collaboratorName: "Marco Monteiro", total: 3 }));
    entries.splice(0, entries.length, ...originalEntries);
  });

  it("aceita uma data inicial e final iguais para consultar um único dia", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const sameDay = new Date(2026, 7, 14);

    const report = await caller.reports({ factoryId: 1, startDate: sameDay, endDate: sameDay });

    expect(report.filteredEntries).toHaveLength(3);
  });

  it("gera uma incidência shelf-life e apresenta o relatório diário por fábrica", async () => {
    addPublishedControlTask("shelf_life", 2, [3]);
    const caller = qualityRouter.createCaller(createContext());
    await caller.createEntry({
      module: "shelf_life",
      title: "Incidência shelf-life — Pão de forma",
      area: "Shelf-life",
      result: "NC",
      notes: "Bolor identificado na amostra.",
      payload: { product: "Pão de forma", lot: "L-001", validity: "2026-08-13", reason: "Bolor identificado" },
      createNonconformity: false,
      severity: "medium",
      factoryId: 2,
    });
    expect(dbInserts[0]).toMatchObject({ module: "shelf_life", registeredByProfileId: 3, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade" });
    expect(dbInserts).toHaveLength(1);

    const daily = await caller.dailyIncidences({ date: now, factoryId: 1 });
    expect(daily.total).toBe(1);
    expect(daily.byFactory).toEqual([{ factoryName: "Fábrica 1 (Fatiado)", total: 1 }]);
    expect(daily.incidences.map((incidence) => incidence.id)).toEqual([2]);
  });

  it("exige um perfil PIN ativo para registar controlos e reserva as tarefas à Responsável", async () => {
    const noOperator = qualityRouter.createCaller(createContext(null));
    await expect(noOperator.createEntry({ module: "bphf", title: "Verificação BPHF", area: "Produção", result: "C" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const technician = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    await expect(technician.createTask({ title: "Tarefa pontual", factoryId: 1, dueAt: now, assigneeProfileIds: [1] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(technician.addArea({ name: "Área reservada", module: "bphf", factoryId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("só permite preencher controlos publicados para o técnico atribuído ou para a Responsável", async () => {
    const sabrina = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    const neuza = qualityRouter.createCaller(createContext({ id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" }));
    const joana = qualityRouter.createCaller(createContext());

    await expect(sabrina.createEntry({ module: "bphf", title: "Fardamento", area: "Produção", factoryId: 1, result: "C" })).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/Plano do Dia/i) });

    addPublishedControlTask("bphf", 1, [1]);
    await expect(neuza.createEntry({ module: "bphf", title: "Fardamento", area: "Produção", factoryId: 1, result: "C" })).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/outro colaborador/i) });
    await expect(sabrina.createEntry({ module: "bphf", title: "Fardamento", area: "Produção", factoryId: 1, result: "C" })).resolves.toMatchObject({ success: true });

    addPublishedControlTask("shelf_life", 2, [1]);
    await expect(joana.createEntry({ module: "shelf_life", title: "Verificação de amostra", area: "Shelf-life", factoryId: 2, result: "C" })).resolves.toMatchObject({ success: true });
    expect(dbInserts).toHaveLength(2);
  });

  it("permite ao responsável concluir um controlo pendente de um dia útil anterior com rastreabilidade", async () => {
    const previousDueAt = new Date(2026, 7, 13, 10, 0, 0);
    tasks.push({ id: 77, factoryId: 1, status: "pending", dueAt: previousDueAt, completedAt: null, module: "bphf", area: "Plano do Dia", title: "Plano do Dia — BPHF F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    const sabrina = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    const authorization = await sabrina.controlAuthorization({ module: "bphf", factoryId: 1 });
    await expect(sabrina.createEntry({ module: "bphf", title: "Verificação BPHF", area: "Produção", factoryId: 1, result: "C", performedAt: "2026-08-13", payload: { criterion: "Fardamento" } })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/justificação/i) });
    await expect(sabrina.createEntry({ module: "bphf", title: "Verificação BPHF", area: "Produção", factoryId: 1, result: "C", retroactiveReason: "technical_unavailability", payload: { criterion: "Fardamento" } })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/data real/i) });
    await expect(sabrina.createEntry({ module: "bphf", title: "Verificação BPHF", area: "Produção", factoryId: 1, result: "C", performedAt: "2026-08-13", retroactiveReason: "verified_not_registered", payload: { criterion: "Fardamento" } })).resolves.toMatchObject({ success: true });

    expect(authorization).toMatchObject({ allowed: true, taskId: 77, dueAt: previousDueAt, isPreviousPending: true });
    expect(dbInserts.at(-1)).toMatchObject({ completedAt: new Date("2026-08-13T12:00:00"), payload: { criterion: "Fardamento", plannedTaskId: 77, plannedDate: previousDueAt.toISOString(), registeredAgainstPreviousPlan: true, actualVerificationDate: "2026-08-13", retroactiveJustification: { code: "verified_not_registered", label: "Controlo verificado no dia agendado, mas não registado", details: null } } });
  });

  it("prioriza o Plano do Dia atual e abre uma pendência específica apenas quando é solicitada", async () => {
    const previousDueAt = new Date(2026, 7, 13, 10, 0, 0);
    tasks.push(
      { id: 78, factoryId: 1, status: "pending", dueAt: previousDueAt, completedAt: null, module: "sensory", area: "Plano do Dia", title: "Plano do Dia — Sensorial F1 anterior", responsible: "Sabrina Esteves", assigneeProfileIds: [1] },
      { id: 79, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "sensory", area: "Plano do Dia", title: "Plano do Dia — Sensorial F1 hoje", responsible: "Sabrina Esteves", assigneeProfileIds: [1] },
    );
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    await expect(caller.controlAuthorization({ module: "sensory", factoryId: 1 })).resolves.toMatchObject({ taskId: 79, isPreviousPending: false });
    await expect(caller.controlAuthorization({ module: "sensory", factoryId: 1, plannedTaskId: 78 })).resolves.toMatchObject({ taskId: 78, isPreviousPending: true, dueAt: previousDueAt });
  });

  it("mantém o controlo sensorial de hoje aberto a registos adicionais quando a completitude já foi atingida", async () => {
    const sensoryPlan = { id: 81, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "sensory", area: "Plano do Dia", title: "Plano do Dia — Sensorial F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] };
    const sensoryEntry = { id: 810, factoryId: 1, module: "sensory", area: "Controlo sensorial", title: "Controlo sensorial — Pão de forma", result: "C", completedAt: now, payload: { plannedTaskId: 81, plannedDate: now.toISOString() } };
    tasks.push(sensoryPlan);
    entries.push(sensoryEntry);
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      await expect(caller.controlAuthorization({ module: "sensory", factoryId: 1, plannedTaskId: 81 })).resolves.toMatchObject({ allowed: true, taskId: 81 });
    } finally {
      tasks.splice(tasks.indexOf(sensoryPlan), 1);
      entries.splice(entries.indexOf(sensoryEntry), 1);
    }
  });

  it("conclui uma pendência sensorial após o registo integral da verificação", async () => {
    const previousDueAt = new Date(2026, 7, 13, 10, 0, 0);
    tasks.push({ id: 80, factoryId: 1, status: "pending", dueAt: previousDueAt, completedAt: null, module: "sensory", area: "Plano do Dia", title: "Plano do Dia — Sensorial F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    await caller.createEntry({ module: "sensory", title: "Controlo sensorial — Pão de forma", area: "Produção", factoryId: 1, result: "C", plannedTaskId: 80, performedAt: "2026-08-13", retroactiveReason: "technical_unavailability", payload: { product: "Pão de forma", lot: "L-1" } });

    expect(dbUpdates.at(-1)).toMatchObject({ status: "completed", completedByProfileId: 1, completedByName: "Sabrina Esteves" });
  });

  it("permite antecipar um controlo futuro atribuído e regista a data prevista", async () => {
    const futureDueAt = new Date(2026, 7, 18, 10, 0, 0);
    const initialEntryCount = entries.length;
    tasks.push({ id: 89, factoryId: 1, status: "pending", dueAt: futureDueAt, completedAt: null, module: "temperature_controls", area: "Plano do Dia", title: "Plano do Dia — Temperaturas antecipado", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    persistInsertedControlEntries = true;
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    try {
      const authorization = await caller.controlAuthorization({ module: "temperature_controls", factoryId: 1, plannedTaskId: 89 });
      await caller.createEntry({ module: "temperature_controls", title: "Temperaturas antecipadas", area: "Área da Qualidade", factoryId: 1, result: "C", plannedTaskId: 89, payload: { equipment: [{ id: "f1-freezer-1" }, { id: "f1-freezer-2" }] } });

      expect(authorization).toMatchObject({ allowed: true, taskId: 89, dueAt: futureDueAt, isPreviousPending: false, isFuturePlanned: true });
      expect(dbInserts.at(-1)).toMatchObject({ payload: { equipment: [{ id: "f1-freezer-1" }, { id: "f1-freezer-2" }], plannedTaskId: 89, plannedDate: futureDueAt.toISOString(), registeredAgainstPreviousPlan: false, registeredAheadOfPlannedDate: true, actualVerificationDate: "2026-08-14" } });
      expect(dbUpdates.at(-1)).toMatchObject({ status: "completed", completedByProfileId: 1, completedByName: "Sabrina Esteves" });
    } finally {
      entries.splice(initialEntryCount);
      persistInsertedControlEntries = false;
    }
  });

  it("mantém Temperaturas pendente até existir uma leitura por equipamento e aceita leituras adicionais", async () => {
    const task = { id: 96, factoryId: 2, status: "pending", dueAt: now, completedAt: null, module: "temperature_controls", area: "Plano do Dia", title: "Plano do Dia — Temperaturas F2", responsible: "Sabrina Esteves", assigneeProfileIds: [1], temperatureEquipmentIds: ["f2-cold-room", "f2-dispatch-freezer"] };
    const initialEntryCount = entries.length;
    tasks.push(task);
    persistInsertedControlEntries = true;
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    try {
      await caller.createEntry({ module: "temperature_controls", title: "Temperatura — Câmara de Frio", area: "Câmara de Frio", factoryId: 2, result: "C", payload: { equipment: [{ id: "f2-cold-room", temperature: 6 }] } });

      expect(dbUpdates).not.toEqual(expect.arrayContaining([expect.objectContaining({ status: "completed" })]));
      await expect(caller.controlAuthorization({ module: "temperature_controls", factoryId: 2, plannedTaskId: task.id })).resolves.toMatchObject({ allowed: true, taskId: task.id });

      await caller.createEntry({ module: "temperature_controls", title: "Temperatura — Arca de Congelação expedição", area: "Expedição", factoryId: 2, result: "C", payload: { equipment: [{ id: "f2-dispatch-freezer", temperature: -19 }] } });
      expect(dbUpdates.at(-1)).toMatchObject({ status: "completed", completedByProfileId: 1, completedByName: "Sabrina Esteves" });

      task.status = "completed";
      await expect(caller.createEntry({ module: "temperature_controls", title: "Temperatura adicional — Câmara de Frio", area: "Câmara de Frio", factoryId: 2, result: "C", payload: { equipment: [{ id: "f2-cold-room", temperature: 5 }] } })).resolves.toMatchObject({ success: true });
    } finally {
      entries.splice(initialEntryCount);
      const taskIndex = tasks.findIndex(item => item.id === task.id);
      if (taskIndex >= 0) tasks.splice(taskIndex, 1);
      persistInsertedControlEntries = false;
    }
  });

  it("resolve uma tarefa planeada pela data selecionada, sem exigir o identificador da tarefa", async () => {
    const futureDueAt = new Date(2026, 7, 18, 10, 0, 0);
    tasks.push({ id: 91, factoryId: 1, status: "pending", dueAt: futureDueAt, completedAt: null, module: "temperature_controls", area: "Plano do Dia", title: "Plano do Dia — Temperaturas pela data", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    try {
      const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

      await expect(caller.controlAuthorization({ module: "temperature_controls", factoryId: 1, plannedDate: futureDueAt })).resolves.toMatchObject({ allowed: true, taskId: 91, dueAt: futureDueAt, isFuturePlanned: true });
    } finally {
      tasks.splice(tasks.findIndex(task => task.id === 91), 1);
    }
  });

  it("cria uma tarefa pontual com descrição e responsáveis atribuídos", async () => {
    const caller = qualityRouter.createCaller(createContext());
    await caller.createTask({ title: "Verificação geral", description: "Confirmar a condição da área.", factoryId: 1, dueAt: now, assigneeProfileIds: [1, 2] });

    expect(dbInserts[0]).toMatchObject({ title: "Verificação geral", description: "Confirmar a condição da área.", area: "Sem área", factoryId: 1, assigneeProfileIds: [1, 2], responsible: "Sabrina Esteves, Neuza Antunes" });
  });

  it("permite à Responsável criar uma tarefa de seguimento ligada a uma incidência NC", async () => {
    const sourceEntry = entries[0]!;
    const originalSourceEntry = { ...sourceEntry };
    Object.assign(sourceEntry, {
      module: "bphf",
      factoryId: 1,
      area: "Produção T",
      result: "NC",
      payload: { criterion: "Cacifos", collaboratorName: "Colaborador A" },
    });
    const manager = qualityRouter.createCaller(createContext());
    const technician = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    try {
      await expect(
        technician.createIncidenceFollowUpTask({
          sourceEntryId: sourceEntry.id,
          title: "Repetir inspeção aos cacifos",
          description: "Repetir a verificação para o colaborador indicado.",
          dueAt: now,
          assigneeProfileIds: [2],
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        manager.createIncidenceFollowUpTask({
          sourceEntryId: sourceEntry.id,
          title: "Repetir inspeção aos cacifos",
          description: "Repetir a verificação para o colaborador indicado.",
          dueAt: now,
          assigneeProfileIds: [2],
        })
      ).resolves.toMatchObject({ success: true });
      expect(dbInserts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          title: "Repetir inspeção aos cacifos",
          module: "bphf",
          area: "Produção T",
          factoryId: 1,
          sourceEntryId: sourceEntry.id,
          assigneeProfileIds: [2],
          responsible: "Neuza Antunes",
        }),
      ]));
    } finally {
      Object.assign(sourceEntry, originalSourceEntry);
    }
  });

  it("retira a incidência ativa e cancela apenas os seguimentos pendentes quando a verificação passa a Conforme", async () => {
    const sourceEntry = entries[0]!;
    const originalSourceEntry = { ...sourceEntry };
    const followUpTask = {
      id: 980,
      factoryId: 1,
      status: "pending" as const,
      dueAt: now,
      completedAt: null,
      module: "bphf" as const,
      area: "Produção T",
      title: "Seguimento — Cacifos",
      responsible: "Neuza Antunes",
      assigneeProfileIds: [2],
      sourceEntryId: sourceEntry.id,
    };
    Object.assign(sourceEntry, {
      module: "bphf",
      factoryId: 1,
      area: "Produção T",
      result: "NC",
      registeredByProfileId: 3,
      registeredByName: "Joana Pina",
      payload: { criterion: "Cacifos" },
    });
    tasks.push(followUpTask);
    try {
      const result = await qualityRouter
        .createCaller(createContext())
        .updateControlEntry({
          id: sourceEntry.id,
          title: "Cacifos — verificação corrigida",
          area: "Produção T",
          factoryId: 1,
          result: "C",
          notes: "Verificação revista e conforme.",
        });
      expect(result).toMatchObject({ success: true, incidenciaResolvida: true });
      expect(dbUpdates).toEqual(expect.arrayContaining([
        expect.objectContaining({ status: "cancelled" }),
        expect.objectContaining({
          result: "C",
          payload: expect.objectContaining({
            editHistory: [expect.objectContaining({ incidenceResolved: true })],
          }),
        }),
      ]));
    } finally {
      tasks.splice(tasks.findIndex(task => task.id === followUpTask.id), 1);
      Object.assign(sourceEntry, originalSourceEntry);
    }
  });

  it("cancela o seguimento de Quebráveis quando a verificação de origem é corrigida para Conforme", async () => {
    const sourceEntry = entries[0]!;
    const originalSourceEntry = { ...sourceEntry };
    const followUpTask = {
      id: 981,
      factoryId: 1,
      status: "pending" as const,
      dueAt: now,
      completedAt: null,
      module: "fragile_items" as const,
      area: "Zona Tratamento Térmico",
      title: "Seguimento — Porta do forno",
      responsible: "Neuza Antunes",
      assigneeProfileIds: [2],
      sourceEntryId: sourceEntry.id,
    };
    Object.assign(sourceEntry, {
      module: "fragile_items",
      factoryId: 1,
      area: "Zona Tratamento Térmico",
      result: "NC",
      registeredByProfileId: 3,
      registeredByName: "Joana Pina",
      payload: { fragileItemId: 1 },
    });
    tasks.push(followUpTask);
    try {
      await expect(
        qualityRouter.createCaller(createContext()).updateControlEntry({
          id: sourceEntry.id,
          title: sourceEntry.title ?? "Portas forno Anelar 1",
          area: "Zona Tratamento Térmico",
          factoryId: 1,
          result: "C",
          notes: "Ponto revisto sem desvio.",
        })
      ).resolves.toMatchObject({ incidenciaResolvida: true });
      expect(dbUpdates).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: "cancelled" })])
      );
    } finally {
      tasks.splice(tasks.findIndex(task => task.id === followUpTask.id), 1);
      Object.assign(sourceEntry, originalSourceEntry);
    }
  });

  it("reserva a consulta e a conclusão das tarefas aos responsáveis atribuídos ou à Responsável", async () => {
    const originalAssignees = tasks[1]!.assigneeProfileIds;
    tasks[1]!.assigneeProfileIds = [1];
    const assignee = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    const otherTechnician = qualityRouter.createCaller(createContext({ id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" }));

    await expect(assignee.listTasks({ factoryId: 1 })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: 2 })]));
    await expect(otherTechnician.listTasks({ factoryId: 1 })).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 2 })]));
    await expect(otherTechnician.completeTask({ id: 2, result: "C", notes: "Relatório executado." })).rejects.toMatchObject({ code: "FORBIDDEN" });
    tasks[1]!.assigneeProfileIds = originalAssignees;
  });

  it("permite apenas à Responsável atualizar ou eliminar tarefas pendentes", async () => {
    const originalStatus = tasks[0]!.status;
    tasks[0]!.status = "pending";
    const manager = qualityRouter.createCaller(createContext());
    const technician = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    await expect(technician.updateTask({ id: 1, title: "Tarefa revista", description: "Descrição revista", factoryId: 1, dueAt: now, assigneeProfileIds: [1] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await manager.updateTask({ id: 1, title: "Tarefa revista", description: "Descrição revista", factoryId: 1, dueAt: now, assigneeProfileIds: [1] });
    expect(dbUpdates[0]).toMatchObject({ title: "Tarefa revista", description: "Descrição revista", assigneeProfileIds: [1] });
    await manager.deleteTask({ id: 1 });
    expect(dbUpdates[1]).toMatchObject({ status: "cancelled" });
    tasks[0]!.status = originalStatus;
  });

  it("permite editar ou eliminar um registo concluído apenas ao técnico executor ou à Responsável", async () => {
    const entry = entries[0]!;
    const originalEntry = { ...entry };
    Object.assign(entry, { registeredByProfileId: 1, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade", payload: { criterion: "Fardamento" } });
    const executor = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    const otherTechnician = qualityRouter.createCaller(createContext({ id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" }));
    const manager = qualityRouter.createCaller(createContext());

    await expect(otherTechnician.updateControlEntry({ id: entry.id, title: "Registo revisto", area: "Produção", result: "C", notes: "Observação revista" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await executor.updateControlEntry({ id: entry.id, title: "Registo revisto", area: "Produção", result: "C", notes: "Observação revista" });
    expect(dbUpdates[0]).toMatchObject({ title: "Registo revisto", notes: "Observação revista", payload: { criterion: "Fardamento", editHistory: [expect.objectContaining({ action: "updated", byProfileId: 1 })] } });
    await manager.deleteControlEntry({ id: entry.id });
    expect(dbUpdates[1]).toMatchObject({ payload: { recordLifecycle: expect.objectContaining({ status: "deleted", deletedByProfileId: 3 }), editHistory: [expect.objectContaining({ action: "deleted", byProfileId: 3 })] } });
    Object.assign(entry, originalEntry);
  });

  it("guarda o perfil que concluiu a tarefa e cria o respetivo registo de controlo", async () => {
    const originalStatus = tasks[0]!.status;
    const originalAssignees = tasks[0]!.assigneeProfileIds;
    tasks[0]!.status = "pending";
    tasks[0]!.assigneeProfileIds = [2];
    const caller = qualityRouter.createCaller(createContext({ id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" }));
    await caller.completeTask({ id: 1, result: "C", notes: "Verificação concluída sem desvios.", evidencePhotos: [{ url: "/manus-storage/task-reports/1/2/evidencia.png", fileName: "evidencia.png", mimeType: "image/png" }] });
    expect(dbUpdates[0]).toMatchObject({ status: "completed", completedByProfileId: 2, completedByName: "Neuza Antunes", completedByTitle: "Tec. Qualidade" });
    expect(dbInserts[0]).toMatchObject({ registeredByProfileId: 2, registeredByName: "Neuza Antunes", registeredByTitle: "Tec. Qualidade", notes: "Verificação concluída sem desvios.", payload: { taskId: 1, executionReport: { evidencePhotos: [{ url: "/manus-storage/task-reports/1/2/evidencia.png", fileName: "evidencia.png", mimeType: "image/png" }] } } });
    tasks[0]!.status = originalStatus;
    tasks[0]!.assigneeProfileIds = originalAssignees;
  });

  it("guarda as observações e alerta a Responsável quando uma técnica conclui um seguimento", async () => {
    const task = tasks[0]!;
    const originalTask = { ...task, assigneeProfileIds: [...task.assigneeProfileIds] };
    Object.assign(task, {
      status: "pending",
      assigneeProfileIds: [2],
      sourceEntryId: 1,
      title: "Repetir inspeção aos cacifos",
    });
    vi.mocked(notifyOwner).mockResolvedValue(true);
    try {
      await expect(
        qualityRouter
          .createCaller(
            createContext({
              id: 2,
              name: "Neuza Antunes",
              title: "Tec. Qualidade",
              role: "technician",
            })
          )
          .completeTask({
            id: task.id,
            result: "C",
            notes: "Cacifo revisto e conforme na nova verificação.",
          })
      ).resolves.toMatchObject({ followUpCompleted: true, managerAlerted: true });
      expect(dbInserts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            notes: "Cacifo revisto e conforme na nova verificação.",
          }),
        ])
      );
      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Verificação de seguimento concluída",
          content: expect.stringContaining("Cacifo revisto e conforme"),
        })
      );
    } finally {
      Object.assign(task, originalTask);
    }
  });

  it("aceita evidência fotográfica apenas do responsável atribuído ou da Responsável", async () => {
    const originalStatus = tasks[0]!.status;
    const originalAssignees = tasks[0]!.assigneeProfileIds;
    tasks[0]!.status = "pending";
    tasks[0]!.assigneeProfileIds = [1];
    const assignee = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    const otherTechnician = qualityRouter.createCaller(createContext({ id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" }));

    vi.mocked(storagePut).mockResolvedValue({ key: "task-reports/1/1/evidencia.png", url: "/manus-storage/task-reports/1/1/evidencia.png" });
    await expect(otherTechnician.uploadTaskReportPhoto({ taskId: 1, fileName: "evidencia.png", mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await assignee.uploadTaskReportPhoto({ taskId: 1, fileName: "evidencia.png", mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" });
    expect(storagePut).toHaveBeenCalledWith(expect.stringContaining("task-reports/1/1/"), expect.any(Buffer), "image/png");
    tasks[0]!.status = originalStatus;
    tasks[0]!.assigneeProfileIds = originalAssignees;
  });

  it("gere Áreas/Zonas da Checklist Mensal sem apagar pontos associados", async () => {
    const caller = qualityRouter.createCaller(createContext());
    monthlyAreaRows.splice(0, monthlyAreaRows.length);
    const created = await caller.addChecklistArea({ name: "  Preparação  " });
    expect(created).toMatchObject({ success: true, name: "Preparação" });
    expect(dbInserts).toContainEqual(expect.objectContaining({ name: "Preparação", active: "true" }));

    monthlyAreaRows.push({ id: 201, name: "Geral", active: "true" });
    monthlyRows.splice(0, monthlyRows.length);
    monthlyAreaAssignments.splice(0, monthlyAreaAssignments.length);
    const listed = await caller.listChecklistAreas();
    expect(listed).toEqual([{ id: 201, name: "Geral", itemCount: 0 }]);

    await caller.updateChecklistArea({ id: 201, name: "Higiene" });
    expect(dbUpdates).toContainEqual(expect.objectContaining({ name: "Higiene" }));
    expect(dbUpdates).toContainEqual(expect.objectContaining({ area: "Higiene" }));
    monthlyRows.push({ id: 303, area: "Geral", active: "true" });
    monthlyAreaAssignments.push({ checklistItemId: 303, checklistAreaId: 201 });
    await expect(caller.removeChecklistArea({ id: 201 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    monthlyRows.splice(0, monthlyRows.length);
    monthlyAreaAssignments.splice(0, monthlyAreaAssignments.length);
    await caller.removeChecklistArea({ id: 201 });
    expect(dbUpdates).toContainEqual(expect.objectContaining({ active: "false" }));
  });

  it("protege a gestão de Áreas/Zonas para a Responsável de Qualidade", async () => {
    const technician = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    await expect(technician.addChecklistArea({ name: "Área reservada" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(technician.updateChecklistArea({ id: 201, name: "Área reservada" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(technician.removeChecklistArea({ id: 201 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("devolve e contabiliza o mesmo ponto em todas as Áreas/Zonas atribuídas", async () => {
    monthlyAreaRows.push({ id: 202, name: "Produção", active: "true" });
    monthlyAreaAssignments.push({ checklistItemId: 301, checklistAreaId: 202 });
    entries.push({ id: 990, factoryId: 1, module: "monthly_checklist", area: "Geral", result: "C", completedAt: now, payload: { checklistItemId: 301 } });
    try {
      const caller = qualityRouter.createCaller(createContext());
      const listed = await caller.listChecklistItems({ factoryId: 1 });
      expect(listed.find(item => item.id === 301)?.areaNames).toEqual(["Geral", "Produção"]);
      const progress = await caller.monthlyChecklistProgress();
      expect(progress.find(item => item.factoryId === 1)).toMatchObject({
        total: 2,
        completed: 1,
        percentage: 50,
        areas: [
          expect.objectContaining({ areaName: "Geral", minimumMet: true }),
          expect.objectContaining({ areaName: "Produção", minimumMet: false }),
        ],
      });
    } finally {
      entries.splice(entries.findIndex(entry => entry.id === 990), 1);
    }
  });

  it("filtra os pontos de quebráveis pela fábrica e pela periodicidade", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const factoryOneWeekly = await caller.listFragileItems({ factoryId: 1, periodicity: "S" });
    const factoryTwo = await caller.listFragileItems({ factoryId: 2 });
    expect(factoryOneWeekly.map((item) => item.id)).toEqual([2]);
    expect(factoryTwo.map((item) => item.id)).toEqual([3]);
  });

  it("indica a próxima data prevista em cada ponto de Quebráveis", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const points = await caller.listFragileItems();
    const dailyPoint = points.find((item) => item.id === 1);
    const weeklyPoint = points.find((item) => item.id === 2);

    expect(dailyPoint?.nextInspectionAt.toISOString().slice(0, 10)).toBe("2026-08-17");
    expect(weeklyPoint?.nextInspectionAt.toISOString().slice(0, 10)).toBe("2026-08-14");
  });

  it("calcula as pendências de quebráveis a partir da última inspeção de cada ponto", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const factoryOne = await caller.fragilePending({ factoryId: 1 });
    const factoryTwoMonthly = await caller.fragilePending({ factoryId: 2, periodicity: "M" });
    expect(factoryOne.map((item) => item.id)).toEqual([2]);
    expect(factoryTwoMonthly.map((item) => item.id)).toEqual([3]);
    expect(factoryOne[0]?.lastInspectionAt).toBeNull();
  });

  it("lista o histórico anterior do ponto de Quebráveis com estado, autoria e observações", async () => {
    const historyEntries = [
      { id: 950, factoryId: 1, module: "fragile_items", area: "Zona Tratamento Térmico", title: "Quebrável — Portas forno Anelar 1", result: "NC", notes: "Substituir proteção antes do próximo turno.", completedAt: new Date(2026, 7, 13, 9, 30, 0), registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade", payload: { fragileItemId: 1, state: "Danificado", evidencePhotos: [{ url: "/manus-storage/dano.png", fileName: "dano.png" }] } },
      { id: 951, factoryId: 2, module: "fragile_items", area: "Produção", title: "Quebrável — Janelas-Exterior", result: "C", notes: "Sem alterações.", completedAt: new Date(2026, 7, 13, 10, 0, 0), registeredByName: "Neuza Antunes", registeredByTitle: "Tec. Qualidade", payload: { fragileItemId: 3, state: "Íntegro", evidencePhotos: [] } },
    ];
    entries.push(...historyEntries);
    try {
      const caller = qualityRouter.createCaller(createContext());
      const history = await caller.fragileInspectionHistory({ itemId: 1 });

      expect(history).toHaveLength(2);
      expect(history).toEqual(expect.arrayContaining([expect.objectContaining({ id: 950, state: "Danificado", result: "NC", notes: "Substituir proteção antes do próximo turno.", registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade", evidencePhotos: [{ url: "/manus-storage/dano.png", fileName: "dano.png" }] })]));
      expect(history.map((entry) => entry.id)).not.toContain(951);
    } finally {
      entries.splice(entries.length - historyEntries.length, historyEntries.length);
    }
  });

  it("devolve apenas os resultados do controlo, fábrica e data operacional consultados", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const results = await caller.dailyControlResults({ module: "bphf", factoryId: 1, operationalDate: now });

    expect(results.entries).toEqual([expect.objectContaining({ id: 1, title: undefined, area: "Produção T", result: "C", registeredByName: "Joana Pina" })]);
  });

  it("lista apenas as pendências anteriores do controlo acessíveis ao utilizador", async () => {
    tasks.push({ id: 99, factoryId: 1, status: "pending", dueAt: new Date(2026, 7, 13, 10, 0, 0), completedAt: null, module: "metal_detectors", area: "Plano do Dia", title: "Plano do Dia — Metal F1", responsible: "Ana", assigneeProfileIds: [3] });
    const caller = qualityRouter.createCaller(createContext());
    const pendingTasks = await caller.pendingControlTasks({ module: "metal_detectors", factoryId: 1 });

    expect(pendingTasks).toEqual([expect.objectContaining({ id: 99, factoryId: 1 })]);
  });

  it("mantém BPHF pendente quando falta um critério numa área e só fecha com todos os critérios", async () => {
    const bphfPlan = { id: 122, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "bphf", area: "Plano do Dia", title: "Plano do Dia — BPHF F1", responsible: "Ana", assigneeProfileIds: [3] };
    const bphfAreas = ["Produção", "Embalagem", "Limpeza"].map((name, index) => ({ id: 810 + index, name, group: "bphf", factoryId: 1, active: "true" }));
    const criteria = ["Estado de limpeza e conservação do fardamento", "Higienização das mãos dos manipuladores", "Cumprimento geral das regras de BPHF", "Estado de limpeza e organização dos cacifos do pessoal e de trabalho"];
    const bphfEntries = bphfAreas.flatMap((area, areaIndex) => criteria.slice(0, areaIndex === 2 ? 3 : 4).map((criterion, criterionIndex) => ({ id: 820 + areaIndex * 10 + criterionIndex, factoryId: 1, module: "bphf", area: area.name, title: criterion, result: "C", completedAt: now, payload: { criterion, plannedTaskId: 122, plannedDate: now.toISOString() } })));
    const originalAreas = [...areaRows];
    tasks.push(bphfPlan);
    areaRows.splice(0, areaRows.length, ...bphfAreas);
    entries.push(...bphfEntries);
    try {
      const caller = qualityRouter.createCaller(createContext());
      const dashboard = await caller.dashboard({ date: now });
      const progress = dashboard.moduleProgressByFactory.bphf.find((item) => item.factoryId === 1);

      expect(progress).toMatchObject({ expected: 12, completed: 11, percentage: 91.7 });
      expect(dashboard.moduleProgress.bphf.pending).toContain("Plano do Dia — BPHF F1");

      bphfPlan.status = "completed";
      await expect(caller.controlAuthorization({ module: "bphf", factoryId: 1, plannedTaskId: 122 })).resolves.toMatchObject({ allowed: true, taskId: 122 });

      entries.push({ id: 899, factoryId: 1, module: "bphf", area: "Limpeza", title: criteria[3], result: "C", completedAt: now, payload: { criterion: criteria[3], plannedTaskId: 122, plannedDate: now.toISOString() } });
      const completedDashboard = await caller.dashboard({ date: now });
      const completedProgress = completedDashboard.moduleProgressByFactory.bphf.find((item) => item.factoryId === 1);
      expect(completedProgress).toMatchObject({ expected: 12, completed: 12, percentage: 100 });
      expect(completedDashboard.moduleProgress.bphf.pending).not.toContain("Plano do Dia — BPHF F1");
      entries.pop();
    } finally {
      tasks.splice(tasks.indexOf(bphfPlan), 1);
      entries.splice(entries.length - bphfEntries.length, bphfEntries.length);
      areaRows.splice(0, areaRows.length, ...originalAreas);
    }
  });

  it("mantém os Detetores de Metais abaixo de 100% até todas as linhas previstas terem uma verificação", async () => {
    const metalPlan = { id: 123, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "metal_detectors", area: "Plano do Dia", title: "Plano do Dia — Metais F1", responsible: "Ana", assigneeProfileIds: [3], metalDetectorLines: ["Linha 1"] };
    const metalAreas = [{ id: 830, name: "Linha 1", group: "metal", factoryId: 1, active: "true" }, { id: 831, name: "Linha 2", group: "metal", factoryId: 1, active: "true" }];
    const metalEntry = { id: 832, factoryId: 1, module: "metal_detectors", area: "Linha 1", title: "Detetor de metais — Linha 1", result: "C", completedAt: now, payload: { plannedTaskId: 123, plannedDate: now.toISOString() } };
    const originalAreas = [...areaRows];
    tasks.push(metalPlan);
    areaRows.splice(0, areaRows.length, ...metalAreas);
    entries.push(metalEntry);
    try {
      const caller = qualityRouter.createCaller(createContext());
      const dashboard = await caller.dashboard({ date: now });
      const progress = dashboard.moduleProgressByFactory.metal_detectors.find((item) => item.factoryId === 1);

      expect(progress).toMatchObject({ expected: 1, completed: 1, percentage: 100 });
      expect(progress).not.toHaveProperty("pendingTaskId");
    } finally {
      tasks.splice(tasks.indexOf(metalPlan), 1);
      entries.splice(entries.length - 1, 1);
      areaRows.splice(0, areaRows.length, ...originalAreas);
    }
  });

  it("agrupa alertas BPHF obrigatórios pelo colaborador inspecionado, mesmo entre pontos e fábricas distintos", async () => {
    const bphfEntries = [
      { id: 901, factoryId: 1, module: "bphf", area: "Produção", title: "Higienização das mãos", result: "NC", completedAt: new Date(2026, 7, 10, 10, 0, 0), payload: { collaboratorId: 71, collaboratorName: "Maria Silva" } },
      { id: 902, factoryId: 2, module: "bphf", area: "Embalagem", title: "Uso de touca", result: "NC", completedAt: new Date(2026, 7, 11, 10, 0, 0), payload: { collaboratorId: 71, collaboratorName: "Maria Silva" } },
      { id: 903, factoryId: 3, module: "bphf", area: "Limpeza", title: "Estado do fardamento", result: "NC", completedAt: new Date(2026, 7, 12, 10, 0, 0), payload: { collaboratorId: 71, collaboratorName: "Maria Silva" } },
    ];
    entries.push(...bphfEntries);
    try {
      const caller = qualityRouter.createCaller(createContext());
      const alerts = await caller.similarIncidenceAlerts();

      expect(alerts).toEqual(expect.arrayContaining([expect.objectContaining({ module: "bphf", factoryId: null, factoryName: "Várias fábricas / linhas", title: "Colaborador: Maria Silva", collaboratorId: 71, collaboratorName: "Maria Silva", total: 3 })]));
    } finally {
      entries.splice(entries.length - bphfEntries.length, bphfEntries.length);
    }
  });

  it("agrupa alertas obrigatórios de outros controlos pelo mesmo ponto controlado", async () => {
    const pointEntries = [
      { id: 904, factoryId: 1, module: "fragile_items", area: "Produção", title: "Quebrável — Quadro elétrico", result: "NC", completedAt: new Date(2026, 7, 10, 10, 0, 0), payload: { fragileItemId: 87 } },
      { id: 905, factoryId: 1, module: "fragile_items", area: "Produção", title: "Quebrável — Quadro elétrico", result: "NC", completedAt: new Date(2026, 7, 11, 10, 0, 0), payload: { fragileItemId: 87 } },
      { id: 906, factoryId: 1, module: "fragile_items", area: "Produção", title: "Quebrável — Quadro elétrico", result: "NC", completedAt: new Date(2026, 7, 12, 10, 0, 0), payload: { fragileItemId: 87 } },
      { id: 907, factoryId: 1, module: "fragile_items", area: "Produção", title: "Quebrável — Quadro elétrico", result: "NC", completedAt: new Date(2026, 7, 12, 12, 0, 0), payload: { fragileItemId: 88 } },
    ];
    entries.push(...pointEntries);
    try {
      const caller = qualityRouter.createCaller(createContext());
      const alerts = await caller.similarIncidenceAlerts();

      expect(alerts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          module: "fragile_items",
          factoryId: 1,
          title: "Quebrável — Quadro elétrico",
          pointKey: "fragile_items|1|id:87",
          total: 3,
        }),
      ]));
      expect(alerts.some(alert => alert.pointKey === "fragile_items|1|id:88")).toBe(false);
    } finally {
      entries.splice(entries.length - pointEntries.length, pointEntries.length);
    }
  });

  it("não soma incidências manuais ou produtos com o mesmo título sem um ponto de controlo identificável", async () => {
    const unlinkedIncidences = [
      { id: 9081, factoryId: 2, module: "not_applicable", area: "Não aplicável", title: "Broa da Serra", result: "NC", notes: "Algumas unidades queimadas.", completedAt: new Date(2026, 7, 10, 10, 0, 0), payload: {} },
      { id: 9082, factoryId: 2, module: "not_applicable", area: "Não aplicável", title: "Broa da Serra", result: "NC", notes: "Falta de ingrediente numa produção diferente.", completedAt: new Date(2026, 7, 11, 10, 0, 0), payload: {} },
      { id: 9083, factoryId: 2, module: "not_applicable", area: "Não aplicável", title: "Broa da Serra", result: "NC", notes: "Embalagem danificada.", completedAt: new Date(2026, 7, 12, 10, 0, 0), payload: {} },
    ];
    entries.push(...unlinkedIncidences);
    try {
      const caller = qualityRouter.createCaller(createContext());
      const alerts = await caller.similarIncidenceAlerts();

      expect(alerts.some(alert => alert.title === "Broa da Serra")).toBe(false);
    } finally {
      entries.splice(entries.length - unlinkedIncidences.length, unlinkedIncidences.length);
    }
  });

  it("aceita a data de conclusão portuguesa ao guardar o tratamento da incidência", async () => {
    const incidence = { id: 908, factoryId: 1, module: "fragile_items", area: "Produção", title: "Quebrável — Quadro elétrico", result: "NC", completedAt: now, payload: {} };
    entries.unshift(incidence);
    try {
      const caller = qualityRouter.createCaller(createContext());
      await caller.updateIncidence({
        id: 908,
        treatment: {
          status: "completed",
          correction: "Substituição executada.",
          responsible: "Joana Pina",
          completedAt: "28/08/2026",
        },
      });

      expect(dbUpdates.at(-1)).toMatchObject({
        payload: expect.objectContaining({
          incidenceTreatment: expect.objectContaining({ completedAt: "2026-08-28" }),
        }),
      });
    } finally {
      entries.shift();
    }
  });

  it("inclui verificações semanais e mensais quando o Plano do Dia é uma sexta-feira", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const friday = new Date(2026, 7, 14, 12, 0, 0);

    const pending = await caller.fragilePending({ referenceDate: friday });

    expect(pending.map((item) => item.periodicity)).toEqual(expect.arrayContaining(["S", "M"]));
    expect(pending.filter((item) => item.periodicity === "S")[0]?.dueAt.toISOString().slice(0, 10)).toBe("2026-08-14");
    expect(pending.filter((item) => item.periodicity === "M")[0]?.dueAt.toISOString().slice(0, 10)).toBe("2026-08-14");
  });

  it("atualiza o ponto de quebráveis e guarda a imagem de referência associada", async () => {
    vi.mocked(storagePut).mockResolvedValue({ key: "fragile-reference/1.png", url: "/manus-storage/fragile-reference/1.png" });
    const caller = qualityRouter.createCaller(createContext());
    await caller.updateFragileItem({ id: 1, name: "Portas forno Anelar 1 — revista", location: "Zona Tratamento Térmico", factoryId: 2, periodicity: "S", itemType: "Outro" });
    await caller.uploadFragileReferenceImage({ itemId: 1, fileName: "porta.png", mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" });
    expect(dbUpdates[0]).toMatchObject({ name: "Portas forno Anelar 1 — revista", factoryId: 2, periodicity: "S" });
    expect(storagePut).toHaveBeenCalledWith(expect.stringContaining("fragile-reference/1/"), expect.any(Buffer), "image/png");
    expect(dbUpdates[1]).toMatchObject({ referenceImageKey: "fragile-reference/1.png", referenceImageUrl: "/manus-storage/fragile-reference/1.png", referenceImageName: "porta.png" });
  });

  it("permite a um técnico editar e eliminar um ponto de quebráveis", async () => {
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    await caller.updateFragileItem({ id: 1, name: "Portas forno anelar — revista", location: "Produção", factoryId: 1, periodicity: "D", itemType: "Vidro" });
    await caller.deleteFragileItem({ id: 1 });

    expect(dbUpdates[0]).toMatchObject({ name: "Portas forno anelar — revista", location: "Produção", factoryId: 1 });
    expect(dbUpdates[1]).toEqual({ status: "inactive" });
  });

  it("aceita fotografia de evidência de dano apenas num controlo de Quebráveis autorizado", async () => {
    addPublishedControlTask("fragile_items", 1, [1]);
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    vi.mocked(storagePut).mockResolvedValue({ key: "fragile-evidence/1/1/dano.png", url: "/manus-storage/fragile-evidence/1/1/dano.png" });

    const result = await caller.uploadFragileInspectionEvidence({ itemId: 1, fileName: "dano.png", mimeType: "image/png", dataUrl: "data:image/png;base64,aGVsbG8=" });

    expect(result).toMatchObject({ success: true, url: "/manus-storage/fragile-evidence/1/1/dano.png", fileName: "dano.png" });
    expect(storagePut).toHaveBeenCalledWith(expect.stringContaining("fragile-evidence/1/1/"), expect.any(Buffer), "image/png");
  });

  it("cria um ponto de quebráveis com fábrica, área e periodicidade", async () => {
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    const result = await caller.addFragileItem({ name: "Proteção acrílica da linha", location: "Embalamento primário", factoryId: 3, periodicity: "Q", itemType: "Plástico rígido" });
    expect(result).toEqual({ success: true });
    expect(dbInserts[0]).toMatchObject({ name: "Proteção acrílica da linha", location: "Embalamento primário", factoryId: 3, periodicity: "Q", itemType: "Plástico rígido", status: "active", createdBy: "quality-admin", createdByProfileId: 1, createdByName: "Sabrina Esteves", updatedByName: "Sabrina Esteves" });
  });

  it("extrai cliente, número e linhas de produto de uma encomenda PDF", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ orderNumber: "ENC-345", customer: "Cliente Norte", products: [{ name: "Pão de forma", orderedQuantity: 24 }, { name: "Pão brioche", orderedQuantity: 12 }], warnings: [] }) } }] } as any);
    addPublishedControlTask("dispatch_control", null, [1]);
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    const result = await caller.parseDispatchOrderPdf({ fileName: "encomenda.pdf", mimeType: "application/pdf", dataUrl: `data:application/pdf;base64,${Buffer.from("%PDF-1.4\nordem").toString("base64")}` });
    expect(result).toMatchObject({ orderNumber: "ENC-345", customer: "Cliente Norte", document: { name: "encomenda.pdf", url: "/manus-storage/dispatch-orders/3/encomenda.pdf" } });
    expect(result.products).toContainEqual({ name: "Pão de forma", orderedQuantity: 24 });
    expect(storagePut).toHaveBeenCalledWith(expect.stringContaining("dispatch-orders/1/"), expect.any(Buffer), "application/pdf");
    expect(invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3-flash-preview" }));
  });

  it("regista a expedição como incidência quando a temperatura falha", async () => {
    addPublishedControlTask("dispatch_control", null, [3]);
    const caller = qualityRouter.createCaller(createContext());
    const result = await caller.registerDispatchControl({ factoryId: 1, profile: "congelado", orderNumber: "ENC-100", customer: "Cliente Norte", deliveryNote: "GR-50", product: "Pão congelado", lot: "L-100", orderedBoxes: 24, dispatchedBoxes: 24, productLabelResult: "C", boxLabelResult: "C", productTemperature: -17, vehicleTemperature: -18, observations: "Produto acima do limite para congelados." });
    expect(result.conformity).toMatchObject({ result: "NC", vehicleTemperatureResult: "C", productValidations: [expect.objectContaining({ conformity: expect.objectContaining({ productTemperatureResult: "NC" }) })] });
    expect(result.incidence).toBe(true);
    expect(dbInserts[0]).toMatchObject({ module: "dispatch_control", result: "NC", factoryId: null, area: "Expedição congelado", registeredByName: "Joana Pina" });
    expect(dbInserts).toHaveLength(1);
  });

  it("regista desvios de expedição sem criar NC automática", async () => {
    addPublishedControlTask("dispatch_control", null, [3]);
    const caller = qualityRouter.createCaller(createContext());
    await caller.registerDispatchControl({ factoryId: 2, profile: "ambiente", orderNumber: "ENC-101", customer: "Cliente Centro", product: "Pão de forma", lot: "L-101", orderedBoxes: 25, dispatchedBoxes: 24, productLabelResult: "NC", boxLabelResult: "C", productTemperature: 18, vehicleTemperature: 20, observations: "Quantidade e rotulagem do produto divergentes." });
    expect(dbInserts[0]).toMatchObject({ module: "dispatch_control", result: "NC", factoryId: null, area: "Expedição ambiente" });
    expect(dbInserts).toHaveLength(1);
  });

  it("fecha a expedição com referências não verificadas sem as tratar como conformes", async () => {
    addPublishedControlTask("dispatch_control", null, [3]);
    const caller = qualityRouter.createCaller(createContext());
    const result = await caller.registerDispatchControl({
      factoryId: 1, profile: "ambiente", orderNumber: "ENC-102", customer: "Cliente Sul", product: "Pão de forma", lot: "L-102", orderedBoxes: 12, dispatchedBoxes: 12, productLabelResult: "C", boxLabelResult: "C", productTemperature: 20, vehicleTemperature: 20,
      productChecks: [
        { verificationStatus: "verified", name: "Pão de forma", orderedQuantity: 12, lots: [{ lot: "L-102", dispatchedQuantity: 12 }], productLabelResult: "C", boxLabelResult: "C", productTemperature: 20 },
        { verificationStatus: "not_verified", name: "Pão rústico", orderedQuantity: 8, notVerifiedReason: "Referência indisponível no cais de expedição." },
      ],
    });

    expect(result).toMatchObject({ incidence: false, conformity: { result: "N/A", verificationSummary: { verified: 1, notVerified: 1 }, productValidations: [expect.objectContaining({ verificationStatus: "verified", conformity: expect.objectContaining({ result: "C" }) }), expect.objectContaining({ verificationStatus: "not_verified", notVerifiedReason: "Referência indisponível no cais de expedição.", conformity: expect.objectContaining({ result: "N/A" }) })] } });
    expect(dbInserts[0]).toMatchObject({ module: "dispatch_control", result: "N/A", payload: expect.objectContaining({ verificationSummary: { verified: 1, notVerified: 1 } }) });
  });
});
