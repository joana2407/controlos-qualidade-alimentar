import { beforeEach, describe, expect, it, vi } from "vitest";
import { correctiveActions, controlEntries, controlTasks, nonconformities } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";
import { qualityRouter } from "./quality";

vi.mock("../db", () => ({ getDb: vi.fn() }));

const now = new Date();
const tasks = [
  { id: 1, factoryId: 1, status: "completed", dueAt: now, completedAt: now, module: "bphf", area: "Produção T", title: "BPHF F1", responsible: "Ana" },
  { id: 2, factoryId: 1, status: "pending", dueAt: now, completedAt: null, module: "metal_detectors", area: "Tradicional 1", title: "Metal F1", responsible: "Ana" },
  { id: 3, factoryId: 2, status: "completed", dueAt: now, completedAt: now, module: "bphf", area: "Granel", title: "BPHF F2", responsible: "Bruno" },
];
const entries = [
  { id: 1, factoryId: 1, module: "bphf", area: "Produção T", result: "C", completedAt: now },
  { id: 2, factoryId: 1, module: "metal_detectors", area: "Tradicional 1", result: "NC", completedAt: now },
  { id: 3, factoryId: 2, module: "bphf", area: "Granel", result: "C", completedAt: now },
];
const ncs = [
  { id: 1, factoryId: 1, status: "open", severity: "critical", module: "metal_detectors", area: "Tradicional 1", title: "NC F1", detectedAt: now },
  { id: 2, factoryId: 1, status: "closed", severity: "medium", module: "bphf", area: "Produção T", title: "NC fechada F1", detectedAt: now },
  { id: 3, factoryId: 2, status: "open", severity: "high", module: "bphf", area: "Granel", title: "NC F2", detectedAt: now },
];
const actions = [
  { id: 1, factoryId: 1, status: "pending", dueAt: now },
  { id: 2, factoryId: 2, status: "pending", dueAt: now },
];

function createContext(): TrpcContext {
  return {
    user: { id: 1, openId: "quality-admin", name: "Ana", email: "ana@example.com", loginMethod: "manus", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now },
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
    return [];
  };
  return {
    select: () => ({
      from: (table: unknown) => {
        const records = sourceFor(table);
        return {
          orderBy: async () => records,
          then: <T>(resolve: (value: unknown[]) => T | PromiseLike<T>) => Promise.resolve(records).then(resolve),
        };
      },
    }),
  };
}

describe("procedimentos de qualidade por fábrica", () => {
  beforeEach(() => vi.mocked(getDb).mockResolvedValue(mockDatabase() as any));

  it("filtra o painel e as tarefas pela fábrica selecionada", async () => {
    const caller = qualityRouter.createCaller(createContext());
    const dashboard = await caller.dashboard({ factoryId: 1 });
    const filteredTasks = await caller.listTasks({ factoryId: 1 });
    expect(dashboard.tasks.map((task) => task.id)).toEqual([1, 2]);
    expect(dashboard.metrics).toMatchObject({ pending: 1, criticalOpen: 1, completedToday: 2, dailyExecutionRate: 50 });
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
  });
});
