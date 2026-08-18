import { beforeEach, describe, expect, it, vi } from "vitest";
import { areas, controlPlans, correctiveActions, controlEntries, controlTasks, factories, fragileItems, nonconformities, qualityPinProfiles } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import { qualityRouter } from "./quality";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../storage", () => ({ storagePut: vi.fn(), storageGetSignedUrl: vi.fn() }));
vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));

const now = new Date(2026, 7, 14, 10, 0, 0);
const tasks = [
  { id: 1, factoryId: 1, status: "completed", dueAt: now, completedAt: now, module: "bphf", area: "Produção T", title: "BPHF F1", responsible: "Ana", assigneeProfileIds: [1] },
  { id: 2, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "metal_detectors", area: "Tradicional 1", title: "Metal F1", responsible: "Ana", assigneeProfileIds: [2] },
  { id: 3, factoryId: 2, status: "completed", dueAt: now, completedAt: now, module: "bphf", area: "Granel", title: "BPHF F2", responsible: "Bruno", assigneeProfileIds: [1] },
];
const initialTasks = tasks.map((task) => ({ ...task, assigneeProfileIds: [...task.assigneeProfileIds] }));
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
const profileRows = [{ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", active: "true", role: "technician" }, { id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", active: "true", role: "technician" }, { id: 3, name: "Joana Pina", title: "Resp. Qualidade", active: "true", role: "manager" }];
const plans: Array<{ id: number; title: string; module: "bphf"; areaId: number; factoryId: number; frequency: "daily"; active: "true" }> = [];
const fragile = [
  { id: 1, factoryId: 1, periodicity: "D", location: "Zona Tratamento Térmico", name: "Portas forno Anelar 1", status: "active" },
  { id: 2, factoryId: 1, periodicity: "S", location: "Zona Tratamento Térmico", name: "Iluminação Calhas", status: "active" },
  { id: 3, factoryId: 2, periodicity: "M", location: "Z. PRODUÇÃO", name: "Janelas-Exterior", status: "active" },
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
    if (table === qualityPinProfiles) return profileRows;
    if (table === controlPlans) return plans;
    if (table === fragileItems) return fragile;
    return [];
  };
  return {
    select: () => ({
      from: (table: unknown) => {
        const records = sourceFor(table);
        return {
          orderBy: async () => records,
          then: <T>(resolve: (value: unknown[]) => T | PromiseLike<T>) => Promise.resolve(records).then(resolve),
          where: () => ({ limit: async () => records, orderBy: async () => records }),
        };
      },
    }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { dbUpdates.push(values); return { success: true }; } }) }),
    insert: () => ({ values: (values: Record<string, unknown>) => { dbInserts.push(values); return { $returningId: async () => [{ id: dbInserts.length }], success: true }; } }),
  };
}

