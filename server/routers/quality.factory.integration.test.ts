import { beforeEach, describe, expect, it, vi } from "vitest";
import { areas, checklistItemFactories, checklistItems, controlPlans, correctiveActions, controlEntries, controlTasks, dailyReportArchives, dailyReportArchiveViews, factories, fragileAreas, fragileItems, nonconformities, qualityPinProfiles } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import { notifyOwner } from "../_core/notification";
import { qualityRouter } from "./quality";

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
  { id: 1, name: "Fábrica 1 (Fatiado)" },
  { id: 2, name: "Fábrica 2 (granel)" },
  { id: 3, name: "Fabrica 3 (Sem Gluten)" },
];
const areaRows = [{ id: 101, name: "Produção T", group: "bphf", factoryId: 1, active: "true" }];
const monthlyRows = [{ id: 301, active: "true" }, { id: 302, active: "true" }];
const monthlyAssignments = [{ checklistItemId: 301, factoryId: 1 }, { checklistItemId: 302, factoryId: 1 }];
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
    if (table === checklistItems) return monthlyRows;
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
        return {
          orderBy: async () => records,
          then: <T>(resolve: (value: unknown[]) => T | PromiseLike<T>) => Promise.resolve(records).then(resolve),
          where: () => ({ limit: async () => records, orderBy: async () => records, then: <T>(resolve: (value: unknown[]) => T | PromiseLike<T>) => Promise.resolve(records).then(resolve) }),
        };
      },
    }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { dbUpdates.push(values); return { success: true }; } }) }),
    insert: () => ({ values: (values: Record<string, unknown>) => { dbInserts.push(values); return { $returningId: async () => [{ id: dbInserts.length }], success: true, onDuplicateKeyUpdate: async () => ({ success: true }) }; } }),
  };
}

