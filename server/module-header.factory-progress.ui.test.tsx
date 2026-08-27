// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const dashboardInputs = vi.hoisted(() => [] as unknown[]);
const dailyResultsInputs = vi.hoisted(() => [] as unknown[]);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dashboard: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() }, listNcs: { invalidate: vi.fn() }, fragilePending: { invalidate: vi.fn() }, dailyControlResults: { invalidate: vi.fn() }, listBphfInspectionEmployees: { invalidate: vi.fn() }, listBphfCollaboratorInspections: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }, { id: 2, name: "Fábrica 2 (granel)" }, { id: 3, name: "Fábrica 3 (Sem Gluten)" }], areas: [{ id: 1, name: "Produção", group: "bphf", factoryId: 1 }, { id: 2, name: "Produção", group: "bphf", factoryId: 2 }, { id: 3, name: "Produção", group: "bphf", factoryId: 3 }] } }) },
      dashboard: { useQuery: (input: unknown) => { dashboardInputs.push(input); return { isLoading: false, data: { moduleProgress: { bphf: { expected: 3, completed: 1, registeredToday: 1, pending: ["Plano do Dia — bphf"], percentage: 33.3 } }, moduleProgressByFactory: { bphf: [{ factoryId: 1, expected: 1, completed: 0, registeredToday: 0, percentage: 0 }, { factoryId: 2, expected: 1, completed: 1, registeredToday: 1, percentage: 100 }, { factoryId: 3, expected: 1, completed: 0, registeredToday: 0, percentage: 0 }] } } }; } },
      dailyControlResults: { useQuery: (input: unknown) => { dailyResultsInputs.push(input); return { isLoading: false, data: { entries: [{ id: 90, title: "Higienização das mãos dos manipuladores", area: "Produção", result: "C", notes: "Sem desvios observados.", payload: { collaboratorName: "Colaborador de teste" }, completedAt: new Date("2026-08-20T11:30:00"), registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade" }] } }; } },
      pendingControlTasks: { useQuery: () => ({ isLoading: false, data: [{ id: 72, dueAt: new Date("2026-08-18T12:00:00"), responsible: "Ana", factoryId: 1 }] }) },
      controlAuthorization: { useQuery: () => ({ isLoading: false, data: { allowed: true, taskId: 51, dueAt: new Date("2026-08-20T12:00:00"), isPreviousPending: true } }) },
      listBphfInspectionEmployees: { useQuery: () => ({ data: [{ id: 1, name: "Colaborador de teste" }] }) },
      listBphfCollaboratorInspections: { useQuery: () => ({ isLoading: false, data: [] }) },
      addBphfInspectionEmployee: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      createEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }) },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
  useRoute: () => [true, { module: "bphf" }],
}));

import ModuleControl from "../client/src/pages/ModuleControl";

describe("cabeçalho de controlo — progresso por fábrica", () => {
  afterEach(() => { cleanup(); dashboardInputs.length = 0; dailyResultsInputs.length = 0; });

  it("substitui o resumo geral pelos cartões das fábricas incluídas no Plano do Dia", () => {
    render(<ModuleControl />);
    expect(screen.getByText("Preenchimento por fábrica")).toBeTruthy();
    expect(screen.getByText("Fábrica 1 (Fatiado)")).toBeTruthy();
    expect(screen.getByText("Fábrica 2 (granel)")).toBeTruthy();
    expect(screen.getByText("Fábrica 3 (Sem Gluten)")).toBeTruthy();
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    expect(screen.queryByText("Preenchimento de hoje")).toBeNull();
  });

  it("destaca a data prevista quando o formulário abre uma pendência de dia anterior", () => {
    render(<ModuleControl />);
    expect(screen.getByText("Controlo retroativo")).toBeTruthy();
    expect(screen.getByText(/Este controlo é relativo ao dia/)).toBeTruthy();
    expect(screen.getAllByText("20/08/2026").length).toBeGreaterThan(0);
    expect(screen.getByText(/e não para o dia atual/)).toBeTruthy();
    const input = dashboardInputs[0] as { date: Date };
    expect(input.date.toISOString()).toContain("2026-08-20T12:00:00.000Z");
  });

  it("apresenta abaixo do formulário os resultados registados para a data consultada", () => {
    window.history.pushState({}, "", "/controlos/bphf?factoryId=1");
    render(<ModuleControl />);
    expect(screen.getByText("Data em preenchimento: 20/08/2026")).toBeTruthy();
    expect(screen.getByText("Pendências de dias anteriores")).toBeTruthy();
    expect(screen.getByText("Pendente desde 18/08/2026")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Abrir pendência/ }).getAttribute("href")).toBe("/controlos/bphf?plannedTaskId=72&factoryId=1");
    expect(screen.getByText("Resultados registados")).toBeTruthy();
    expect(screen.getAllByText("Higienização das mãos dos manipuladores").length).toBeGreaterThan(1);
    expect(screen.getByText(/Colaborador: Colaborador de teste/)).toBeTruthy();
    const input = dailyResultsInputs[0] as { module: string; factoryId: number; operationalDate: Date };
    expect(input).toMatchObject({ module: "bphf", factoryId: 1 });
    expect(input.operationalDate.toISOString()).toContain("2026-08-20T12:00:00.000Z");
  });
});
