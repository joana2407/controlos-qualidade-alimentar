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

  it("mantém todos os filtros legíveis numa grelha responsiva e conserva as ações principais", () => {
    expect(reportsPage).toContain("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between");
    expect(reportsPage).toContain("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7");
    expect(reportsPage).toContain("<div className=\"min-w-0 space-y-1\"><label className=\"text-xs font-medium\">Fábrica / linha");
    expect(reportsPage).toContain("<RotateCcw className=\"mr-1 h-3.5 w-3.5\" />Limpar");
    expect(reportsPage).toContain("Exportar Excel completo");
  });
});
