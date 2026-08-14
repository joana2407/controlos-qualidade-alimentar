// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    quality: { listFactories: { useQuery: () => ({ data: [{ code: "F1_FATIADO", name: "Fábrica 1 (Fatiado)" }] }) } },
    occurrences: {
      dashboard: { useQuery: () => ({ data: { total: 5, open: 2, closed: 3, overdue: 1, upcoming: 1, withoutEffectiveness: 1, monthly: [{ month: "2026-08", count: 5 }], byOrigin: [{ origin: "I", count: 3 }], byFactory: [{ factoryCode: "F1_FATIADO", count: 5 }], byScope: [{ scope: "M1-BPHF", count: 3 }], byBrcRequirement: [{ requirement: "4.11", count: 2 }], effectiveness: [{ effectiveness: "Satisfatória", count: 2 }] }, isLoading: false }) },
      list: { useQuery: () => ({ data: { data: [{ id: 1, number: 1, type: "NC", description: "Desvio de higiene", responsible: "Sabrina", implementationDueOn: new Date("2026-08-20"), occurredOn: new Date("2026-08-14"), factoryCode: "F1_FATIADO", origin: "I", status: "ABERTO" }] } }) },
    },
  },
}));
vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("recharts", () => ({ ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Bar: () => <div />, CartesianGrid: () => <div />, XAxis: () => <div />, YAxis: () => <div />, Tooltip: () => <div />, PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Cell: () => <div />, Legend: () => <div /> }));

import OccurrencesDashboard from "../client/src/pages/OccurrencesDashboard";

afterEach(cleanup);

describe("dashboard de ocorrências integrado", () => {
  it("preserva os KPIs, filtros e destino para a lista operacional", () => {
    render(<OccurrencesDashboard />);
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
    expect(screen.getByText("Total Ocorrências")).toBeTruthy();
    expect(screen.getByText("Sem Avaliação de Eficácia")).toBeTruthy();
    expect(screen.getByText("Âmbito SGSQA")).toBeTruthy();
    expect(screen.getByText("Por Requisito BRC Food V9")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Ver todas/ }).some((link) => link.getAttribute("href") === "/ocorrencias/lista")).toBe(true);
    expect(screen.getByText("Em Aberto").closest("a")?.getAttribute("href")).toBe("/ocorrencias/lista?status=ABERTO");
    expect(screen.getByText("Sem Avaliação de Eficácia").closest("a")?.getAttribute("href")).toBe("/ocorrencias/lista?semEficacia=true");
  });
});
