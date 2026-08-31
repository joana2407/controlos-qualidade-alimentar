// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const now = new Date("2026-08-13T10:00:00Z");

vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ canManage: true }) }));
vi.mock("wouter", () => ({ Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a>, useLocation: () => ["/controlos", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dashboard: { invalidate: vi.fn() }, listTasks: { invalidate: vi.fn() }, listNcs: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }, { id: 2, name: "Fábrica 2 (granel)" }], areas: [{ id: 41, name: "Linha 1", group: "metal", factoryId: 1 }, { id: 42, name: "Linha 2", group: "metal", factoryId: 1 }] } }) },
      accessStatus: { useQuery: () => ({ data: { profiles: [{ id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", active: true, isConfigured: true }] } }) },
      dashboard: { useQuery: () => ({ data: { metrics: { fragilePending: 1 }, plannedControls: [{ id: 77, module: "internal_analysis", factoryId: null, completed: false }], moduleProgress: { bphf: { expected: 2, completed: 1, registeredToday: 1, pending: ["BPHF — Produção"], percentage: 50, lastCompletedAt: now } }, moduleProgressByFactory: { bphf: [{ factoryId: 1, expected: 1, completed: 1, registeredToday: 1, percentage: 100 }, { factoryId: 2, expected: 1, completed: 0, registeredToday: 0, percentage: 0 }] } } }) },
      controlObservations: { useQuery: () => ({ isLoading: false, data: { entries: [{ id: 55, title: "BPHF Produção", area: "Produção", result: "C", notes: "Observação parcial registada.", completedAt: now, registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] } }) },
      listTasks: { useQuery: () => ({ data: [{ id: 1, title: "Verificação diária", module: "bphf", area: "Produção", factoryId: 1, responsible: "Equipa", dueAt: now, status: "completed", completedByName: "Neuza Antunes", completedByTitle: "Tec. Qualidade" }, { id: 2, title: "Tarefa pendente", description: "Confirmar o registo operacional.", module: "bphf", area: "Produção", factoryId: 1, responsible: "Sabrina Esteves", assigneeProfileIds: [1], dueAt: now, status: "pending" }] }) },
      createTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      publishDailyPlan: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      duplicateDailyPlan: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      completeTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      uploadTaskReportPhoto: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      updateTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateControlEntry: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteControlEntry: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
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
    expect(screen.getByText(/Pendente em \d{2}\/\d{2}\/2026: 1 fábrica\/linha por concluir/)).toBeTruthy();
    expect(screen.getAllByText(/Por fábrica \/ linha em \d{2}\/\d{2}\/2026/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Data de análise de completude")).toBeTruthy();
    expect(screen.getByRole("link", { name: /abrir registos pendentes de bphf para fábrica 2/i }).getAttribute("href")).toContain("plannedDate=");
    expect(screen.getByRole("button", { name: /preencher relatório/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Editar Tarefa pendente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar Tarefa pendente" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /abrir observações de bphf para fábrica 2/i }));
    expect(screen.getByText("Observações de Fábrica 2 (granel)")).toBeTruthy();
    expect(screen.getByText("Observação parcial registada.")).toBeTruthy();
  });

  it("abre a análise de completude com a data atual", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T10:00:00Z"));
    try {
      render(<Controls />);
      expect((screen.getByLabelText("Data de análise de completude") as HTMLInputElement).value).toBe("2026-08-13");
    } finally {
      vi.useRealTimers();
    }
  });

  it("abre uma tarefa futura de Análises internas em modo de preenchimento antecipado", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T10:00:00Z"));
    try {
      render(<Controls />);
      const card = screen.getByText("Análises internas").closest(".group");

      expect(card?.querySelector('a[href="/controlos/internal_analysis?plannedDate=2026-08-13&plannedTaskId=77"]')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("transporta a data de completitude escolhida para os cartões e os acessos por fábrica", () => {
    render(<Controls />);
    fireEvent.change(screen.getByLabelText("Data de análise de completude"), { target: { value: "2026-08-12" } });

    expect(screen.getByRole("link", { name: /abrir registos pendentes de bphf para fábrica 2/i }).getAttribute("href")).toBe("/controlos/bphf?factoryId=2&pending=1&plannedDate=2026-08-12");
    const bphfCard = screen.getByText("Verificação de BPHF").closest(".group");
    expect(bphfCard?.querySelector('a[href="/controlos/bphf?plannedDate=2026-08-12"]')).toBeTruthy();
  });

  it("permite adicionar várias datas úteis antes de publicar o Plano do Dia", () => {
    render(<Controls />);
    fireEvent.click(screen.getByRole("button", { name: "Novo plano" }));
    const dateInput = screen.getByLabelText("Data a adicionar") as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar data" }));
    fireEvent.change(dateInput, { target: { value: "2026-09-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar data" }));

    expect(screen.getByLabelText("Datas selecionadas para o Plano do Dia").textContent).toMatch(/01\/09\/2026/);
    expect(screen.getByLabelText("Datas selecionadas para o Plano do Dia").textContent).toMatch(/02\/09\/2026/);
  });

  it("apresenta as linhas de Detetores da fábrica escolhida para seleção no Plano do Dia", () => {
    render(<Controls />);
    fireEvent.click(screen.getByRole("button", { name: "Novo plano" }));
    fireEvent.click(screen.getByLabelText("Fábrica 1 (Fatiado)"));
    fireEvent.click(screen.getByLabelText("Detetores"));

    expect(screen.getByText("Linhas de Detetores a inspecionar")).toBeTruthy();
    expect(screen.getByLabelText("Linha 1").getAttribute("data-state")).toBe("checked");
    expect(screen.getByLabelText("Linha 2").getAttribute("data-state")).toBe("checked");
    fireEvent.click(screen.getByLabelText("Linha 2"));
    expect(screen.getByLabelText("Linha 2").getAttribute("data-state")).toBe("unchecked");
  });

  it("mostra quem registou os controlos nos relatórios", () => {
    render(<Reports />);
    expect(screen.getByText("Registado por: Sabrina Esteves · Tec. Qualidade")).toBeTruthy();
  });
});
