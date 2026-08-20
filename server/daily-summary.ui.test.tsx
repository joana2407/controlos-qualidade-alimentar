// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const day = new Date(2026, 7, 14, 12, 0, 0);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [] } }) },
      reports: { useQuery: () => ({ data: { modules: [], areas: [], trends: [], recentEntries: [], filteredEntries: [{ id: 44, title: "Verificação de higiene", module: "bphf", area: "Produção", completedAt: day, result: "C", notes: "Superfície limpa e desinfetada.", payload: { criterioLimpeza: "C", observacao: "Verificação visual concluída." }, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }], planCompliance: 0, openNcs: 0, criticalOpen: 0 }, isLoading: false }) },
      listNcs: { useQuery: () => ({ data: [] }) },
      dailyIncidences: { useQuery: () => ({ data: { incidences: [], total: 0, byFactory: [] } }) },
      dailyIncidenceSummary: { useQuery: () => ({ data: { date: day, total: 1, withNonconformity: 1, withoutNonconformity: 0, note: "Aguardar confirmação do fornecedor.", noteUpdatedByName: "Sabrina Esteves", incidences: [{ id: 12, title: "Embalagem danificada", module: "bphf", area: "Embalagem", factoryName: "Fábrica 1", generatedNonconformity: true, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] }, isLoading: false, refetch: vi.fn() }) },
      saveDailyIncidenceNote: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      updateIncidence: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

import Reports from "../client/src/pages/Reports";

afterEach(cleanup);

describe("relatório operacional unificado", () => {
  it("usa uma única zona de incidências, sem data, gravação ou exportação autónomas", () => {
    render(<Reports />);

    expect(screen.getByText("Controlos e informações registadas")).toBeTruthy();
    expect(screen.getByText("Incidências no período filtrado")).toBeTruthy();
    expect(screen.queryByText("Resumo diário de incidências")).toBeNull();
    expect(screen.getByRole("button", { name: /exportar excel completo/i })).toBeTruthy();
  });

  it("abre todos os dados e anotações de um controlo apenas no período filtrado", () => {
    render(<Reports />);

    fireEvent.click(screen.getByRole("button", { name: /detalhe/i }));

    expect(screen.getAllByText("Dados registados").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Superfície limpa e desinfetada.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Criterio Limpeza").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Verificação visual concluída.").length).toBeGreaterThan(0);
  });
});
