import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const modulePath = fileURLToPath(new URL("../client/src/pages/ModuleControl.tsx", import.meta.url));
const moduleControl = readFileSync(modulePath, "utf8");

describe("Checklist mensal", () => {
  it("carrega também os pontos da Área/Zona Geral e concentra o resumo no cabeçalho", () => {
    expect(moduleControl).toMatch(/const names = new Set\(\s*\(checklistAreas\.data \?\? \[\]\)\.map\(item => item\.name\)\s*\)/);
    expect(moduleControl).toMatch(/<ModuleHeader\s+label="Checklist mensal"/);
    expect(moduleControl).toMatch(/<Label(?:\s+[^>]*)?>\s*Área\/Zona\s*<\/Label>/);
    expect(moduleControl).toContain("Preenchimento do mês");
    expect(moduleControl).toMatch(/monthlyFactories\.map\(\s*factory\s*=>/);
  });

  it("disponibiliza a gestão de pontos e Áreas/Zonas com criação, edição e eliminação", () => {
    expect(moduleControl).toContain("Gerir pontos e Áreas/Zonas");
    expect(moduleControl).toContain("Criar Área/Zona");
    expect(moduleControl).toContain("listChecklistAreas");
    expect(moduleControl).toContain("updateChecklistArea");
    expect(moduleControl).toContain("removeChecklistArea");
    expect(moduleControl).toContain("setManageOpen(true)");
    expect(moduleControl).toMatch(/<Dialog\s+open=\{manageOpen\}/);
    expect(moduleControl).toMatch(/aria-label=\{`Editar \$\{item\.label\}`\}/);
    expect(moduleControl).toMatch(/aria-label=\{`Eliminar \$\{item\.label\}`\}/);
  });
});
