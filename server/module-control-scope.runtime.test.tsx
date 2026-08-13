// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let activeModule = "bphf";
const createEntryMutateAsync = vi.fn((input: { factoryId?: number }) => Promise.resolve({ success: true, input }));
const createEntryMutate = vi.fn();
const listFragileItemsQuery = vi.fn((_input?: unknown, _options?: unknown) => ({ data: [], isLoading: false }));
const fragilePendingQuery = vi.fn((_input?: unknown, _options?: unknown) => ({ data: [], isLoading: false }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dashboard: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() }, listNcs: { invalidate: vi.fn() }, fragilePending: { invalidate: vi.fn() }, listFragileItems: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }, { id: 2, name: "Fábrica 2 (granel)" }], areas: [{ name: "Embalagem T", group: "bphf" }, { name: "SG", group: "metal" }] } }) },
      createEntry: { useMutation: () => ({ mutate: createEntryMutate, mutateAsync: createEntryMutateAsync, isPending: false }) },
      listFragileItems: { useQuery: (input?: unknown, options?: unknown) => listFragileItemsQuery(input, options) },
      fragilePending: { useQuery: (input?: unknown, options?: unknown) => fragilePendingQuery(input, options) },
      addFragileItem: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      updateFragileItem: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      uploadFragileReferenceImage: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      calculateSensory: { useQuery: () => ({ data: { percentage: 60, scoreOnFive: 3 } }) },
      listChecklistItems: { useQuery: () => ({ data: [] }) },
      initializeChecklist: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));
vi.mock("wouter", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="/controlos">{children}</a>, useRoute: () => [true, { module: activeModule }] }));

import { ControlScopeProvider, useControlScope } from "../client/src/contexts/ControlScopeContext";
import { FragileOperationsPanel } from "../client/src/components/quality/FragileOperationsPanel";
import ModuleControl from "../client/src/pages/ModuleControl";

function FragileWithSidebarScope() {
  const { factoryId } = useControlScope();
  return <FragileOperationsPanel factoryId={factoryId} createEntry={{ mutate: vi.fn(), isPending: false }} />;
}

describe("uso runtime do contexto lateral de fábrica ou linha", () => {
  beforeEach(() => {
    activeModule = "bphf";
    localStorage.clear();
    localStorage.setItem("quality-control-factory-id", "2");
    createEntryMutate.mockClear();
    createEntryMutateAsync.mockClear();
    listFragileItemsQuery.mockClear();
    fragilePendingQuery.mockClear();
    Object.defineProperty(Element.prototype, "scrollIntoView", { writable: true, value: vi.fn() });
  });

  it("submete BPHF com a fábrica selecionada no contexto lateral, sem seletor local", async () => {
    render(<ControlScopeProvider><ModuleControl /></ControlScopeProvider>);

    expect(screen.queryByText("Fábrica / linha produtiva")).toBeNull();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Embalagem T" }));
    fireEvent.click(await screen.findByRole("button", { name: /concluir verificação bphf/i }));

    await waitFor(() => expect(createEntryMutateAsync).toHaveBeenCalledTimes(3));
    expect(createEntryMutateAsync.mock.calls.every(([input]) => input.factoryId === 2)).toBe(true);
  });

  it("filtra o painel de quebráveis pelo factoryId ativo no contexto lateral", () => {
    render(<ControlScopeProvider><FragileWithSidebarScope /></ControlScopeProvider>);

    expect(screen.queryByText("Fábrica / linha produtiva")).toBeNull();
    expect(listFragileItemsQuery).toHaveBeenCalledWith({ factoryId: 2, periodicity: undefined }, { enabled: true });
    expect(fragilePendingQuery).toHaveBeenCalledWith({ factoryId: 2 }, { enabled: true });
  });
});
