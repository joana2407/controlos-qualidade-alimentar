import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/RDSensory.tsx"), "utf8");
const routes = fs.readFileSync(path.resolve(process.cwd(), "client/src/App.tsx"), "utf8");

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
  });

  it("regista a rota própria para o controlo de I&D", () => {
    expect(routes).toContain('path={"/id-sensorial"}');
  });
});
