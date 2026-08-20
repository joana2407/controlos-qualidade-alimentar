// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dashboard: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() }, listNcs: { invalidate: vi.fn() }, fragilePending: { invalidate: vi.fn() }, listBphfInspectionEmployees: { invalidate: vi.fn() }, listBphfCollaboratorInspections: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }, { id: 2, name: "Fábrica 2 (granel)" }], areas: [{ id: 1, name: "Produção", group: "bphf", factoryId: 1 }, { id: 2, name: "Produção", group: "bphf", factoryId: 2 }] } }) },
      dashboard: { useQuery: () => ({ isLoading: false, data: { moduleProgress: { bphf: { expected: 2, completed: 1, registeredToday: 1, pending: ["Plano do Dia — bphf"], percentage: 50 } }, moduleProgressByFactory: { bphf: [{ factoryId: 1, expected: 1, completed: 0, registeredToday: 0, percentage: 0 }, { factoryId: 2, expected: 1, completed: 1, registeredToday: 1, percentage: 100 }] } } }) },
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
  afterEach(cleanup);

  it("substitui o resumo geral pelos cartões das fábricas incluídas no Plano do Dia", () => {
    render(<ModuleControl />);
    expect(screen.getByText("Preenchimento por fábrica")).toBeTruthy();
    expect(screen.getByText("Fábrica 1 (Fatiado)")).toBeTruthy();
    expect(screen.getByText("Fábrica 2 (granel)")).toBeTruthy();
    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);
    expect(screen.queryByText("Preenchimento de hoje")).toBeNull();
  });
});
