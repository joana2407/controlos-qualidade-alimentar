// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [] } }) },
      dashboard: { useQuery: () => ({ isLoading: false, data: { operationalDate: new Date("2026-08-20T10:00:00Z"), metrics: { pending: 0, overdue: 0, criticalOpen: 0, fragilePending: 0, completedToday: 0, dailyExecutionRate: 0 }, plannedControls: [], tasks: [], taskGroups: { today: [], tomorrow: [], thisWeek: [] }, criticalNcs: [] } }) },
      dailyIncidenceSummary: { useQuery: () => ({ data: { total: 0, withNonconformity: 0, withoutNonconformity: 0, note: null } }) },
    },
  },
}));

vi.mock("@/components/quality/QualityUi", () => ({ SeverityBadge: () => <span>Severidade</span>, StatusBadge: () => <span>Estado</span> }));
vi.mock("wouter", () => ({ Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));

import QualityDashboard from "../client/src/pages/QualityDashboard";

describe("painel Hoje — Plano do Dia", () => {
  afterEach(cleanup);

  it("mostra os estados vazios quando a Responsável não publicou controlos nem tarefas", () => {
    render(<QualityDashboard />);
    expect(screen.getByText("Sem controlos agendados")).toBeTruthy();
    expect(screen.getByText("Sem tarefas agendadas")).toBeTruthy();
  });
});
