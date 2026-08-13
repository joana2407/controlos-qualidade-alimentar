import { describe, expect, it } from "vitest";
import { calculatePlanCompliance, countOpenNonconformities, scopeToFactory } from "./factory.scope.logic";

const tasks = [
  { factoryId: 1, status: "completed" },
  { factoryId: 1, status: "pending" },
  { factoryId: 2, status: "completed" },
];

const ncs = [
  { factoryId: 1, status: "open", severity: "critical" },
  { factoryId: 1, status: "closed", severity: "critical" },
  { factoryId: 2, status: "open", severity: "medium" },
];

describe("segmentação operacional por fábrica", () => {
  it("devolve apenas os registos pertencentes à fábrica selecionada", () => {
    expect(scopeToFactory(tasks, 1)).toEqual([{ factoryId: 1, status: "completed" }, { factoryId: 1, status: "pending" }]);
    expect(scopeToFactory(tasks)).toHaveLength(3);
  });

  it("calcula o cumprimento do plano sobre as tarefas filtradas", () => {
    expect(calculatePlanCompliance(scopeToFactory(tasks, 1))).toBe(50);
    expect(calculatePlanCompliance(scopeToFactory(tasks, 2))).toBe(100);
  });

  it("mantém as NC abertas e críticas separadas por fábrica", () => {
    expect(countOpenNonconformities(scopeToFactory(ncs, 1))).toEqual({ open: 1, criticalOpen: 1 });
    expect(countOpenNonconformities(scopeToFactory(ncs, 2))).toEqual({ open: 1, criticalOpen: 0 });
  });
});
