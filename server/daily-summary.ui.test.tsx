// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const day = new Date(2026, 7, 14, 12, 0, 0);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { reports: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [] } }) },
      reports: { useQuery: () => ({ data: { modules: [], areas: [], trends: [], recentEntries: [], filteredEntries: [{ id: 44, title: "Verificação de higiene", module: "bphf", area: "Produção", completedAt: day, result: "C", notes: "Superfície limpa e desinfetada.", payload: { collaboratorId: 99992, collaboratorName: "Marco Monteiro", criterioLimpeza: "C", observacao: "Verificação visual concluída.", editHistory: [{ action: "updated" }], offlineManualIncidence: true, offlineQueuedAt: "2026-08-26T14:46:44.496Z", offlineSyncId: "client-id" }, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }, { id: 45, title: "Teste rápido ovo", module: "internal_analysis", area: "Ovo", completedAt: day, result: "C", notes: null, payload: { samples: [{ product: "Pão de forma", lot: "L-20260901", client: "Cliente Norte", result: "negative" }] }, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }], planCompliance: 0, openNcs: 0, criticalOpen: 0 }, isLoading: false }) },
      listNcs: { useQuery: () => ({ data: [] }) },
      dailyIncidences: { useQuery: () => ({ data: { incidences: [], total: 0, byFactory: [] } }) },
      dailyIncidenceSummary: { useQuery: () => ({ data: { date: day, total: 1, withNonconformity: 1, withoutNonconformity: 0, note: "Aguardar confirmação do fornecedor.", noteUpdatedByName: "Sabrina Esteves", incidences: [{ id: 12, title: "Embalagem danificada", module: "bphf", area: "Embalagem", factoryName: "Fábrica 1", generatedNonconformity: true, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] }, isLoading: false, refetch: vi.fn() }) },
      saveDailyIncidenceNote: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      updateIncidence: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      updateControlEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      deleteControlEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
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

    expect(screen.queryByText("Superfície limpa e desinfetada.")).toBeNull();
    expect(screen.queryByText("Dados registados")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /detalhe/i })[0]!);

    expect(screen.getAllByText("Dados registados").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Superfície limpa e desinfetada.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Critério de limpeza").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Verificação visual concluída.").length).toBeGreaterThan(0);
    expect(screen.getByText("Marco Monteiro")).toBeTruthy();
    expect(screen.queryByText("99992")).toBeNull();
    expect(screen.queryByText(/edit history/i)).toBeNull();
    expect(screen.queryByText(/offline sync id/i)).toBeNull();
    expect(screen.queryByText(/offline queued at/i)).toBeNull();
  });

  it("mostra a identificação da amostra de Análises diretamente na linha do relatório", () => {
    render(<Reports />);

    expect(screen.getByText("Produto: Pão de forma · Lote: L-20260901 · Cliente: Cliente Norte")).toBeTruthy();
  });
});
