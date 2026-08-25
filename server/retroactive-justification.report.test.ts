import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("rastreabilidade de controlos retroativos nos Relatórios", () => {
  it("apresenta a data prevista, a data de realização e a justificação no detalhe", async () => {
    const source = await readFile(new URL("../client/src/pages/Reports.tsx", import.meta.url), "utf8");

    expect(source).toContain("Rastreabilidade de preenchimento retroativo");
    expect(source).toContain("Data operacional prevista");
    expect(source).toContain("Data de realização");
    expect(source).toContain("retroactiveJustification");
  });
});
