// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }] } }) },
      dashboard: { useQuery: () => ({ isLoading: false, data: { operationalDate: new Date("2026-08-18T10:00:00Z"), metrics: { pending: 1, overdue: 0, criticalOpen: 0, fragilePending: 7, completedToday: 2, dailyExecutionRate: 50 }, tasks: [], criticalNcs: [] } }) },
      dailyIncidenceSummary: { useQuery: () => ({ data: { total: 3, withNonconformity: 1, withoutNonconformity: 2, note: "Confirmar fecho do turno." } }) },
    },
  },
}));

vi.mock("@/components/quality/QualityUi", () => ({ SeverityBadge: () => <span>Severidade</span>, StatusBadge: () => <span>Estado</span> }));
vi.mock("wouter", () => ({ Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));

import QualityDashboard from "../client/src/pages/QualityDashboard";

describe("painel Hoje — indicador de quebráveis", () => {
  afterEach(cleanup);
  it("apresenta o cartão de quebráveis pendentes com o total devolvido pelo painel e aceita ativação por teclado", async () => {
    const user = userEvent.setup();
    render(<QualityDashboard />);
    expect(screen.getByText("Quebráveis pendentes")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    const link = screen.getByRole("link", { name: /abrir painel de controlo de quebráveis pendentes/i });
    expect(link.getAttribute("href")).toBe("/controlos/fragile_items");
    link.focus();
    expect(document.activeElement).toBe(link);
    expect(link.tabIndex).toBe(0);
    const onActivate = vi.fn((event: MouseEvent) => event.preventDefault());
    link.addEventListener("click", onActivate, { once: true });
    await user.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("apresenta o relatório diário de incidências e respetivo atalho", () => {
    render(<QualityDashboard />);
    expect(screen.getAllByText("Relatório do dia")).toHaveLength(1);
    expect(screen.getByText("Confirmar fecho do turno.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /abrir relatório/i }).getAttribute("href")).toBe("/relatorios");
  });
});
