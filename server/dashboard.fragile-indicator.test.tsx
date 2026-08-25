// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }] } }) },
      dashboard: { useQuery: () => ({ isLoading: false, data: { operationalDate: new Date("2026-08-18T10:00:00Z"), metrics: { pending: 1, overdue: 0, criticalOpen: 0, fragilePending: 7, completedToday: 2, dailyExecutionRate: 50 }, tasks: [], criticalNcs: [] } }) },
      dailyIncidenceSummary: { useQuery: () => ({ data: { total: 3, withNonconformity: 1, withoutNonconformity: 2, note: "Confirmar fecho do turno.", incidences: [] } }) },
      dailyReportArchiveAttention: { useQuery: () => ({ isLoading: false, data: { count: 1, revisions: [{ id: 41, operationalDate: new Date("2026-08-14T12:00:00Z"), revision: 2, revisionReason: "Registo retroativo concluído." }] } }) },
    },
  },
}));

vi.mock("@/components/quality/QualityUi", () => ({ SeverityBadge: () => <span>Severidade</span>, StatusBadge: () => <span>Estado</span> }));
vi.mock("wouter", () => ({ Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));

import QualityDashboard from "../client/src/pages/QualityDashboard";

describe("painel Hoje — resumo operacional diário", () => {
  afterEach(cleanup);
  it("apresenta incidências do dia e remove o indicador de quebráveis pendentes", () => {
    render(<QualityDashboard />);
    expect(screen.getAllByText("Incidências do dia").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.queryByText("Quebráveis pendentes")).toBeNull();
    expect(screen.queryByText("Tarefas atrasadas")).toBeNull();
  });

  it("apresenta o relatório diário de incidências e respetivo atalho", () => {
    render(<QualityDashboard />);
    expect(screen.getAllByText("Relatório do dia")).toHaveLength(1);
    expect(screen.getByText("Confirmar fecho do turno.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /abrir relatório/i }).getAttribute("href")).toBe("/relatorios");
  });

  it("alerta para uma revisão retroativa ainda por consultar e encaminha para a versão", () => {
    render(<QualityDashboard />);
    expect(screen.getByText(/revisão retroativa por consultar/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /abrir 1 revisão.*pendente/i }).getAttribute("href")).toBe("/relatorios?archiveId=41");
  });
});
