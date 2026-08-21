// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const uploadMutate = vi.fn();
const uploadDamageMutate = vi.fn();
const invalidate = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { listFragileItems: { invalidate }, fragilePending: { invalidate } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }, { id: 2, name: "Fábrica 2 (granel)" }] } }) },
      listFragileItems: { useQuery: () => ({ data: [{ id: 9, name: "Proteção acrílica", location: "Embalamento", factoryId: 1, periodicity: "S", itemType: "Plástico rígido", referenceImageUrl: null }, { id: 10, name: "Janelas exterior", location: "Expedição", factoryId: 2, periodicity: "M", itemType: "Vidro", referenceImageUrl: null }] }) },
      fragilePending: { useQuery: () => ({ isLoading: false, data: [{ id: 9, name: "Proteção acrílica", location: "Embalamento", factoryId: 1, periodicity: "S", itemType: "Plástico rígido", referenceImageUrl: null, lastInspectionAt: null }] }) },
      addFragileItem: { useMutation: (options?: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: unknown) => { addMutate(input); options?.onSuccess?.(); } }) },
      updateFragileItem: { useMutation: () => ({ isPending: false, mutate: (input: unknown, options?: { onSuccess?: () => void }) => { updateMutate(input); options?.onSuccess?.(); } }) },
      deleteFragileItem: { useMutation: (options?: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: unknown) => { deleteMutate(input); options?.onSuccess?.(); } }) },
      uploadFragileReferenceImage: { useMutation: () => ({ isPending: false, mutate: (input: unknown, options?: { onSuccess?: (result: { url: string }) => void }) => { uploadMutate(input); options?.onSuccess?.({ url: "/manus-storage/referencia.png" }); } }) },
      uploadFragileInspectionEvidence: { useMutation: () => ({ isPending: false, mutate: (input: unknown, options?: { onSuccess?: (result: { key: string; url: string; fileName: string; mimeType: "image/png" }) => void }) => { uploadDamageMutate(input); options?.onSuccess?.({ key: "fragile-evidence/9/1/dano.png", url: "/manus-storage/dano.png", fileName: "dano.png", mimeType: "image/png" }); } }) },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FragileInspectionV2 } from "../client/src/pages/ModuleControl";
import { FragileOperationsPanel } from "../client/src/components/quality/FragileOperationsPanel";

describe("fluxo de interface de pontos de controlo de quebráveis", () => {
  beforeEach(() => {
    cleanup();
    addMutate.mockClear(); updateMutate.mockClear(); deleteMutate.mockClear(); uploadMutate.mockClear(); uploadDamageMutate.mockClear(); invalidate.mockClear();
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
  });

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
  }, 10_000);

  it("abre a pendência selecionada num painel próprio de inspeção", () => {
    const createEntry = { mutate: vi.fn(), isPending: false };
    render(<FragileOperationsPanel createEntry={createEntry} factoryId="1" />);

    expect(screen.getByText("Operação diária")).toBeTruthy();
    expect(screen.getByText("Inspeções pendentes")).toBeTruthy();
    expect(screen.getByRole("button", { name: /gerir pontos/i })).toBeTruthy();
    expect(screen.getAllByText("Proteção acrílica").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /inspecionar/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Registar inspeção" })).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Verificação de Proteção acrílica.");
  });

  it("pesquisa os pontos pendentes por nome ou área sem alterar o filtro de periodicidade", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);

    await user.type(screen.getByLabelText("Pesquisar pendências"), "embalamento");
    expect(screen.getByText("Proteção acrílica")).toBeTruthy();
    await user.clear(screen.getByLabelText("Pesquisar pendências"));
    await user.type(screen.getByLabelText("Pesquisar pendências"), "inexistente");
    expect(screen.getByText("Não existem pendências que correspondam à pesquisa.")).toBeTruthy();
  });

  it("permite adicionar fotografia de evidência quando o item está danificado", async () => {
    const user = userEvent.setup();
    const createEntry = { mutate: vi.fn(), isPending: false };
    render(<FragileOperationsPanel createEntry={createEntry} factoryId="1" />);

    await user.click(screen.getByRole("button", { name: /inspecionar/i }));
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Danificado" }));
    expect(screen.getByText("Fotografia do dano")).toBeTruthy();
    const photo = new File(["imagem do dano"], "dano.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Fotografia do dano"), { target: { files: [photo] } });
    await waitFor(() => expect(uploadDamageMutate).toHaveBeenCalledWith(expect.objectContaining({ itemId: 9, fileName: "dano.png", mimeType: "image/png" })));
    await user.type(screen.getByPlaceholderText(/Obrigatório em caso/i), "Ponto isolado para substituição.");
    await user.click(screen.getByRole("button", { name: "Registar inspeção" }));
    expect(createEntry.mutate).toHaveBeenCalledWith(expect.objectContaining({ result: "NC", payload: expect.objectContaining({ state: "Danificado", evidencePhotos: [expect.objectContaining({ url: "/manus-storage/dano.png" })] }) }));
  });

  it("permite editar e eliminar um ponto no gestor por qualquer operador", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);
    await user.click(screen.getByRole("button", { name: /gerir pontos/i }));
    fireEvent.click(screen.getByRole("button", { name: /editar proteção acrílica/i }));
    expect(screen.getAllByText("Editar ponto de controlo").length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: "Escape" });
    await user.click(screen.getByRole("button", { name: /gerir pontos/i }));
    await user.click(screen.getByRole("button", { name: /eliminar proteção acrílica/i }));
    expect(screen.getByText(/Pretende eliminar «Proteção acrílica»/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Eliminar ponto" }));
    expect(deleteMutate).toHaveBeenCalledWith({ id: 9 });
  });

  it("filtra o catálogo por fábrica ou linha no gestor de pontos", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);
    await user.click(screen.getByRole("button", { name: /gerir pontos/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Proteção acrílica")).toBeTruthy();
    await user.click(within(dialog).getAllByRole("combobox")[0]!);
    await user.click(screen.getByRole("option", { name: "Fábrica 2 (granel)" }));

    expect(within(dialog).getByText("Janelas exterior")).toBeTruthy();
    expect(within(dialog).queryByText("Proteção acrílica")).toBeNull();
  });

  it("mantém o cabeçalho revisto e a descrição operacional sem texto duplicado", () => {
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);
    const title = screen.getByRole("heading", { name: "Quebráveis" });
    expect(title.closest("header")?.className).toContain("flex");
    expect(screen.getByText("Pontos diários vencem em dias úteis; pontos S, Q e M são verificados à sexta-feira.")).toBeTruthy();
    expect(screen.queryByText("Pendências e catálogo")).toBeNull();
  });
});
