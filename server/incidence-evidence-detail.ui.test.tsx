// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { similarAlerts } = vi.hoisted(() => ({ similarAlerts: [] as Array<{ title: string; module: string; factoryId: number | null; factoryName: string; collaboratorId?: number | null; collaboratorName?: string | null; total: number }> }));

vi.mock("@/components/OfflineIncidencePanel", () => ({ OfflineIncidencePanel: () => null }));
vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ canManage: true, activeProfile: { id: 3, name: "Joana Pina" } }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { listIncidences: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }] } }) },
      listIncidences: { useQuery: () => ({ data: [{ id: 9, title: "Incidência com foto", notes: "Evidência registada.", area: "Produção", factoryId: 1, module: "bphf", completedAt: new Date("2026-08-21T10:00:00"), generatedNonconformity: false, nonconformityId: null, occurrenceNumber: null, registeredByProfileId: 3, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade", payload: { collaboratorId: 71, collaboratorName: "Maria Silva", criterion: "Higienização das mãos dos manipuladores", evidencePhotos: [{ key: "incidences/9/foto.png", url: "/manus-storage/incidences/9/foto.png", fileName: "foto-incidencia.png", mimeType: "image/png" }] } }] }) },
      listNcs: { useQuery: () => ({ data: [] }) },
      incidenceRecurrenceAlerts: { useQuery: () => ({ data: [] }) },
      similarIncidenceAlerts: { useQuery: () => ({ data: similarAlerts }) },
      updateIncidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteIncidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      uploadVerificationEvidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import Nonconformities from "../client/src/pages/Nonconformities";

afterEach(() => { cleanup(); similarAlerts.length = 0; });

describe("detalhe de incidência com evidências", () => {
  it("apresenta a fotografia anexada depois de selecionar a incidência", () => {
    render(<Nonconformities />);

    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByText("Fotografias de evidência")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Evidência da incidência: foto-incidencia.png" }).getAttribute("src")).toBe("/manus-storage/incidences/9/foto.png");
  });

  it("mostra o tratamento autónomo mesmo antes da decisão sobre NC", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByText("Tratamento da incidência")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Iniciar tratamento" })).toBeTruthy();
    expect(screen.getByText("Não foi gerada uma Não Conformidade para esta incidência.")).toBeTruthy();
  });

  it("mostra no detalhe o colaborador e o critério BPHF inspecionados", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));

    expect(screen.getByText("Contexto da verificação BPHF")).toBeTruthy();
    expect(screen.getByText("Maria Silva")).toBeTruthy();
    expect(screen.getByText(/Produção · Higienização das mãos dos manipuladores/i)).toBeTruthy();
  });

  it("permite iniciar o tratamento sem gerar uma Não Conformidade", () => {
    render(<Nonconformities />);
    fireEvent.click(screen.getByRole("button", { name: /Incidência com foto/i }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar tratamento" }));

    fireEvent.change(screen.getByLabelText("Responsável pelo tratamento"), { target: { value: "Neuza Antunes" } });
    fireEvent.change(screen.getByLabelText("Correção ou tratamento efetuado"), { target: { value: "Reforço imediato da higienização." } });

    expect((screen.getByLabelText("Responsável pelo tratamento") as HTMLInputElement).value).toBe("Neuza Antunes");
    expect((screen.getByLabelText("Correção ou tratamento efetuado") as HTMLTextAreaElement).value).toBe("Reforço imediato da higienização.");
    expect(screen.getByRole("button", { name: "Guardar tratamento" })).toBeTruthy();
  });

  it("permite filtrar a lista por tratamento pendente", () => {
    render(<Nonconformities />);

    fireEvent.click(screen.getByRole("combobox", { name: "Filtrar incidências por estado de tratamento" }));
    fireEvent.click(screen.getByRole("option", { name: "Tratamento pendente" }));

    expect(screen.getByRole("combobox", { name: "Filtrar incidências por estado de tratamento" }).textContent).toMatch(/tratamento pendente/i);
    expect(screen.getByRole("button", { name: /Incidência com foto/i })).toBeTruthy();
  });

  it("abre diretamente a lista filtrada pelo grupo indicado no aviso de NC", () => {
    similarAlerts.push({ title: "Colaborador: Maria Silva", module: "bphf", factoryId: 1, factoryName: "Fábrica 1 (Fatiado)", collaboratorId: 71, collaboratorName: "Maria Silva", total: 3 });
    render(<Nonconformities />);

    fireEvent.click(screen.getByRole("button", { name: /abrir as 3 incidências semelhantes/i }));

    expect(screen.getByRole("status").textContent).toMatch(/a visualizar as 3 incidências semelhantes/i);
    expect(screen.getByRole("status").textContent).toMatch(/colaborador inspecionado «Maria Silva»/i);
    expect(screen.getByRole("button", { name: "Limpar acesso direto" })).toBeTruthy();
  });
});
