import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("contexto lateral de fábrica ou linha nos módulos de controlo", () => {
  it("usa o contexto lateral para registos BPHF e quebráveis sem seletor local duplicado", async () => {
    const source = await readFile(new URL("../client/src/pages/ModuleControl.tsx", import.meta.url), "utf8");

    expect(source).toContain('import { useControlScope } from "@/contexts/ControlScopeContext";');
    expect(source).toContain("const { factoryId } = useControlScope();");
    expect(source).toContain("factoryId: Number(factoryId)");
    expect(source).toContain('<Bphf {...props} areas={bphfAreas} />');
    expect(source).toContain('<FragileOperationsPanel {...props} factoryId={factoryId} />');
    expect(source).not.toContain("Label>Fábrica / linha produtiva");
    expect(source).not.toContain("setFactoryId");
  });
});
