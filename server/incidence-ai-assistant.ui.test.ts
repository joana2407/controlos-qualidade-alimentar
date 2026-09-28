import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assistant = readFileSync("client/src/components/quality/IncidenceAiAssistant.tsx", "utf8");
const router = readFileSync("server/routers/quality.ts", "utf8");
const schema = readFileSync("drizzle/schema.ts", "utf8");


describe("assistente IA de Incidências", () => {
  it("apresenta apoio contextual e não substitui a decisão da Responsável de Qualidade", () => {
    expect(assistant).toContain("Assistente IA de Incidências");
    expect(assistant).toContain("As decisões permanecem sempre com a Responsável de Qualidade");
    expect(assistant).toContain("incidenceAiAssist");
    expect(assistant).toContain("generatedNonconformity");
  });

  it("permite ensinar orientações apenas com o perfil Joana Pina", () => {
    expect(assistant).toContain("joana pina");
    expect(assistant).toContain("teachIncidenceAi");
    expect(router).toContain("ensureJoanaQualityManager");
    expect(router).toContain("As orientações do agente só podem ser ensinadas");
  });

  it("persiste a memória de orientações com tema, autoria e data", () => {
    expect(schema).toContain('mysqlTable("incidence_ai_guidance"');
    expect(schema).toContain("createdByProfileId");
    expect(schema).toContain("createdByName");
    expect(router).toContain("listIncidenceAiGuidance");
  });

  it("mantém a regra de gestão externa quando já existe NC gerada", () => {
    expect(router).toContain("o tratamento é gerido no sistema externo");
    expect(assistant).toContain("Esta incidência já gerou NC e o tratamento é gerido no site externo.");
  });
});
