// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(screen.getAllByRole("button", { name: "Ajuda sobre os resultados C, NC e N/A" })).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Explicação do critério BPHF: Estado de limpeza/ })).toBeTruthy();
    expect(screen.getByText(/fardamento está limpo, íntegro e adequado à função/)).toBeTruthy();
    expect(screen.getByText(/lavagem e desinfeção das mãos é realizada nos momentos necessários/)).toBeTruthy();
    expect(screen.getByText(/cumprimento global das boas práticas aplicáveis à área/)).toBeTruthy();
  });
});
