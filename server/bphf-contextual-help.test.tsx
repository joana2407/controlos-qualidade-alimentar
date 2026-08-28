// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { inspectionData } = vi.hoisted(() => ({ inspectionData: [] as any[] }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { listBphfInspectionEmployees: { invalidate: vi.fn() }, listBphfCollaboratorInspections: { invalidate: vi.fn() } } }),
    quality: {
      listBphfInspectionEmployees: { useQuery: () => ({ data: [{ id: 1, name: "Colaborador de teste" }] }) },
      listBphfCollaboratorInspections: { useQuery: () => ({ isLoading: false, data: inspectionData }) },
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

afterEach(() => { inspectionData.splice(0, inspectionData.length); cleanup(); });

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

  it("mostra a cobertura mínima por área sem pré-preenchimento", () => {
    const criterion = "Estado de limpeza e conservação do fardamento";
    const completedAt = new Date();
    inspectionData.push(
      { id: 1, collaboratorName: "Colaborador de teste", collaboratorId: 1, criterion, area: "Produção", result: "C", completedAt },
      { id: 2, collaboratorName: "Colaborador de teste", collaboratorId: 1, criterion, area: "Embalagem", result: "C", completedAt },
    );
    render(<ControlFactoryContext.Provider value={{ factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], factoryId: "1", setFactoryId: vi.fn() }}><Bphf createEntry={{ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }} areas={["Produção", "Embalagem", "Limpeza"]} /></ControlFactoryContext.Provider>);

    expect(screen.getAllByText("Em preenchimento")).toHaveLength(4);
    expect(screen.getAllByText("✓ Produção")).toHaveLength(1);
    expect(screen.getAllByText("✓ Embalagem")).toHaveLength(1);
    expect(screen.getAllByText("• Limpeza")).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "Registar área verificada" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("mantém disponível o registo adicional quando uma área já cumpriu o mínimo", () => {
    const criterion = "Estado de limpeza e conservação do fardamento";
    const completedAt = new Date();
    inspectionData.push(
      { id: 1, collaboratorName: "Colaborador de teste", collaboratorId: 1, criterion, area: "Produção", result: "C", completedAt },
      { id: 2, collaboratorName: "Colaborador de teste", collaboratorId: 1, criterion, area: "Embalagem", result: "C", completedAt },
    );
    render(<ControlFactoryContext.Provider value={{ factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], factoryId: "1", setFactoryId: vi.fn() }}><Bphf createEntry={{ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }} areas={["Produção", "Embalagem"]} /></ControlFactoryContext.Provider>);

    expect(screen.getAllByText("Mínimo concluído")).toHaveLength(1);
    expect(screen.getAllByText(/Pode adicionar mais verificações/).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("button", { name: "Registar verificação adicional" })).toHaveLength(0);
  });
});
