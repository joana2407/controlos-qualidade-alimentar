import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const controlsPage = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/Controls.tsx"), "utf8");
const qualityRouter = fs.readFileSync(path.resolve(process.cwd(), "server/routers/quality.ts"), "utf8");
const schema = fs.readFileSync(path.resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
const moduleControl = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/ModuleControl.tsx"), "utf8");
const todayDashboard = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/QualityDashboard.tsx"), "utf8");

describe("adendas aos planos BPHF", () => {
  it("permite abrir uma adenda num plano original e selecionar verificações adicionais", () => {
    expect(controlsPage).toContain("Adenda BPHF");
    expect(controlsPage).toContain("Adicionar verificação ao plano BPHF");
    expect(controlsPage).toContain("Verificações adicionais");
    expect(controlsPage).toContain("Publicar adenda BPHF");
    expect(controlsPage).toContain("já incluída");
  });

  it("protege a adenda no servidor e impede critérios repetidos", () => {
    expect(qualityRouter).toContain("addBphfPlanAddendum: qualityManagerProcedure");
    expect(qualityRouter).toContain("additionalCriteria");
    expect(qualityRouter).toContain("As verificações selecionadas já fazem parte deste plano ou de uma adenda anterior.");
    expect(qualityRouter).toContain("parentTaskId: parent.id");
    expect(qualityRouter).toContain("planRevision");
  });

  it("mantém a rastreabilidade da versão original e da adenda na tarefa", () => {
    expect(schema).toContain("parentTaskId");
    expect(schema).toContain("planRevision");
    expect(controlsPage).toContain("Plano original · versão");
    expect(controlsPage).toContain("Adenda · versão");
    expect(controlsPage).toContain("ligada ao plano original");
    expect(controlsPage).toContain("Publicado em");
  });

  it("gera a adenda no mesmo âmbito da tarefa original e não reabre o plano concluído", () => {
    expect(qualityRouter).toContain("factoryId: parent.factoryId");
    expect(qualityRouter).toContain("dueAt: parent.dueAt");
    expect(qualityRouter).toContain("status: \"pending\" as const");
    expect(qualityRouter).toContain("plannedCoverage: buildPlannedCoverage");
    expect(qualityRouter).toContain("if (parent.status === \"cancelled\")");
  });

  it("integra os critérios das adendas no formulário BPHF e associa cada registo à respetiva tarefa", () => {
    expect(qualityRouter).toContain("const relatedBphfTasks");
    expect(qualityRouter).toContain("bphfCriterionTaskIds");
    expect(moduleControl).toContain("Plano atualizado ·");
    expect(moduleControl).toContain("bphfPlannedTaskIds");
    expect(moduleControl).toContain("plannedTaskId: bphfCriterionTaskIds?.[criterion] ?? plannedTaskId");
  });

  it("identifica no Painel Hoje que a tarefa BPHF é uma adenda e mostra o critério acrescentado", () => {
    expect(todayDashboard).toContain("Adenda ao plano · versão");
    expect(todayDashboard).toContain("Inclui:");
    expect(todayDashboard).toContain("control.parentTaskId");
  });
});

export {};
