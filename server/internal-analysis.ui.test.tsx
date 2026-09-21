// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { reports: { invalidate: vi.fn() } } }),
    quality: {
      uploadInternalAnalysisPhoto: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

vi.mock("@/contexts/QualityAccessContext", () => ({
  useQualityAccess: () => ({ activeProfile: { id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }, canManage: false }),
}));

import { ControlFactoryContext, InternalAnalysis } from "../client/src/pages/ModuleControl";

afterEach(cleanup);

describe("controlo de análises internas", () => {
  it("disponibiliza os testes rápidos de ovo e mostarda para validação individual", () => {
    const createEntry = { mutate: vi.fn(), isPending: false };
    render(<ControlFactoryContext.Provider value={{ factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], factoryId: "1", setFactoryId: vi.fn() }}><InternalAnalysis createEntry={createEntry} /></ControlFactoryContext.Provider>);

    expect(screen.getByText("Análises internas")).toBeTruthy();
    expect(screen.getByText("Analista responsável")).toBeTruthy();
    expect(screen.getByDisplayValue("Sabrina Esteves")).toBeTruthy();
    expect(screen.getByText("Cliente")).toBeTruthy();
    expect(screen.getByText("Observações (obrigatórias)")).toBeTruthy();
    expect(screen.getByText("Fotografias de evidência")).toBeTruthy();
    expect(screen.getByRole("button", { name: /amostra/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Validar análise" })).toBeTruthy();

    expect(screen.getByText("Glúten")).toBeTruthy();
    const eggTest = screen.getByRole("button", { name: "Teste rápido ovo" });
    const mustardTest = screen.getByRole("button", { name: "Teste rápido mostarda" });
    fireEvent.click(eggTest);
    expect(screen.getByText("1 análise(s) selecionada(s): Teste rápido ovo.")).toBeTruthy();
    fireEvent.click(mustardTest);
    expect(screen.getByText("2 análise(s) selecionada(s): Teste rápido ovo, Teste rápido mostarda.")).toBeTruthy();
  });
});
