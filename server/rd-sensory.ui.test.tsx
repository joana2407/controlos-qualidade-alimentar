import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/RDSensory.tsx"), "utf8");
const routes = fs.readFileSync(path.resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const router = fs.readFileSync(path.resolve(process.cwd(), "server/routers/rd-sensory.ts"), "utf8");

describe("interface de avaliação sensorial de I&D", () => {
  it("inclui projeto, avaliações por provador, acompanhamento e fecho", () => {
    expect(page).toContain("Novo projeto de I&D");
    expect(page).toContain("Registar avaliação");
    expect(page).toContain("Teste / subpasta");
    expect(page).toContain("Teste de I&D");
    expect(page).toContain("Testes / subpastas do projeto");
    expect(page).toContain("Novo teste");
    expect(page).toContain("Data do teste");
    expect(page).toContain("Receita do teste");
    expect(page).toContain("Receita:");
    expect(page).toContain("Editar teste");
    expect(page).toContain("Nova avaliação neste teste");
    expect(page).toContain("Fechar teste");
    expect(page).toContain("Evolução por tempo de vida");
    expect(page).toContain("Fechar projeto de I&D");
    expect(page).toContain("Provador");
    expect(page).toContain("Conclusões finais do projeto");
    expect(page).toContain("Preencha as conclusões finais para fechar o projeto.");
    expect(page).toContain('list="rd-existing-projects"');
    expect(page).toContain("Usar projeto existente");
    expect(page).toContain("Selecionar projeto");
    expect(page).toContain("Pesquisar por nome, produto ou código");
    expect(page).toContain("Fotografias da avaliação");
    expect(page).toContain("Excel");
    expect(page).toContain("Editar projeto de I&D");
    expect(page).toContain("Eliminar este projeto de I&amp;D?");
    expect(page).toContain("Eliminar esta avaliação?");
    expect(page).toContain('id="rd-project-factory"');
    expect(page).toContain("Fábrica / linha");
    expect(page).toContain("Editar a minha avaliação");
    expect(page).toContain("As minhas avaliações");
    expect(page).toContain("XLSX.writeFile");
  });

  it("não regista uma rota interna de I&D na aplicação principal", () => {
    expect(routes).not.toContain('path={"/id-sensorial"}');
    expect(routes).not.toContain('import("./pages/RDSensory")');
  });

  it("protege no servidor anexos, gestão sensível e edição de avaliações", () => {
    expect(router).toContain("createProject: qualityOperatorProcedure");
    expect(router).toContain("createTest: qualityOperatorProcedure");
    expect(router).toContain("updateTest: qualityManagerProcedure");
    expect(router).toContain("closeTest: qualityManagerProcedure");
    expect(router).toContain("testDate: z.coerce.date()");
    expect(router).toContain("recipe: z.string().trim().max(6000).optional()");
    expect(router).toContain("uploadEvaluationPhoto: qualityOperatorProcedure");
    expect(router).toContain("updateProject: qualityManagerProcedure");
    expect(router).toContain("updateEvaluation: qualityOperatorProcedure");
    expect(router).toContain("evaluation.createdByProfileId === profile.id");
    expect(router).toContain("deleteProject: qualityManagerProcedure");
    expect(router).toContain("deleteEvaluation: qualityManagerProcedure");
    expect(router).toContain("deletedAt");
  });

  it("mostra a criação de projetos às Técnicas sem lhes atribuir ações de gestão", () => {
    expect(page).toContain("{canOperate && <Button");
    expect(page).toContain("showProjectForm && (canOperate || (editingProjectId !== null && canManage))");
    expect(page).toContain("selected.status === \"active\" && canManage");
  });
});
