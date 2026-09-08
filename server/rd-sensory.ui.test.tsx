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
    expect(page).toContain("XLSX.writeFile");
  });

  it("regista a rota própria para o controlo de I&D", () => {
    expect(routes).toContain('path={"/id-sensorial"}');
  });

  it("protege no servidor anexos, edição e eliminação através do perfil de Qualidade", () => {
    expect(router).toContain("createProject: qualityOperatorProcedure");
    expect(router).toContain("uploadEvaluationPhoto: qualityOperatorProcedure");
    expect(router).toContain("updateProject: qualityManagerProcedure");
    expect(router).toContain("updateEvaluation: qualityManagerProcedure");
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
