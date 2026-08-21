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
    expect(page).not.toContain("Referência 2025:");
    expect(page).toContain("<Notes value={value.notes} onChange={(notes) => update(item.id, { notes })} />");
    expect(page).toContain("Sugerir com IA");
    expect(page).toContain("suggestFoodDefenseMeasure");
  });

  it("expõe uma sugestão IA autorizada e estruturada para a medida de controlo", () => {
    const router = readFileSync(new URL("../server/routers/quality.ts", import.meta.url), "utf8");
    expect(router).toContain("suggestFoodDefenseMeasure");
    expect(router).toContain('module: "food_defense"');
    expect(router).toContain('name: "food_defense_control_measure"');
  });

  it("inclui a explicação operacional Food Defense na Plataforma", () => {
    const guides = readFileSync(new URL("../client/src/lib/helpGuides.ts", import.meta.url), "utf8");
    expect(guides).toContain('id: "food_defense"');
    expect(guides).toContain("Avaliação anual de vulnerabilidades");
  });
});
