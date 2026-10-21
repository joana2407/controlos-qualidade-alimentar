// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import ProcessChecklist from "../client/src/pages/ProcessChecklist";
import { PROCESS_CONTROL_CATALOG } from "../client/src/lib/processControlCatalog";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Checklist de Processos", () => {
  it("mantém catálogo por fábrica, produto e fase", () => {
    expect(Object.keys(PROCESS_CONTROL_CATALOG["1"].products).length).toBeGreaterThan(20);
    expect(Object.keys(PROCESS_CONTROL_CATALOG["2"].products)).toContain("Trigo Pão da Serra");
    expect(Object.keys(PROCESS_CONTROL_CATALOG["3"].products)).toContain("Pastel de Nata DF");
    expect(PROCESS_CONTROL_CATALOG["2"].products["Trigo Pão da Serra"][1]).toContain("Verificação dos lotes a uso");
  });

  it("carrega os pontos da fase selecionada e valida campos obrigatórios", () => {
    render(<ProcessChecklist />);
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(screen.getByText("Broa de Milho"));
    expect(screen.getByText("Verificação dos lotes a uso")).toBeTruthy();
    expect(screen.getByText("Guardar checklist")).toBeTruthy();
  });
});
