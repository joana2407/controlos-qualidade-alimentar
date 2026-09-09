// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const renameAreaMutate = vi.fn();
const mergeAreasMutate = vi.fn();
const createAreaMutate = vi.fn();
const deleteAreaMutate = vi.fn();
const uploadMutate = vi.fn();
const uploadDamageMutate = vi.fn();
const invalidate = vi.fn();
let fragilePendingInput: unknown;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { listFragileItems: { invalidate }, listFragileAreas: { invalidate }, fragilePending: { invalidate }, fragileInspectionHistory: { invalidate } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }, { id: 2, name: "Fábrica 2 (granel)" }] } }) },
      listFragileItems: { useQuery: () => ({ data: [{ id: 9, name: "Proteção acrílica", location: "Embalamento", factoryId: 1, periodicity: "S", itemType: "Plástico rígido", referenceImageUrl: null }, { id: 11, name: "Janela de produção", location: "Produção", factoryId: 1, periodicity: "D", itemType: "Vidro", referenceImageUrl: null }, { id: 10, name: "Janelas exterior", location: "Expedição", factoryId: 2, periodicity: "M", itemType: "Vidro", referenceImageUrl: null }] }) },
      listFragileAreas: { useQuery: () => ({ data: [{ id: 1, factoryId: 1, name: "Embalamento", active: "true" }, { id: 2, factoryId: 1, name: "Produção", active: "true" }, { id: 3, factoryId: 2, name: "Expedição", active: "true" }] }) },
      fragilePending: { useQuery: (input: unknown) => { fragilePendingInput = input; return { isLoading: false, data: [{ id: 9, name: "Proteção acrílica", location: "Embalamento", factoryId: 1, periodicity: "S", itemType: "Plástico rígido", referenceImageUrl: "/manus-storage/protecao-acrilica.png", referenceImageName: "protecao-acrilica.png", lastInspectionAt: null }] }; } },
      fragileInspectionHistory: { useQuery: () => ({ isLoading: false, data: [{ id: 77, state: "Íntegro", result: "C", notes: "Sem alterações na verificação anterior.", completedAt: new Date("2026-08-27T09:15:00Z"), registeredByName: "Sabrina Esteves", registeredByTitle: "Tec. Qualidade", evidencePhotos: [] }] }) },
      addFragileItem: { useMutation: (options?: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: unknown) => { addMutate(input); options?.onSuccess?.(); } }) },
      updateFragileItem: { useMutation: (options?: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: unknown, mutationOptions?: { onSuccess?: () => void }) => { updateMutate(input); options?.onSuccess?.(); mutationOptions?.onSuccess?.(); } }) },
      deleteFragileItem: { useMutation: (options?: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: unknown) => { deleteMutate(input); options?.onSuccess?.(); } }) },
      renameFragileArea: { useMutation: (options?: { onSuccess?: (result: { updated: number }, variables: { currentName: string; nextName: string }) => void }) => ({ isPending: false, mutate: (input: { factoryId: number; currentName: string; nextName: string }) => { renameAreaMutate(input); options?.onSuccess?.({ updated: 1 }, input); } }) },
      mergeFragileAreas: { useMutation: (options?: { onSuccess?: (result: { updated: number }, variables: { sourceArea: string; targetArea: string }) => void }) => ({ isPending: false, mutate: (input: { factoryId: number; sourceArea: string; targetArea: string }) => { mergeAreasMutate(input); options?.onSuccess?.({ updated: 1 }, input); } }) },
      createFragileArea: { useMutation: (options?: { onSuccess?: (result: { reactivated: boolean }, variables: { factoryId: number; name: string }) => void }) => ({ isPending: false, mutate: (input: { factoryId: number; name: string }) => { createAreaMutate(input); options?.onSuccess?.({ reactivated: false }, input); } }) },
      deleteFragileArea: { useMutation: (options?: { onSuccess?: () => void }) => ({ isPending: false, mutate: (input: { factoryId: number; name: string }) => { deleteAreaMutate(input); options?.onSuccess?.(); } }) },
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
    addMutate.mockClear(); updateMutate.mockClear(); deleteMutate.mockClear(); renameAreaMutate.mockClear(); mergeAreasMutate.mockClear(); createAreaMutate.mockClear(); deleteAreaMutate.mockClear(); uploadMutate.mockClear(); uploadDamageMutate.mockClear(); invalidate.mockClear(); fragilePendingInput = undefined;
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
    await user.click(screen.getByText("Área").parentElement?.querySelector('[role="combobox"]')!);
    await user.click(screen.getByRole("option", { name: "Embalamento" }));
    await user.click(screen.getByRole("button", { name: /criar ponto de controlo/i }));
    expect(addMutate).toHaveBeenCalledWith(expect.objectContaining({ name: "Proteção da balança", location: "Embalamento", factoryId: 1 }));

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

  it("sugere a periodicidade a partir do nível de risco ao criar um ponto", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);

    await user.click(screen.getByRole("button", { name: /gerir pontos/i }));
    await user.click(screen.getByRole("button", { name: /adicionar ponto/i }));
    const riskSelect = screen.getByText("Nível de risco").parentElement?.querySelector('[role="combobox"]');
    expect(riskSelect).toBeTruthy();
    await user.click(riskSelect!);
    await user.click(screen.getByRole("option", { name: /nível 3 · elevado · diário/i }));

    expect(screen.getByText("Sugestão: Diário (D)")).toBeTruthy();
  });

  it("usa a data operacional selecionada ao calcular as pendências", () => {
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" referenceDate="2026-09-08" />);
    expect(fragilePendingInput).toEqual({ factoryId: 1, referenceDate: new Date("2026-09-08") });
  });

  it("abre a pendência selecionada num painel próprio de inspeção", () => {
    const createEntry = { mutate: vi.fn(), isPending: false };
    render(<FragileOperationsPanel createEntry={createEntry} factoryId="1" />);

    expect(screen.getByText("Operação diária")).toBeTruthy();
    expect(screen.getByText("Inspeções pendentes")).toBeTruthy();
    expect(screen.getByRole("button", { name: /gerir pontos/i })).toBeTruthy();
    expect(screen.getAllByText("Proteção acrílica").length).toBeGreaterThan(0);
    const referenceImages = screen.getAllByRole("img", { name: "Imagem de referência do ponto Proteção acrílica" });
    expect(referenceImages.some((image) => image.getAttribute("src") === "/manus-storage/protecao-acrilica.png")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Ampliar imagem de referência do ponto Proteção acrílica" }));
    expect(screen.getByRole("heading", { name: "Imagem de referência" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Imagem de referência ampliada do ponto Proteção acrílica" }).getAttribute("src")).toBe("/manus-storage/protecao-acrilica.png");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Imagem de referência" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /inspecionar/i }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Registar inspeção" })).toBeTruthy();
    expect(screen.getByText("Histórico de verificações anteriores")).toBeTruthy();
    expect(screen.getByText("Sem alterações na verificação anterior.")).toBeTruthy();
    expect(screen.getByText(/Sabrina Esteves/)).toBeTruthy();
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

  it("permite filtrar diretamente as pendências por área", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);

    await user.click(screen.getByLabelText("Filtrar pendências por área"));
    await user.click(screen.getByRole("option", { name: "Embalamento" }));

    expect(screen.getByText("Proteção acrílica")).toBeTruthy();
    expect(screen.getByText("1 pendentes")).toBeTruthy();
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

  it("mantém o gestor, a fábrica, a área e a pesquisa após editar um ponto", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);
    await user.click(screen.getByRole("button", { name: /gerir pontos/i }));
    const manager = () => screen.getByRole("heading", { name: "Gerir pontos de controlo" }).closest('[role="dialog"]') as HTMLElement;
    const managerArea = within(manager()).getByText("Área").parentElement?.querySelector('[role="combobox"]');
    await user.click(managerArea!);
    await user.click(screen.getByRole("option", { name: "Embalamento" }));
    await user.type(within(manager()).getByLabelText("Pesquisar por nome"), "proteção");
    await user.click(within(manager()).getByRole("button", { name: /editar proteção acrílica/i }));
    await user.click(screen.getByRole("button", { name: /guardar alterações/i }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Gerir pontos de controlo" })).toBeTruthy());
    const restoredManager = manager();
    expect(within(restoredManager).getByDisplayValue("proteção")).toBeTruthy();
    expect(within(restoredManager).getAllByRole("combobox")[0].textContent).toContain("Fábrica 1");
    expect(within(restoredManager).getAllByRole("combobox")[1].textContent).toContain("Embalamento");
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

  it("permite renomear uma área e atualizar os pontos associados", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);
    await user.click(screen.getByRole("button", { name: /gerir pontos/i }));
    const manager = () => screen.getByRole("heading", { name: "Gerir pontos de controlo" }).closest('[role="dialog"]') as HTMLElement;
    await user.type(within(manager()).getByLabelText("Pesquisar por nome"), "proteção");
    await user.click(within(manager()).getByRole("button", { name: "Editar áreas" }));
    await user.clear(screen.getByLabelText("Nova designação"));
    await user.type(screen.getByLabelText("Nova designação"), "Embalamento principal");
    await user.click(screen.getByRole("button", { name: "Guardar área" }));
    expect(renameAreaMutate).toHaveBeenCalledWith({ factoryId: 1, currentName: "Embalamento", nextName: "Embalamento principal" });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Gerir pontos de controlo" })).toBeTruthy());
    expect(within(manager()).getByDisplayValue("proteção")).toBeTruthy();
  });

  it("permite fundir uma área numa área de destino existente", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);
    await user.click(screen.getByRole("button", { name: /gerir pontos/i }));
    await user.click(screen.getByRole("button", { name: "Fundir áreas" }));
    const mergeDialog = screen.getAllByRole("dialog").at(-1)!;
    await user.click(within(mergeDialog).getByRole("button", { name: "Fundir áreas" }));
    expect(mergeAreasMutate).toHaveBeenCalledWith({ factoryId: 1, sourceArea: "Embalamento", targetArea: "Produção" });
  });

  it("permite criar e pedir a eliminação de uma área no gestor", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);
    await user.click(screen.getByRole("button", { name: /gerir pontos/i }));
    await user.click(screen.getByRole("button", { name: "Criar área" }));
    await user.type(screen.getByLabelText("Designação da nova área"), "Pesagem");
    await user.click(screen.getByRole("button", { name: "Criar área" }));
    expect(createAreaMutate).toHaveBeenCalledWith({ factoryId: 1, name: "Pesagem" });

    await user.click(screen.getByRole("button", { name: "Eliminar área" }));
    const deleteDialog = screen.getAllByRole("dialog").at(-1)!;
    await user.click(within(deleteDialog).getByRole("button", { name: "Eliminar área" }));
    expect(deleteAreaMutate).toHaveBeenCalledWith({ factoryId: 1, name: "Embalamento" });
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
    expect(screen.getByText("Código de risco:")).toBeTruthy();
    expect(screen.getAllByText("Risco moderado").length).toBeGreaterThan(0);
    expect(screen.queryByText("Pendências e catálogo")).toBeNull();
  });

  it("filtra diretamente as pendências pelo nível de risco", async () => {
    const user = userEvent.setup();
    render(<FragileOperationsPanel createEntry={{ mutate: vi.fn(), isPending: false }} factoryId="1" />);

    await user.click(screen.getByRole("button", { name: "Moderado" }));
    expect(screen.getByText("Proteção acrílica")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Elevado" }));
    expect(screen.getByText("Não existem pendências para este nível de risco.")).toBeTruthy();
  });
});
