import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers/rd-sensory.ts"), "utf8");

describe("fecho de projetos sensoriais de I&D", () => {
  it("permite que Técnicas de Qualidade criem projetos", () => {
    expect(routerSource).toMatch(/createProject:\s*qualityOperatorProcedure/);
  });

  it("permite associar uma fábrica ou linha ao projeto de I&D", () => {
    expect(routerSource).toContain("factoryId: z.number().int().positive().nullable().optional()");
    expect(routerSource).toContain("A fábrica selecionada não existe.");
  });

  it("permite à Técnica autora editar a sua avaliação enquanto o projeto está em curso", () => {
    expect(routerSource).toMatch(/updateEvaluation:\s*qualityOperatorProcedure/);
    expect(routerSource).toContain("evaluation.createdByProfileId === profile.id");
    expect(routerSource).toContain("Apenas a Técnica que registou esta avaliação pode editá-la.");
    expect(routerSource).toContain("Um projeto fechado só pode ser alterado pela Responsável de Qualidade.");
    expect(routerSource).toContain("updatedByProfileId: profile.id");
  });

  it("reserva o fecho à Responsável de Qualidade", () => {
    expect(routerSource).toMatch(/closeProject:\s*qualityManagerProcedure/);
  });

  it("exige conclusões finais não vazias no servidor", () => {
    expect(routerSource).toMatch(/finalAssessment:\s*z\.string\(\)\.trim\(\)\.min\(2\)\.max\(3000\)/);
  });
});
