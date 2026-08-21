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
  it("agrupa os testes de alergénios e exige os campos operacionais", () => {
    const createEntry = { mutate: vi.fn(), isPending: false };
    render(<ControlFactoryContext.Provider value={{ factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], factoryId: "1", setFactoryId: vi.fn() }}><InternalAnalysis createEntry={createEntry} /></ControlFactoryContext.Provider>);

    expect(screen.getByText("Análises internas")).toBeTruthy();
    expect(screen.getByText("Analista responsável")).toBeTruthy();
    expect(screen.getByDisplayValue("Sabrina Esteves")).toBeTruthy();
    expect(screen.getByText("Ponto de amostragem")).toBeTruthy();
    expect(screen.getByText("Observações (obrigatórias)")).toBeTruthy();
    expect(screen.getByText("Fotografias de evidência")).toBeTruthy();
    expect(screen.getByRole("button", { name: /amostra/i })).toBeTruthy();

    expect(screen.getByText("Glúten")).toBeTruthy();
    const elisaButton = screen.getByRole("button", { name: "Teste Elisa Tremoço" });
    fireEvent.click(elisaButton);
    fireEvent.click(screen.getByRole("button", { name: "Teste rápido soja" }));
    expect(screen.getByText("2 análises selecionadas.")).toBeTruthy();
    expect(screen.getByText(/Resultado Elisa/)).toBeTruthy();
    expect(screen.getByPlaceholderText("Valor numérico ou <L.Q.")).toBeTruthy();
  });
});
