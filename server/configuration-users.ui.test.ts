import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/Configuration.tsx"), "utf8");
const router = fs.readFileSync(path.resolve(process.cwd(), "server/routers/quality.ts"), "utf8");
const panels = fs.readFileSync(path.resolve(process.cwd(), "shared/quality-panel-access.ts"), "utf8");

describe("Configuração de utilizadores e autorizações", () => {
  it("remove os cartões de criação geral e mantém a configuração centrada nos utilizadores", () => {
    expect(page).not.toContain("Nova área");
    expect(page).not.toContain("Novo plano");
    expect(page).not.toContain("Novo item de checklist");
    expect(page).toContain("Configuração operacional organizada");
    expect(page).toContain("Utilizadores e autorizações");
  });

  it("disponibiliza criação de utilizadores e edição explícita de autorização", () => {
    expect(page).toContain("Novo utilizador");
    expect(page).toContain("Tipo de autorização");
    expect(page).toContain("Criar utilizador");
    expect(page).toContain("Técnica/Técnico de Qualidade");
    expect(page).toContain("Responsável de Qualidade");
    expect(page).toContain("Consulta");
    expect(page).toContain("Painéis internos autorizados");
    expect(page).toContain("Painéis externos autorizados");
    expect(panels).toContain("Painel Hoje");
    expect(panels).toContain("Controlos Operacionais");
    expect(panels).toContain("I&D — controlo sensorial");
    expect(panels).toContain("Gestão de Ocorrências");
    expect(panels).toContain("I&D · Artisan");
    expect(panels).toContain("Quebras de produção");
    expect(page).toContain("trpc.quality.createPinProfile");
    expect(page).toContain("trpc.quality.updatePinProfileAccess");
    expect(page).toContain("trpc.quality.updatePinProfilePanels");
  });

  it("limita no servidor a criação e a alteração de autorizações à Responsável de Qualidade", () => {
    expect(router).toContain("createPinProfile: qualityManagerProcedure");
    expect(router).toContain("updatePinProfileAccess: qualityManagerProcedure");
    expect(router).toContain("Tem de permanecer pelo menos uma Responsável de Qualidade ativa.");
    expect(router).toContain("Não pode alterar as suas próprias autorizações a partir desta sessão.");
    expect(router).toContain("updatePinProfilePanels: qualityManagerProcedure");
    expect(router).toContain("A Responsável de Qualidade mantém acesso integral aos painéis.");
    expect(router).toContain("allowedExternalPanels");
  });
});
