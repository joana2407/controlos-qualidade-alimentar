// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addMutate = vi.fn();
const updateMutate = vi.fn();
const uploadMutate = vi.fn();
const invalidate = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { listFragileItems: { invalidate }, fragilePending: { invalidate } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }, { id: 2, name: "Fábrica 2 (granel)" }] } }) },
      listFragileItems: { useQuery: () => ({ data: [{ id: 9, name: "Proteção acrílica", location: "Embalamento", factoryId: 1, periodicity: "S", itemType: "Plástico rígido", referenceImageUrl: null }] }) },
      fragilePending: { useQuery: () => ({ isLoading: false, data: [{ id: 9, name: "Proteção acrílica", location: "Embalamento", factoryId: 1, periodicity: "S", itemType: "Plástico rígido", referenceImageUrl: null, lastInspectionAt: null }] }) },
      addFragileItem: { useMutation: (options?: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: unknown) => { addMutate(input); options?.onSuccess?.(); } }) },
      updateFragileItem: { useMutation: () => ({ isPending: false, mutate: (input: unknown, options?: { onSuccess?: () => void }) => { updateMutate(input); options?.onSuccess?.(); } }) },
      uploadFragileReferenceImage: { useMutation: () => ({ isPending: false, mutate: (input: unknown, options?: { onSuccess?: (result: { url: string }) => void }) => { uploadMutate(input); options?.onSuccess?.({ url: "/manus-storage/referencia.png" }); } }) },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FragileInspectionV2 } from "../client/src/pages/ModuleControl";
import { FragileOperationsPanel } from "../client/src/components/quality/FragileOperationsPanel";

describe("fluxo de interface de pontos de controlo de quebráveis", () => {
  beforeEach(() => { cleanup(); addMutate.mockClear(); updateMutate.mockClear(); uploadMutate.mockClear(); invalidate.mockClear(); });

  it("permite criar, editar e carregar uma imagem de referência", async () => {
    const user = userEvent.setup();
    render(<FragileInspectionV2 createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);

    await user.click(screen.getByRole("button", { name: /adicionar ponto/i }));
    await user.type(screen.getByPlaceholderText("Ex.: Proteção acrílica da fatiadora"), "Proteção da balança");
    await user.type(screen.getByPlaceholderText("Ex.: Produção T"), "Pesagem");
    await user.click(screen.getByRole("button", { name: /criar ponto de controlo/i }));
    expect(addMutate).toHaveBeenCalledWith(expect.objectContaining({ name: "Proteção da balança", location: "Pesagem", factoryId: 1 }));

    await user.click(screen.getByRole("button", { name: /editar proteção acrílica/i }));
    const editorName = screen.getByDisplayValue("Proteção acrílica");
    await user.clear(editorName);
    await user.type(editorName, "Proteção acrílica revista");
    await user.click(screen.getByRole("button", { name: /guardar alterações/i }));
    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({ id: 9, name: "Proteção acrílica revista", location: "Embalamento", factoryId: 1 }));

    await user.click(screen.getByRole("button", { name: /editar proteção acrílica/i }));
    const file = new File(["imagem de teste"], "referencia.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(uploadMutate).toHaveBeenCalledWith(expect.objectContaining({ itemId: 9, fileName: "referencia.png", mimeType: "image/png" })));
  });

  it("reúne pendências, catálogo e inspeção num único painel operacional", async () => {
    const user = userEvent.setup();
    const createEntry = { mutate: vi.fn(), isPending: false };
    render(<FragileOperationsPanel createEntry={createEntry} factoryId="1" />);

    expect(screen.getByText("Pendências e catálogo")).toBeTruthy();
    expect(screen.getByText("Inspeções pendentes")).toBeTruthy();
    expect(screen.getByText("Catálogo de pontos")).toBeTruthy();
    expect(screen.getAllByText("Proteção acrílica").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /inspecionar/i }));
    expect(screen.getAllByText("Registar inspeção").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /editar proteção acrílica/i }));
    expect(screen.getAllByText("Editar ponto de controlo").length).toBeGreaterThan(0);
  });

  it("mantém o cabeçalho revisto e a descrição operacional sem texto duplicado", () => {
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);
    const title = screen.getByRole("heading", { name: "Quebráveis" });
    expect(title.closest("header")?.className).toContain("flex");
    expect(screen.getByText("Filtre a periodicidade, registe inspeções e atualize os pontos de controlo da fábrica selecionada.")).toBeTruthy();
    expect(screen.queryByText("Pendências, catálogo, edição e registo de inspeções num único painel operacional.")).toBeNull();
  });
});
