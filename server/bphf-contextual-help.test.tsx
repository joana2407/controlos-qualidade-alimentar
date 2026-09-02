// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { inspectionData, employeeData } = vi.hoisted(() => ({
  inspectionData: [] as any[],
  employeeData: [{ id: 1, name: "Colaborador de teste" }] as Array<{ id: number; name: string }>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { listBphfInspectionEmployees: { invalidate: vi.fn() }, listBphfCollaboratorInspections: { invalidate: vi.fn() } } }),
    quality: {
      listBphfInspectionEmployees: { useQuery: () => ({ data: employeeData }) },
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

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverAnchor: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandList: ({ children, ...props }: { children: React.ReactNode }) => <div {...props}>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => <button type="button" onClick={onSelect}>{children}</button>,
}));

import { Bphf, ControlFactoryContext } from "../client/src/pages/ModuleControl";

afterEach(() => {
  inspectionData.splice(0, inspectionData.length);
  employeeData.splice(0, employeeData.length, { id: 1, name: "Colaborador de teste" });
  cleanup();
});

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

  it("filtra imediatamente os colaboradores pelo texto digitado em qualquer posição do nome", () => {
    employeeData.splice(0, employeeData.length,
      { id: 1, name: "Rafael Costa" },
      { id: 2, name: "Ana Rafael Pereira" },
      { id: 3, name: "Sofia Moreira Rafael" },
      { id: 4, name: "Maria Silva" },
    );
    render(<ControlFactoryContext.Provider value={{ factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], factoryId: "1", setFactoryId: vi.fn() }}><Bphf createEntry={{ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }} areas={["Produção"]} /></ControlFactoryContext.Provider>);

    const searchInput = screen.getAllByRole("combobox", { name: /Selecione o colaborador para/i })[0]!;
    const criterionCard = searchInput.closest(".panel-shadow") as HTMLElement | null;
    if (!criterionCard) throw new Error("Não foi encontrado o cartão do critério BPHF.");
    fireEvent.change(searchInput, { target: { value: "rafael" } });

    expect(within(criterionCard).getByText("Rafael Costa")).toBeTruthy();
    expect(within(criterionCard).getByText("Ana Rafael Pereira")).toBeTruthy();
    expect(within(criterionCard).getByText("Sofia Moreira Rafael")).toBeTruthy();
    expect(within(criterionCard).queryByText("Maria Silva")).toBeNull();
    fireEvent.click(within(criterionCard).getByRole("button", { name: "Ana Rafael Pereira" }));
    expect((searchInput as HTMLInputElement).value).toBe("Ana Rafael Pereira");
    expect(screen.queryByPlaceholderText("Escreva para filtrar, ex.: P")).toBeNull();
  });
});
