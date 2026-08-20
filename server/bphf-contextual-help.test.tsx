// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { listBphfInspectionEmployees: { invalidate: vi.fn() }, listBphfCollaboratorInspections: { invalidate: vi.fn() } } }),
    quality: {
      listBphfInspectionEmployees: { useQuery: () => ({ data: [{ id: 1, name: "Colaborador de teste" }] }) },
      listBphfCollaboratorInspections: { useQuery: () => ({ isLoading: false, data: [] }) },
      addBphfInspectionEmployee: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div role="tooltip">{children}</div>,
}));

import { Bphf, ControlFactoryContext } from "../client/src/pages/ModuleControl";

afterEach(cleanup);

describe("ajuda contextual de BPHF", () => {
  it("mostra um ícone e explicação contextual própria para cada critério", () => {
    render(<ControlFactoryContext.Provider value={{ factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], factoryId: "1", setFactoryId: vi.fn() }}><Bphf createEntry={{ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }} areas={["Produção"]} /></ControlFactoryContext.Provider>);
    expect(screen.getAllByRole("button", { name: /Explicação do critério BPHF:/ })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Explicação do critério BPHF: Estado de limpeza e conservação do fardamento" })).toBeTruthy();
    expect(screen.getByText(/fardamento está limpo, íntegro e adequado à função/)).toBeTruthy();
    expect(screen.getByText(/lavagem e desinfeção das mãos é realizada nos momentos necessários/)).toBeTruthy();
    expect(screen.getByText(/cumprimento global das boas práticas aplicáveis à área/)).toBeTruthy();
    expect(screen.getByText(/cacifos pessoais e de trabalho estão limpos/)).toBeTruthy();
  });
});
