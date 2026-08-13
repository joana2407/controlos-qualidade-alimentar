// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }] } }) },
      dashboard: { useQuery: () => ({ isLoading: false, data: { metrics: { pending: 1, overdue: 0, criticalOpen: 0, fragilePending: 7, completedToday: 2, dailyExecutionRate: 50 }, tasks: [], criticalNcs: [] } }) },
    },
  },
}));

vi.mock("@/components/quality/QualityUi", () => ({ SeverityBadge: () => <span>Severidade</span>, StatusBadge: () => <span>Estado</span> }));
vi.mock("wouter", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a> }));

import QualityDashboard from "../client/src/pages/QualityDashboard";

describe("painel Hoje — indicador de quebráveis", () => {
  it("apresenta o cartão de quebráveis pendentes com o total devolvido pelo painel", () => {
    render(<QualityDashboard />);
    expect(screen.getByText("Quebráveis pendentes")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });
});
