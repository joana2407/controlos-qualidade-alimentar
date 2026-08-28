import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const reportsPath = fileURLToPath(new URL("../client/src/pages/Reports.tsx", import.meta.url));
const reportsPage = readFileSync(reportsPath, "utf8");

describe("filtros contextuais dos Relatórios", () => {
  it("inclui pesquisa livre e variáveis específicas por controlo", () => {
    expect(reportsPage).toContain("Filtros específicos do controlo");
    expect(reportsPage).toContain("Pesquisa livre nos detalhes do relatório");
    for (const label of [
      "Colaborador inspecionado",
      "Ponto / tipo de verificação",
      "Linha",
      "Produto",
      "Lote",
      "Validade",
      "Cliente",
      "Ponto de amostragem",
      "Categoria",
      "Teste",
      "Equipamento",
      "Localização",
      "Estado",
      "Periodicidade",
      "Analista",
      "Guia de transporte",
      "Triagem",
    ]) {
      expect(reportsPage).toContain(`label: \"${label}\"`);
    }
  });

  it("limpa a pesquisa detalhada quando o controlo selecionado muda", () => {
    expect(reportsPage).toContain("setModule(value === \"all\" ? \"\" : value); setDetailFilters({}); setDetailSearch(\"\");");
  });
});
