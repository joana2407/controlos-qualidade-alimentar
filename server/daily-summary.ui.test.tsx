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

describe("resumo diário de incidências", () => {
  it("mostra a anotação diária e identifica a incidência que gerou Não Conformidade", () => {
    render(<Reports />);

    expect(screen.getByText("Resumo diário de incidências")).toBeTruthy();
    expect(screen.getByDisplayValue("Aguardar confirmação do fornecedor.")).toBeTruthy();
    expect(screen.getByText("Embalagem danificada")).toBeTruthy();
    expect(screen.getByText("Gerou NC")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("abre todos os dados e anotações de um controlo apenas no período filtrado", () => {
    render(<Reports />);

    fireEvent.click(screen.getByRole("button", { name: /detalhe/i }));

    expect(screen.getByText("Dados do controlo")).toBeTruthy();
    expect(screen.getByText("Superfície limpa e desinfetada.")).toBeTruthy();
    expect(screen.getByText("Criterio Limpeza")).toBeTruthy();
    expect(screen.getByText("Verificação visual concluída.")).toBeTruthy();
  });
});
