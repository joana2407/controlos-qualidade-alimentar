// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [] } }) },
      dashboard: { useQuery: vi.fn(() => ({ isLoading: false, data: { operationalDate: new Date("2026-08-20T10:00:00Z"), metrics: { pending: 0, overdue: 0, criticalOpen: 0, fragilePending: 0, completedToday: 0, dailyExecutionRate: 0 }, plannedControls: [], tasks: [], taskGroups: { today: [], tomorrow: [], thisWeek: [] }, criticalNcs: [] } })) },
      dailyIncidenceSummary: { useQuery: () => ({ data: { total: 0, withNonconformity: 0, withoutNonconformity: 0, note: null, incidences: [] } }) },
    },
  },
}));

vi.mock("@/components/quality/QualityUi", () => ({ SeverityBadge: () => <span>Severidade</span>, StatusBadge: () => <span>Estado</span> }));
vi.mock("wouter", () => ({ Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));

import QualityDashboard from "../client/src/pages/QualityDashboard";
import { trpc } from "../client/src/lib/trpc";

describe("painel Hoje — Plano do Dia", () => {
  afterEach(cleanup);

  it("mostra os estados vazios quando a Responsável não publicou controlos nem tarefas", () => {
    render(<QualityDashboard />);
    expect(screen.getByText("Sem controlos agendados")).toBeTruthy();
    expect(screen.getByText("Sem tarefas agendadas")).toBeTruthy();
    expect(screen.getAllByText("Incidências do dia").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tarefas atrasadas")).toBeNull();
    expect(screen.queryByText("Quebráveis pendentes")).toBeNull();
  });

  it("permite escolher outra data para consultar o planeamento respetivo", () => {
    render(<QualityDashboard />);
    const dateInput = screen.getByLabelText("Data a consultar no painel Hoje");
    fireEvent.change(dateInput, { target: { value: "2026-08-26" } });
    expect(screen.getByText("26/08/2026")).toBeTruthy();
  });

  it("abre o formulário do controlo agendado ainda por realizar", () => {
    vi.mocked(trpc.quality.dashboard.useQuery).mockReturnValue({ isLoading: false, data: { operationalDate: new Date("2026-08-20T10:00:00Z"), metrics: { pending: 0, overdue: 0, criticalOpen: 0, fragilePending: 0, completedToday: 0, dailyExecutionRate: 0 }, plannedControls: [{ id: 42, module: "bphf", factoryId: 1, responsible: "Sabrina Esteves", completed: false }], tasks: [], taskGroups: { today: [], tomorrow: [], thisWeek: [] }, criticalNcs: [] } } as any);
    render(<QualityDashboard />);

    expect(screen.getByRole("link", { name: "Abrir preenchimento de Verificação de BPHF" }).getAttribute("href")).toBe("/controlos/bphf?plannedTaskId=42&factoryId=1");
  });
});
