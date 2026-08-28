// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [] } }) },
      dashboard: { useQuery: vi.fn(() => ({ isLoading: false, data: { operationalDate: new Date("2026-08-20T10:00:00Z"), metrics: { pending: 0, overdue: 0, criticalOpen: 0, fragilePending: 0, completedToday: 0, dailyExecutionRate: 0 }, plannedControls: [], tasks: [], taskGroups: { today: [], tomorrow: [], thisWeek: [] }, criticalNcs: [] } })) },
      dailyIncidenceSummary: { useQuery: () => ({ data: { total: 0, withNonconformity: 0, withoutNonconformity: 0, pendingTreatment: 0, note: null, incidences: [] } }) },
    },
  },
}));

vi.mock("@/components/quality/QualityUi", () => ({ SeverityBadge: () => <span>Severidade</span>, StatusBadge: () => <span>Estado</span> }));
vi.mock("wouter", () => ({ Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));

import QualityDashboard from "../client/src/pages/QualityDashboard";
import { trpc } from "../client/src/lib/trpc";

if (!HTMLElement.prototype.hasPointerCapture) HTMLElement.prototype.hasPointerCapture = () => false;
if (!HTMLElement.prototype.setPointerCapture) HTMLElement.prototype.setPointerCapture = () => undefined;
if (!HTMLElement.prototype.releasePointerCapture) HTMLElement.prototype.releasePointerCapture = () => undefined;
if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => undefined;

describe("painel Hoje — Plano do Dia", () => {
  afterEach(cleanup);

  it("mostra os estados vazios quando a Responsável não publicou controlos nem tarefas", () => {
    render(<QualityDashboard />);
    expect(screen.getByText("Sem controlos agendados")).toBeTruthy();
    expect(screen.getByText("Sem tarefas agendadas")).toBeTruthy();
    expect(screen.getAllByText("Incidências do dia").length).toBeGreaterThan(0);
    expect(screen.getAllByText("A aguardar decisão").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tarefas atrasadas")).toBeNull();
    expect(screen.queryByText("Quebráveis pendentes")).toBeNull();
  });

  it("permite escolher outra data para consultar o planeamento respetivo", () => {
    render(<QualityDashboard />);
    const dateInput = screen.getByLabelText("Data a consultar no painel Hoje");
    fireEvent.change(dateInput, { target: { value: "2026-08-25" } });
    expect((dateInput as HTMLInputElement).value).toBe("2026-08-25");
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe("Hoje");
  });

  it("filtra a lista de controlos agendados entre concluídos e por realizar", async () => {
    vi.mocked(trpc.quality.dashboard.useQuery).mockReturnValue({ isLoading: false, data: { operationalDate: new Date("2026-08-20T10:00:00Z"), metrics: { pending: 0, overdue: 0, criticalOpen: 0, fragilePending: 0, completedToday: 1, dailyExecutionRate: 50 }, plannedControls: [{ id: 41, module: "bphf", factoryId: 1, responsible: "Sabrina Esteves", completed: true }, { id: 42, module: "sensory", factoryId: 1, responsible: "Neuza Antunes", completed: false }], tasks: [], taskGroups: { today: [], tomorrow: [], thisWeek: [] }, criticalNcs: [] } } as any);
    const user = userEvent.setup();
    render(<QualityDashboard />);
    const filter = screen.getByRole("combobox", { name: "Filtrar controlos agendados por estado" });

    expect(screen.getByText("Verificação de BPHF")).toBeTruthy();
    expect(screen.getByText("Controlo sensorial de produto acabado")).toBeTruthy();

    await user.click(filter);
    await user.click(screen.getByRole("option", { name: "Concluídos" }));
    expect(screen.getByText("Verificação de BPHF")).toBeTruthy();
    expect(screen.queryByText("Controlo sensorial de produto acabado")).toBeNull();

    await user.click(filter);
    await user.click(screen.getByRole("option", { name: "Por realizar" }));
    expect(screen.queryByText("Verificação de BPHF")).toBeNull();
    expect(screen.getByText("Controlo sensorial de produto acabado")).toBeTruthy();
  });

  it("mostra uma mensagem específica quando o filtro não encontra controlos", async () => {
    vi.mocked(trpc.quality.dashboard.useQuery).mockReturnValue({ isLoading: false, data: { operationalDate: new Date("2026-08-20T10:00:00Z"), metrics: { pending: 0, overdue: 0, criticalOpen: 0, fragilePending: 0, completedToday: 1, dailyExecutionRate: 100 }, plannedControls: [{ id: 41, module: "bphf", factoryId: 1, responsible: "Sabrina Esteves", completed: true }], tasks: [], taskGroups: { today: [], tomorrow: [], thisWeek: [] }, criticalNcs: [] } } as any);
    const user = userEvent.setup();
    render(<QualityDashboard />);
    const filter = screen.getByRole("combobox", { name: "Filtrar controlos agendados por estado" });
    await user.click(filter);
    await user.click(screen.getByRole("option", { name: "Por realizar" }));
    await waitFor(() => expect(screen.getByText("Não existem controlos por realizar para esta data.")).toBeTruthy());
  });

  it("abre o formulário do controlo agendado ainda por realizar", () => {
    vi.mocked(trpc.quality.dashboard.useQuery).mockReturnValue({ isLoading: false, data: { operationalDate: new Date("2026-08-20T10:00:00Z"), metrics: { pending: 0, overdue: 0, criticalOpen: 0, fragilePending: 0, completedToday: 0, dailyExecutionRate: 0 }, plannedControls: [{ id: 42, module: "bphf", factoryId: 1, responsible: "Sabrina Esteves", completed: false }], tasks: [], taskGroups: { today: [], tomorrow: [], thisWeek: [] }, criticalNcs: [] } } as any);
    render(<QualityDashboard />);

    expect(screen.getByRole("link", { name: "Abrir preenchimento de Verificação de BPHF" }).getAttribute("href")).toBe("/controlos/bphf?plannedTaskId=42&factoryId=1");
  });
});
