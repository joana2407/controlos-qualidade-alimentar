import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const panelPath = fileURLToPath(new URL("../client/src/components/quality/FragileOperationsPanel.tsx", import.meta.url));
const panel = readFileSync(panelPath, "utf8");

describe("disposição da inspeção de quebráveis", () => {
  it("abre a inspeção num painel próprio e sem deslocar a página", () => {
    expect(panel).toContain("function openInspection(item: FragilePoint)");
    expect(panel).toContain("setInspectionOpen(true)");
    expect(panel).toContain("<Dialog open={inspectionOpen}");
    expect(panel).not.toContain("scrollIntoView");
    expect(panel).not.toContain("lg:grid-cols-[1.1fr_.9fr]");
  });
});
