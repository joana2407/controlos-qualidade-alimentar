import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const panelPath = fileURLToPath(new URL("../client/src/components/quality/FragileOperationsPanel.tsx", import.meta.url));
const stylesPath = fileURLToPath(new URL("../client/src/index.css", import.meta.url));
const panel = readFileSync(panelPath, "utf8");
const styles = readFileSync(stylesPath, "utf8");

describe("disposição da inspeção de quebráveis", () => {
  it("mantém o formulário acessível pelo botão Inspecionar e fora da coluna lateral", () => {
    expect(panel).toContain('id="registo-inspecao-quebraveis"');
    expect(panel).toContain("function openInspection(item: any)");
    expect(styles).toContain("#registo-inspecao-quebraveis { grid-column: 1 / -1; }");
  });
});
