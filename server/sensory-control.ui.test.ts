import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("controlo sensorial", () => {
  it("recolhe validade sem apresentar o campo Área", () => {
    const page = readFileSync(new URL("../client/src/pages/ModuleControl.tsx", import.meta.url), "utf8");
    const sensory = page.slice(page.indexOf("function Sensory"), page.indexOf("type DispatchLot"));

    expect(sensory).toContain("<Label>Validade</Label>");
    expect(sensory).toContain('type="date"');
    expect(sensory).toContain("payload: { product, lot, validity");
    expect(sensory).not.toContain("<Label>Área</Label>");
  });
});
