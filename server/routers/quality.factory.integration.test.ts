import { beforeEach, describe, expect, it, vi } from "vitest";
import { correctiveActions, controlEntries, controlTasks, factories, fragileItems, nonconformities } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { qualityRouter } from "./quality";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../storage", () => ({ storagePut: vi.fn() }));

const now = new Date();
const tasks = [
  { id: 1, factoryId: 1, status: "completed", dueAt: now, completedAt: now, module: "bphf", area: "Produção T", title: "BPHF F1", responsible: "Ana" },
  { id: 2, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "metal_detectors", area: "Tradicional 1", title: "Metal F1", responsible: "Ana" },
  { id: 3, factoryId: 2, status: "completed", dueAt: now, completedAt: now, module: "bphf", area: "Granel", title: "BPHF F2", responsible: "Bruno" },
];
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
    insert: () => ({ values: async (values: Record<string, unknown>) => { dbInserts.push(values); return { success: true }; } }),
  };
}

describe("procedimentos de qualidade por fábrica", () => {
  beforeEach(() => { dbUpdates.length = 0; dbInserts.length = 0; vi.clearAllMocks(); vi.mocked(getDb).mockResolvedValue(mockDatabase() as any); });

  it("filtra o painel e as tarefas pela fábrica selecionada", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard({ factoryId: 1 });
    const filteredTasks = await caller.listTasks({ factoryId: 1 });
    expect(dashboard.tasks.map((task) => task.id)).toEqual([1, 2]);
    expect(dashboard.metrics).toMatchObject({ pending: 1, criticalOpen: 1, completedToday: 3, fragilePending: 1, dailyExecutionRate: 50 });
    expect(filteredTasks.map((task) => task.id)).toEqual([1, 2]);
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

  it("gera uma incidência shelf-life e apresenta o relatório diário por fábrica", async () => {
    const caller = qualityRouter.createCaller(createContext());
    await caller.createEntry({
      module: "shelf_life",
      title: "Incidência shelf-life — Pão de forma",
      area: "Shelf-life",
      result: "NC",
      notes: "Bolor identificado na amostra.",
      payload: { product: "Pão de forma", lot: "L-001", validity: "2026-08-13", reason: "Bolor identificado" },
      createNonconformity: true,
      severity: "medium",
      factoryId: 2,
    });
    expect(dbInserts[0]).toMatchObject({ module: "shelf_life", registeredByProfileId: 3, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade" });
    expect(dbInserts[1]).toMatchObject({ module: "shelf_life", title: "Incidência shelf-life — Pão de forma", factoryId: 2, status: "open", severity: "medium", reportedByProfileId: 3, reportedByName: "Joana Pina" });

    const daily = await caller.dailyIncidences({ date: now, factoryId: 1 });
    expect(daily.total).toBe(2);
    expect(daily.byFactory).toEqual([{ factoryName: "Fábrica 1 (Fatiado)", total: 2 }]);
    expect(daily.incidences.map((incidence) => incidence.id)).toEqual([1, 2]);
  });

  it("exige um perfil PIN ativo para registar controlos e reserva as tarefas à Responsável", async () => {
    const noOperator = qualityRouter.createCaller(createContext(null));
    await expect(noOperator.createEntry({ module: "bphf", title: "Verificação BPHF", area: "Produção", result: "C" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const technician = qualityRouter.createCaller(createContext({ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }));
    await expect(technician.createTask({ title: "Tarefa pontual", module: "bphf", area: "Produção", factoryId: 1, dueAt: now, responsible: "Sabrina Esteves" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(technician.addArea({ name: "Área reservada", module: "bphf", factoryId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("guarda o perfil que concluiu a tarefa e cria o respetivo registo de controlo", async () => {
    const caller = qualityRouter.createCaller(createContext({ id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" }));
    await caller.completeTask({ id: 2, result: "C" });
    expect(dbUpdates[0]).toMatchObject({ status: "completed", completedByProfileId: 2, completedByName: "Neuza Antunes", completedByTitle: "Tec. Qualidade" });
    expect(dbInserts[0]).toMatchObject({ registeredByProfileId: 2, registeredByName: "Neuza Antunes", registeredByTitle: "Tec. Qualidade" });
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

  it("cria um ponto de quebráveis com fábrica, área e periodicidade", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const result = await caller.addFragileItem({ name: "Proteção acrílica da linha", location: "Embalamento primário", factoryId: 3, periodicity: "Q", itemType: "Plástico rígido" });
    expect(result).toEqual({ success: true });
    expect(dbInserts[0]).toMatchObject({ name: "Proteção acrílica da linha", location: "Embalamento primário", factoryId: 3, periodicity: "Q", itemType: "Plástico rígido", status: "active", createdBy: "quality-admin" });
  });
});
