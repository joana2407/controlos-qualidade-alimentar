// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-08-13T10:00:00Z");

vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ canManage: true }) }));
vi.mock("wouter", () => ({ Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dashboard: { invalidate: vi.fn() }, listTasks: { invalidate: vi.fn() }, listNcs: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }, { id: 2, name: "Fábrica 2 (granel)" }], areas: [] } }) },
      accessStatus: { useQuery: () => ({ data: { profiles: [] } }) },
      dashboard: { useQuery: () => ({ data: { metrics: { fragilePending: 1 }, moduleProgress: { bphf: { expected: 2, completed: 1, registeredToday: 1, pending: ["BPHF — Produção"], percentage: 50, lastCompletedAt: now } }, moduleProgressByFactory: { bphf: [{ factoryId: 1, expected: 1, completed: 1, registeredToday: 1, percentage: 100 }, { factoryId: 2, expected: 1, completed: 0, registeredToday: 0, percentage: 0 }] } } }) },
      controlObservations: { useQuery: () => ({ isLoading: false, data: { entries: [{ id: 55, title: "BPHF Produção", area: "Produção", result: "C", notes: "Observação parcial registada.", completedAt: now, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] } }) },
      listTasks: { useQuery: () => ({ data: [{ id: 1, title: "Verificação diária", module: "bphf", area: "Produção", factoryId: 1, responsible: "Equipa", dueAt: now, status: "completed", completedByName: "Neuza Antunes", completedByTitle: "Tec. Qualidade" }, { id: 2, title: "Tarefa pendente", description: "Confirmar o registo operacional.", module: "bphf", area: "Produção", factoryId: 1, responsible: "Sabrina Esteves", assigneeProfileIds: [1], dueAt: now, status: "pending" }] }) },
      createTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      publishDailyPlan: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      completeTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      uploadTaskReportPhoto: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      updateTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      reports: { useQuery: () => ({ isLoading: false, data: { planCompliance: 100, openNcs: 1, criticalOpen: 0, modules: [], areas: [], trends: [], recentEntries: [{ id: 2, title: "BPHF Produção", module: "bphf", area: "Produção", completedAt: now, result: "C", registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }], filteredEntries: [{ id: 2, title: "BPHF Produção", module: "bphf", area: "Produção", completedAt: now, result: "C", notes: null, payload: {}, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] } }) },
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
    expect(screen.getByText("1 de 2 fábricas/linhas")).toBeTruthy();
    expect(screen.getByText("Pendente hoje: 1 fábrica/linha por concluir")).toBeTruthy();
    expect(screen.getAllByText("Por fábrica / linha").length).toBeGreaterThanOrEqual(7);
    expect(screen.getByRole("link", { name: /abrir registos pendentes de bphf para fábrica 2/i }).getAttribute("href")).toBe("/controlos/bphf?factoryId=2&pending=1");
    expect(screen.getByRole("button", { name: /preencher relatório/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Editar Tarefa pendente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar Tarefa pendente" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /abrir observações de bphf para fábrica 2/i }));
    expect(screen.getByText("Observações de Fábrica 2 (granel)")).toBeTruthy();
    expect(screen.getByText("Observação parcial registada.")).toBeTruthy();
  });

  it("mostra quem registou os controlos e incidências nos relatórios", () => {
    render(<Reports />);
    expect(screen.getByText("Registado por: Sabrina Esteves · Tec. Qualidade")).toBeTruthy();
    expect(screen.getByText("Registado por: Joana Pina · Resp. Qualidade")).toBeTruthy();
  });
});
