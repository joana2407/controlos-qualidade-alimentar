// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-08-13T10:00:00Z");

vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ canManage: true }) }));
vi.mock("wouter", () => ({ Link: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dashboard: { invalidate: vi.fn() }, listTasks: { invalidate: vi.fn() }, listNcs: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], areas: [] } }) },
      accessStatus: { useQuery: () => ({ data: { profiles: [] } }) },
      dashboard: { useQuery: () => ({ data: { moduleProgress: { bphf: { expected: 2, completed: 1, registeredToday: 1, pending: ["BPHF — Produção"], percentage: 50, lastCompletedAt: now } } } }) },
      listTasks: { useQuery: () => ({ data: [{ id: 1, title: "Verificação diária", module: "bphf", area: "Produção", factoryId: 1, responsible: "Equipa", dueAt: now, status: "completed", completedByName: "Neuza Antunes", completedByTitle: "Tec. Qualidade" }] }) },
      createTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      completeTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      reports: { useQuery: () => ({ isLoading: false, data: { planCompliance: 100, openNcs: 1, criticalOpen: 0, modules: [], areas: [], trends: [], recentEntries: [{ id: 2, title: "BPHF Produção", module: "bphf", area: "Produção", completedAt: now, result: "C", registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] } }) },
      listNcs: { useQuery: () => ({ data: [] }) },
      dailyIncidences: { useQuery: () => ({ isLoading: false, data: { total: 1, byFactory: [{ factoryName: "Fábrica 1 (Fatiado)", total: 1 }], incidences: [{ id: 3, title: "Incidência shelf-life", module: "shelf_life", area: "Shelf-life", factoryName: "Fábrica 1 (Fatiado)", severity: "medium", status: "open", detectedAt: now, reportedByName: "Joana Pina", reportedByTitle: "Resp. Qualidade" }] } }) },
      dailyIncidenceSummary: { useQuery: () => ({ isLoading: false, refetch: vi.fn(), data: { date: now, total: 1, withNonconformity: 1, withoutNonconformity: 0, note: "", noteUpdatedByName: null, incidences: [{ id: 3, title: "Incidência shelf-life", module: "shelf_life", area: "Shelf-life", factoryName: "Fábrica 1 (Fatiado)", generatedNonconformity: true, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade" }] } }) },
      saveDailyIncidenceNote: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      updateIncidence: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

import Controls from "../client/src/pages/Controls";
import Reports from "../client/src/pages/Reports";

describe("autoria operacional nas páginas", () => {
  afterEach(cleanup);

  it("mostra quem concluiu uma tarefa na lista operacional", () => {
    render(<Controls />);
    expect(screen.getByText("Concluído por: Neuza Antunes · Tec. Qualidade")).toBeTruthy();
  });

  it("mostra a linha temporal e o estado de preenchimento em cada cartão de controlo", () => {
    render(<Controls />);
    expect(screen.getAllByText("Estado de preenchimento").length).toBeGreaterThanOrEqual(8);
    expect(screen.getByLabelText("Linha temporal de conclusão de Verificação de BPHF: Em preenchimento")).toBeTruthy();
    expect(screen.getByLabelText("Conclusão de Verificação de BPHF: 50%")).toBeTruthy();
    expect(screen.getByText("1 de 2 verificações")).toBeTruthy();
  });

  it("mostra quem registou os controlos e incidências nos relatórios", () => {
    render(<Reports />);
    expect(screen.getByText("Registado por: Sabrina Esteves · Tec. Qualidade")).toBeTruthy();
    expect(screen.getByText("Registado por: Joana Pina · Resp. Qualidade")).toBeTruthy();
  });
});
