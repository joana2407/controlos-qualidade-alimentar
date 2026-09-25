import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nonconformitiesPage = readFileSync(
  new URL("../client/src/pages/Nonconformities.tsx", import.meta.url),
  "utf8"
);
const qualityRouter = readFileSync(
  new URL("./routers/quality.ts", import.meta.url),
  "utf8"
);

describe("gestão externa de Não Conformidades e reincidências de Quebráveis", () => {
  it("substitui o tratamento interno por uma indicação de gestão externa após NC gerada", () => {
    expect(nonconformitiesPage).toContain("Não Conformidade gerada — gestão externa");
    expect(nonconformitiesPage).toContain("Tratamento gerido externamente");
    expect(nonconformitiesPage).toContain("!selected.generatedNonconformity ? (");
    expect(nonconformitiesPage).toContain("Gestão externa de NC");
  });

  it("apresenta o histórico de reincidências de Quebráveis com evidências", () => {
    expect(nonconformitiesPage).toContain("Histórico de reincidências — Quebráveis");
    expect(nonconformitiesPage).toContain("NC reincidente");
    expect(nonconformitiesPage).toContain("Evidência da reincidência:");
  });

  it("mostra o contador de reincidências na lista geral", () => {
    expect(nonconformitiesPage).toContain("item.fragileRecurrenceHistory.length > 0");
    expect(nonconformitiesPage).toContain("1 reincidência");
    expect(nonconformitiesPage).toContain("reincidências de Quebráveis");
  });

  it("permite abrir diretamente as incidências do colaborador recomendado", () => {
    expect(nonconformitiesPage).toContain("openCollaboratorIncidences");
    expect(nonconformitiesPage).toContain("setCollaboratorId(String(alert.collaboratorId))");
    expect(nonconformitiesPage).toContain("Abrir as ${alert.total} incidências de ${alert.collaboratorName}");
  });

  it("protege no servidor o tratamento externo e a agregação da reincidência", () => {
    expect(qualityRouter).toContain("O tratamento desta incidência é gerido no sistema externo de Não Conformidades.");
    expect(qualityRouter).toContain("Esta incidência já gerou uma Não Conformidade; o respetivo tratamento é gerido no sistema externo.");
    expect(qualityRouter).toContain("fragileRecurrenceHistory");
    expect(qualityRouter).toContain("mergedIntoFragileIncidenceId");
  });
});
