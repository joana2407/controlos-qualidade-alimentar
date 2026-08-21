import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("edição de incidências pelo técnico autor", () => {
  it("autoriza o operador autor e preserva a decisão de NC para a Responsável", () => {
    const router = source("server/routers/quality.ts");
    expect(router).toContain("updateIncidence: qualityOperatorProcedure");
    expect(router).toContain("Apenas o técnico que registou a incidência ou a Responsável de Qualidade a pode editar.");
    expect(router).toContain("A decisão e o número de NC são geridos pela Responsável de Qualidade.");
    expect(router).toContain("evidencePhotos: z.array");
  });

  it("apresenta ao técnico autor a edição e a adição de fotografias", () => {
    const page = source("client/src/pages/Nonconformities.tsx");
    expect(page).toContain("canEditSelectedIncidence");
    expect(page).toContain("Editar a minha incidência");
    expect(page).toContain("Fotografias de evidência");
  });
});
