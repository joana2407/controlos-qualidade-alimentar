import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOOD_DEFENSE_CRITERIA, FOOD_DEFENSE_RISK_GUIDANCE } from "../client/src/lib/foodDefenseCatalog";

describe("checklist anual Food Defense", () => {
  it("inclui os critérios extraídos da checklist e a matriz de vulnerabilidade", () => {
    expect(FOOD_DEFENSE_CRITERIA.length).toBeGreaterThan(120);
    expect(new Set(FOOD_DEFENSE_CRITERIA.map((item) => item.section)).size).toBeGreaterThan(10);
    expect(FOOD_DEFENSE_RISK_GUIDANCE.map((item) => item.min)).toEqual([6, 3, 0]);
  });

  it("pede avaliação individual e risco para cada critério NC", () => {
    const page = readFileSync(new URL("../client/src/pages/ModuleControl.tsx", import.meta.url), "utf8");
    expect(page).toContain("Conclua todos os critérios da checklist Food Defense");
    expect(page).toContain("Vulnerabilidade (V)");
    expect(page).toContain("Ação indicada:");
  });
});