describe("procedimentos de qualidade por fábrica", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); tasks.splice(0, tasks.length, ...initialTasks.map((task) => ({ ...task, assigneeProfileIds: [...task.assigneeProfileIds] }))); plans.length = 0; dbUpdates.length = 0; dbInserts.length = 0; vi.clearAllMocks(); vi.mocked(getDb).mockResolvedValue(mockDatabase() as any); vi.mocked(storagePut).mockResolvedValue({ key: "dispatch-orders/3/encomenda.pdf", url: "/manus-storage/dispatch-orders/3/encomenda.pdf" }); vi.mocked(storageGetSignedUrl).mockResolvedValue("https://storage.example/encomenda.pdf"); });

  it("filtra o painel e as tarefas pela fábrica selecionada", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard({ factoryId: 1 });
    const filteredTasks = await caller.listTasks({ factoryId: 1 });
    expect(dashboard.tasks.map((task) => task.id)).toEqual([1, 2]);
    expect(dashboard.metrics).toMatchObject({ pending: 1, criticalOpen: 1, completedToday: 3, fragilePending: 1, dailyExecutionRate: 25 });
    expect(dashboard.moduleProgress.bphf).toMatchObject({ expected: 2, completed: 2, pending: [], percentage: 100 });
    expect(dashboard.moduleProgress.metal_detectors).toMatchObject({ expected: 1, completed: 0, pending: ["Metal F1"], percentage: 0 });
    expect(dashboard.moduleProgressByFactory.bphf).toEqual([{ factoryId: 1, expected: 2, completed: 2, registeredToday: 1, percentage: 100 }]);
    expect(dashboard.moduleProgressByFactory.metal_detectors).toEqual([{ factoryId: 1, expected: 1, completed: 0, registeredToday: 1, percentage: 0 }]);
    expect(filteredTasks.map((task) => task.id)).toEqual([1, 2]);
  });

  it("permite consultar a operação com um perfil PIN mesmo sem conta Manus", async () => {
    const pinOnlyContext = { ...createContext(), user: null, operatorProfile: { id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" as const } };
    const caller = qualityRouter.createCaller(pinOnlyContext);

    await expect(caller.metadata()).resolves.toMatchObject({ factories: factoryRows });
    await expect(caller.dashboard({ factoryId: 1 })).resolves.toMatchObject({ metrics: { dailyExecutionRate: 25 } });
  });

  it("não replica a obrigação diária quando existe um plano manual equivalente", async () => {
    plans.push({ id: 1, title: "BPHF diário", module: "bphf", areaId: 101, factoryId: 1, frequency: "daily", active: "true" });
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard({ factoryId: 1 });

    expect(dashboard.metrics.dailyExecutionRate).toBe(25);
    expect(dashboard.moduleProgress.bphf).toMatchObject({ expected: 2, completed: 2, percentage: 100 });
  });

  it("mantém as obrigações padrão mesmo quando não existem tarefas pontuais", async () => {
    tasks.length = 0;
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard({ factoryId: 1 });

    expect(dashboard.metrics.dailyExecutionRate).toBe(16.7);
    expect(dashboard.moduleProgress.bphf).toMatchObject({ expected: 1, completed: 1, registeredToday: 1, percentage: 100 });
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
    expect(report.filters).toMatchObject({ module: "bphf", result: "C", ncStatus: "open" });
  });

  it("gera uma incidência shelf-life e apresenta o relatório diário por fábrica", async () => {
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

  it("calcula as pendências de quebráveis a partir da última inspeção de cada ponto", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const factoryOne = await caller.fragilePending({ factoryId: 1 });
    const factoryTwoMonthly = await caller.fragilePending({ factoryId: 2, periodicity: "M" });
    expect(factoryOne.map((item) => item.id)).toEqual([2]);
    expect(factoryTwoMonthly.map((item) => item.id)).toEqual([3]);
    expect(factoryOne[0]?.lastInspectionAt).toBeNull();
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

  it("cria um ponto de quebráveis com fábrica, área e periodicidade", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const result = await caller.addFragileItem({ name: "Proteção acrílica da linha", location: "Embalamento primário", factoryId: 3, periodicity: "Q", itemType: "Plástico rígido" });
    expect(result).toEqual({ success: true });
    expect(dbInserts[0]).toMatchObject({ name: "Proteção acrílica da linha", location: "Embalamento primário", factoryId: 3, periodicity: "Q", itemType: "Plástico rígido", status: "active", createdBy: "quality-admin" });
  });

  it("extrai cliente, número e linhas de produto de uma encomenda PDF", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ orderNumber: "ENC-345", customer: "Cliente Norte", products: [{ name: "Pão de forma", orderedQuantity: 24 }, { name: "Pão brioche", orderedQuantity: 12 }], warnings: [] }) } }] } as any);
    const caller = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    const result = await caller.parseDispatchOrderPdf({ fileName: "encomenda.pdf", mimeType: "application/pdf", dataUrl: `data:application/pdf;base64,${Buffer.from("%PDF-1.4\nordem").toString("base64")}` });
    expect(result).toMatchObject({ orderNumber: "ENC-345", customer: "Cliente Norte", document: { name: "encomenda.pdf", url: "/manus-storage/dispatch-orders/3/encomenda.pdf" } });
    expect(result.products).toContainEqual({ name: "Pão de forma", orderedQuantity: 24 });
    expect(storagePut).toHaveBeenCalledWith(expect.stringContaining("dispatch-orders/1/"), expect.any(Buffer), "application/pdf");
    expect(invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3-flash-preview" }));
  });

  it("regista a expedição como incidência quando a temperatura falha", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const result = await caller.registerDispatchControl({ factoryId: 1, profile: "congelado", orderNumber: "ENC-100", customer: "Cliente Norte", deliveryNote: "GR-50", product: "Pão congelado", lot: "L-100", orderedBoxes: 24, dispatchedBoxes: 24, productLabelResult: "C", boxLabelResult: "C", productTemperature: -17, vehicleTemperature: -18, observations: "Produto acima do limite para congelados." });
    expect(result.conformity).toMatchObject({ result: "NC", productTemperatureResult: "NC", vehicleTemperatureResult: "C" });
    expect(result.incidence).toBe(true);
    expect(dbInserts[0]).toMatchObject({ module: "dispatch_control", result: "NC", factoryId: 1, area: "Expedição congelado", registeredByName: "Joana Pina" });
    expect(dbInserts).toHaveLength(1);
  });

  it("regista desvios de expedição sem criar NC automática", async () => {
    const caller = qualityRouter.createCaller(createContext());
    await caller.registerDispatchControl({ factoryId: 2, profile: "ambiente", orderNumber: "ENC-101", customer: "Cliente Centro", product: "Pão de forma", lot: "L-101", orderedBoxes: 25, dispatchedBoxes: 24, productLabelResult: "NC", boxLabelResult: "C", productTemperature: 18, vehicleTemperature: 20, observations: "Quantidade e rotulagem do produto divergentes." });
    expect(dbInserts[0]).toMatchObject({ module: "dispatch_control", result: "NC", factoryId: 2, area: "Expedição ambiente" });
    expect(dbInserts).toHaveLength(1);
  });
});
