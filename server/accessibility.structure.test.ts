import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const project = process.cwd();
const source = (relativePath: string) => readFileSync(resolve(project, relativePath), "utf8");

describe("estrutura de acessibilidade dos ecrãs operacionais", () => {
  it("mantém foco visível e não remove o indicador global de foco", () => {
    const css = source("client/src/index.css");
    expect(css).toContain("outline-ring/50");
    expect(css).not.toMatch(/outline:\s*none/);
  });

  it("fornece rótulos e controlos semânticos nos formulários críticos", () => {
    const controls = source("client/src/pages/ModuleControl.tsx");
    const nonconformities = source("client/src/pages/Nonconformities.tsx");
    expect(controls.match(/<Label>/g)?.length).toBeGreaterThanOrEqual(8);
    expect(controls).toContain("<Button");
    expect(controls).toContain("<Textarea");
    expect(nonconformities.match(/<Label>/g)?.length).toBeGreaterThanOrEqual(5);
    expect(nonconformities).toContain("Gerar Não Conformidade");
  });

  it("exprime os estados críticos por texto, ícone e não apenas por cor", () => {
    const ui = source("client/src/components/quality/QualityUi.tsx");
    const moduleControl = source("client/src/pages/ModuleControl.tsx");
    expect(ui).toContain('label: "C"');
    expect(ui).toContain('label: "NC"');
    expect(moduleControl).toContain("Regra crítica ativa");
    expect(moduleControl).toContain("incidência crítica");
  });
});