describe("procedimentos de qualidade por fábrica", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); tasks.splice(0, tasks.length, ...initialTasks.map((task) => ({ ...task, assigneeProfileIds: [...task.assigneeProfileIds] }))); plans.length = 0; archiveRows.length = 0; archiveViewRows.length = 0; dbUpdates.length = 0; dbInserts.length = 0; vi.clearAllMocks(); vi.mocked(getDb).mockResolvedValue(mockDatabase() as any); vi.mocked(storagePut).mockResolvedValue({ key: "dispatch-orders/3/encomenda.pdf", url: "/manus-storage/dispatch-orders/3/encomenda.pdf" }); vi.mocked(storageGetSignedUrl).mockResolvedValue("https://storage.example/encomenda.pdf"); });

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

  it("autoriza Food Defense nas três fábricas quando a avaliação anual foi publicada para a técnica", async () => {
    addPublishedControlTask("food_defense", 1, [1]);
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    const access = await caller.controlAuthorization({ module: "food_defense", factoryId: 3 });

    expect(access).toMatchObject({ allowed: true, taskId: expect.any(Number) });
  });

  it("permite ao perfil Gestão consultar, mas bloqueia operações de alteração", async () => {
    const caller = qualityRouter.createCaller(createContext({ id: 9, name: "Gestão", title: "Consulta", role: "viewer" }));

    await expect(caller.metadata()).resolves.toMatchObject({ factories: factoryRows });
    await expect(caller.addBphfInspectionEmployee({ name: "Colaborador bloqueado" })).rejects.toMatchObject({ code: "FORBIDDEN" });
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

  it("mostra sempre o progresso anual Food Defense nas três fábricas", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard();

    expect(dashboard.moduleProgressByFactory.food_defense).toEqual([
      { factoryId: 1, expected: 131, completed: 0, registeredToday: 0, percentage: 0 },
      { factoryId: 2, expected: 131, completed: 0, registeredToday: 0, percentage: 0 },
      { factoryId: 3, expected: 131, completed: 0, registeredToday: 0, percentage: 0 },
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

      expect(dashboard.moduleProgressByFactory.metal_detectors[0]).toMatchObject({ factoryId: 1, expected: 1, completed: 1, percentage: 100 });
      expect(dashboard.moduleProgressByFactory.metal_detectors[0]).not.toHaveProperty("pendingTaskId");
      expect(dashboard.moduleProgress.metal_detectors.pending).toEqual([]);
      expect(listedTasks.map((task) => task.id)).not.toContain(511);
      expect(access).toMatchObject({ allowed: false, isPreviousPending: false });
    } finally {
      entries.splice(-3, 3);
      areaRows.splice(-3, 3);
    }
  });

  it("não mantém Checklist Mensal como pendência quando todos os itens aplicáveis foram registados", async () => {
    const previousDate = new Date(2026, 7, 13, 10, 0, 0);
    tasks.push({ id: 512, factoryId: 1, status: "pending", dueAt: previousDate, completedAt: null, module: "monthly_checklist", area: "Plano do Dia", title: "Plano do Dia — Checklist F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    entries.push({ id: 512, factoryId: 1, module: "monthly_checklist", area: "Produção", result: "C", completedAt: now, payload: { plannedTaskId: 512, plannedDate: previousDate.toISOString(), checklistItemId: 301 } } as any, { id: 513, factoryId: 1, module: "monthly_checklist", area: "Produção", result: "C", completedAt: now, payload: { plannedTaskId: 512, plannedDate: previousDate.toISOString(), checklistItemId: 302 } } as any);
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
    entries.push({ id: 77, factoryId: 1, module: "temperature_controls", area: "Área da Qualidade", result: "NC", completedAt: now, payload: { equipment: [{ id: "f1-freezer-1", name: "Equipamento de congelação 1", area: "Área da Qualidade", limit: -18, temperature: -16, result: "NC", notes: "Ajuste solicitado" }, { id: "f1-freezer-2", name: "Equipamento de congelação 2", area: "Área da Qualidade", limit: -18, temperature: -19, result: "C", notes: "" }] } } as any);
    const caller = qualityRouter.createCaller(createContext());

    const results = await caller.temperatureHistory({ startDate: now, endDate: now, equipmentId: "f1-freezer-1" });

    expect(results).toEqual([expect.objectContaining({ equipmentId: "f1-freezer-1", temperature: -16, result: "NC", notes: "Ajuste solicitado" })]);
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
    expect(dashboard.moduleProgress.bphf).toMatchObject({ expected: 24, completed: 2, registeredToday: 2, percentage: 8.3 });
    expect(dashboard.moduleProgressByFactory.bphf).toEqual([
      { factoryId: 1, expected: 12, completed: 1, registeredToday: 1, percentage: 8.3, pendingTaskId: 4 },
      { factoryId: 2, expected: 12, completed: 1, registeredToday: 1, percentage: 8.3, pendingTaskId: 5 },
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

  it("conclui uma pendência sensorial após o registo integral da verificação", async () => {
    const previousDueAt = new Date(2026, 7, 13, 10, 0, 0);
    tasks.push({ id: 80, factoryId: 1, status: "pending", dueAt: previousDueAt, completedAt: null, module: "sensory", area: "Plano do Dia", title: "Plano do Dia — Sensorial F1", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    await caller.createEntry({ module: "sensory", title: "Controlo sensorial — Pão de forma", area: "Produção", factoryId: 1, result: "C", plannedTaskId: 80, performedAt: "2026-08-13", retroactiveReason: "technical_unavailability", payload: { product: "Pão de forma", lot: "L-1" } });

    expect(dbUpdates.at(-1)).toMatchObject({ status: "completed", completedByProfileId: 1, completedByName: "Sabrina Esteves" });
  });

  it("permite antecipar um controlo futuro atribuído e regista a data prevista", async () => {
    const futureDueAt = new Date(2026, 7, 18, 10, 0, 0);
    tasks.push({ id: 89, factoryId: 1, status: "pending", dueAt: futureDueAt, completedAt: null, module: "temperature_controls", area: "Plano do Dia", title: "Plano do Dia — Temperaturas antecipado", responsible: "Sabrina Esteves", assigneeProfileIds: [1] });
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));

    const authorization = await caller.controlAuthorization({ module: "temperature_controls", factoryId: 1, plannedTaskId: 89 });
    await caller.createEntry({ module: "temperature_controls", title: "Temperaturas antecipadas", area: "Área da Qualidade", factoryId: 1, result: "C", plannedTaskId: 89, payload: { equipment: [{ id: "f1-freezer-1" }, { id: "f1-freezer-2" }] } });

    expect(authorization).toMatchObject({ allowed: true, taskId: 89, dueAt: futureDueAt, isPreviousPending: false, isFuturePlanned: true });
    expect(dbInserts.at(-1)).toMatchObject({ payload: { equipment: [{ id: "f1-freezer-1" }, { id: "f1-freezer-2" }], plannedTaskId: 89, plannedDate: futureDueAt.toISOString(), registeredAgainstPreviousPlan: false, registeredAheadOfPlannedDate: true, actualVerificationDate: "2026-08-14" } });
    expect(dbUpdates.at(-1)).toMatchObject({ status: "completed", completedByProfileId: 1, completedByName: "Sabrina Esteves" });
  });

  it("cria uma tarefa pontual com descrição e responsáveis atribuídos", async () => {
    const caller = qualityRouter.createCaller(createContext());
    await caller.createTask({ title: "Verificação geral", description: "Confirmar a condição da área.", factoryId: 1, dueAt: now, assigneeProfileIds: [1, 2] });

    expect(dbInserts[0]).toMatchObject({ title: "Verificação geral", description: "Confirmar a condição da área.", area: "Sem área", factoryId: 1, assigneeProfileIds: [1, 2], responsible: "Sabrina Esteves, Neuza Antunes" });
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
});
