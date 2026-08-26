// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { similarAlerts } = vi.hoisted(() => ({ similarAlerts: [] as Array<{ title: string; module: string; factoryId: number; factoryName: string; total: number }> }));

vi.mock("@/components/OfflineIncidencePanel", () => ({ OfflineIncidencePanel: () => null }));
vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ canManage: true, activeProfile: { id: 3, name: "Joana Pina" } }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { listIncidences: { invalidate: vi.fn() } } }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }] } }) },
      listIncidences: { useQuery: () => ({ data: [{ id: 9, title: "Incidência com foto", notes: "Evidência registada.", area: "Produção", factoryId: 1, module: "bphf", completedAt: new Date("2026-08-21T10:00:00"), generatedNonconformity: false, nonconformityId: null, occurrenceNumber: null, registeredByProfileId: 3, registeredByName: "Joana Pina", registeredByTitle: "Resp. Qualidade", payload: { evidencePhotos: [{ key: "incidences/9/foto.png", url: "/manus-storage/incidences/9/foto.png", fileName: "foto-incidencia.png", mimeType: "image/png" }] } }] }) },
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

  it("mostra tratamento pendente até existir uma decisão sobre NC", () => {
    render(<Nonconformities />);
    expect(screen.getByText("Tratamento pendente")).toBeTruthy();
    expect(screen.queryByText("Não gerou NC")).toBeNull();
  });

  it("abre diretamente a lista filtrada pelo grupo indicado no aviso de NC", () => {
    similarAlerts.push({ title: "Incidência com foto", module: "bphf", factoryId: 1, factoryName: "Fábrica 1 (Fatiado)", total: 3 });
    render(<Nonconformities />);

    fireEvent.click(screen.getByRole("button", { name: /abrir as 3 incidências semelhantes/i }));

    expect(screen.getByRole("status").textContent).toMatch(/a visualizar as 3 incidências semelhantes/i);
    expect(screen.getByRole("button", { name: "Limpar acesso direto" })).toBeTruthy();
  });
});
