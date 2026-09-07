import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers/rd-sensory.ts"), "utf8");

describe("fecho de projetos sensoriais de I&D", () => {
  it("reserva o fecho à Responsável de Qualidade", () => {
    expect(routerSource).toMatch(/closeProject:\s*qualityManagerProcedure/);
  });

  it("exige conclusões finais não vazias no servidor", () => {
    expect(routerSource).toMatch(/finalAssessment:\s*z\.string\(\)\.trim\(\)\.min\(2\)\.max\(3000\)/);
  });
});
