// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ControlFactoryContext, InternalAnalysis } from "../client/src/pages/ModuleControl";

afterEach(cleanup);

describe("controlo de análises internas", () => {
  it("agrupa os testes de alergénios e exige os campos operacionais", () => {
    const createEntry = { mutate: vi.fn(), isPending: false };
    render(<ControlFactoryContext.Provider value={{ factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], factoryId: "1", setFactoryId: vi.fn() }}><InternalAnalysis createEntry={createEntry} /></ControlFactoryContext.Provider>);

    expect(screen.getByText("Análises internas")).toBeTruthy();
    expect(screen.getByText("Nome do analista / operador")).toBeTruthy();
    expect(screen.getByText("Lote / ponto de amostragem")).toBeTruthy();
    expect(screen.getByText("Observações (obrigatórias)")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    expect(screen.getByText("Glúten")).toBeTruthy();
    expect(screen.getAllByText("Teste Elisa Tremoço").length).toBeGreaterThan(0);
  });
});
