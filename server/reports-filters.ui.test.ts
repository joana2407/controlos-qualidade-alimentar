import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const reportsPath = fileURLToPath(new URL("../client/src/pages/Reports.tsx", import.meta.url));
const reportsPage = readFileSync(reportsPath, "utf8");
const qualityRouterPath = fileURLToPath(new URL("../server/routers/quality.ts", import.meta.url));
const qualityRouter = readFileSync(qualityRouterPath, "utf8");

describe("filtros contextuais dos Relatórios", () => {
  it("inclui pesquisa livre e variáveis específicas por controlo", () => {
    expect(reportsPage).toContain("Filtros específicos do controlo");
    expect(reportsPage).toContain("Pesquisa livre nos detalhes do relatório");
    for (const label of [
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

  it("distingue a técnica que preencheu do colaborador inspecionado ou associado", () => {
    expect(reportsPage).toContain("Téc. responsável pelo preenchimento");
    expect(reportsPage).toContain('label className="text-xs font-medium">Colaborador');
    expect(reportsPage).toContain("listBphfInspectionEmployees?.useQuery?.");
    expect(reportsPage).toContain("Filtrar por colaborador inspecionado ou associado");
    expect(qualityRouter).toContain("payload.collaboratorName");
  });

  it("permite selecionar mais do que um controlo e envia todos os selecionados ao servidor", () => {
    expect(reportsPage).toContain("const [selectedModules, setSelectedModules]");
    expect(reportsPage).toContain("Selecionar um ou mais controlos");
    expect(reportsPage).toContain("selectedModules.includes(item.id)");
    expect(reportsPage).toContain("modules: selectedModules.length");
    expect(qualityRouter).toContain("modules: z.array(qualityModuleSchema)");
    expect(qualityRouter).toContain("selectedModules.includes(entry.module)");
  });

  it("mantém todos os filtros legíveis numa grelha responsiva e conserva as ações principais", () => {
    expect(reportsPage).toContain("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between");
    expect(reportsPage).toContain("grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7");
    expect(reportsPage).toContain('className="min-w-0 space-y-1"');
    expect(reportsPage).toContain("Fábrica / linha");
    expect(reportsPage).toContain('<RotateCcw className="mr-1 h-3.5 w-3.5" />');
    expect(reportsPage).toContain("Limpar");
    expect(reportsPage).toContain("Exportar Excel completo");
  });
});
