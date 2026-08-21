// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useRoute: () => [true, { module: "fragile_items" }],
}));

const noopMutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dashboard: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() }, listNcs: { invalidate: vi.fn() }, fragilePending: { invalidate: vi.fn() }, listFragileItems: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], areas: [] } }) },
      dashboard: { useQuery: () => ({ data: { moduleProgress: { fragile_items: { expected: 0, completed: 0, registeredToday: 0, pending: [], percentage: 0 } } }, isLoading: false }) },
      createEntry: { useMutation: () => noopMutation },
      listFragileItems: { useQuery: (input?: { factoryId?: number }) => ({ data: input?.factoryId === 1 ? [{ id: 101, name: "Ponto F1", location: "Produção", periodicity: "D", itemType: "Vidro" }] : [] }) },
      fragilePending: { useQuery: (input?: { factoryId?: number }) => ({ data: input?.factoryId === 1 ? [{ id: 101, name: "Ponto F1", location: "Produção", periodicity: "D", itemType: "Vidro", lastInspectionAt: null }] : [], isLoading: false }) },
      addFragileItem: { useMutation: () => noopMutation },
      updateFragileItem: { useMutation: () => noopMutation },
      deleteFragileItem: { useMutation: () => noopMutation },
      renameFragileArea: { useMutation: () => noopMutation },
      uploadFragileReferenceImage: { useMutation: () => noopMutation },
      uploadFragileInspectionEvidence: { useMutation: () => noopMutation },
    },
  },
}));

import ModuleControl from "../client/src/pages/ModuleControl";

describe("cabeçalho de quebráveis", () => {
  afterEach(cleanup);

  it("mostra o seletor de fábrica comum e evita repetir o cabeçalho interno", () => {
    render(<ModuleControl />);
    expect(screen.getByText("Fábrica / linha")).toBeTruthy();
    expect(screen.getByText("Quebráveis")).toBeTruthy();
    expect(screen.getAllByText("Quebráveis")).toHaveLength(1);
    expect(screen.getByText("Inspeções pendentes")).toBeTruthy();
  });

  it("carrega pontos e pendências quando a fábrica é selecionada no cabeçalho", async () => {
    render(<ModuleControl />);
    expect(screen.getByText(/Selecione uma fábrica ou linha no topo/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("combobox")[0]!);
    fireEvent.click(screen.getByRole("option", { name: "Fábrica 1 (Fatiado)" }));

    await waitFor(() => {
      expect(screen.getAllByText("Ponto F1").length).toBeGreaterThan(0);
      expect(screen.getByText("1 pendentes")).toBeTruthy();
    });
  });
});
