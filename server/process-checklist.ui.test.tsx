// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProcessChecklist from "../client/src/pages/ProcessChecklist";
import { PROCESS_CONTROL_CATALOG } from "../client/src/lib/processControlCatalog";

const qualityAccess = vi.hoisted(() => ({ canManage: true }));
vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ activeProfile: { id: 3, name: "Joana Pina", title: "Resp. Qualidade", role: "manager" }, canManage: qualityAccess.canManage, canOperate: true }) }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  qualityAccess.canManage = true;
});

describe("Checklist de Processos", () => {
  it("mantém catálogo por fábrica, produto e fase", () => {
    expect(Object.keys(PROCESS_CONTROL_CATALOG["1"].products).length).toBeGreaterThan(20);
    expect(Object.keys(PROCESS_CONTROL_CATALOG["2"].products)).toContain("Trigo Pão da Serra");
    expect(Object.keys(PROCESS_CONTROL_CATALOG["3"].products)).toContain("Pastel de Nata DF");
    expect(PROCESS_CONTROL_CATALOG["2"].products["Trigo Pão da Serra"][1]).toContain("Verificação dos lotes a uso");
  });

  it("disponibiliza o ponto de lotes para todos os produtos das três fábricas", () => {
    for (const factory of Object.values(PROCESS_CONTROL_CATALOG)) {
      for (const product of Object.values(factory.products)) {
        expect(product[1].some(parameter => parameter.toLocaleLowerCase("pt-PT").includes("lote"))).toBe(true);
      }
    }
  });

  it("carrega os pontos da fase selecionada e valida campos obrigatórios", () => {
    render(<ProcessChecklist />);
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(screen.getByText("Broa de Milho"));
    expect(screen.getByText("Verificação dos lotes a uso")).toBeTruthy();
    expect(screen.getByLabelText("MP")).toBeTruthy();
    expect(screen.getByLabelText("Lote")).toBeTruthy();
    expect(screen.getByLabelText("Validade")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "C" }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole("button", { name: "NC" }).length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar MP" }));
    expect(screen.getAllByLabelText("MP")).toHaveLength(2);
    expect(screen.getAllByLabelText("Lote")).toHaveLength(2);
    expect(screen.getAllByLabelText("Validade")).toHaveLength(2);
    expect(screen.getByText("Guardar checklist")).toBeTruthy();
  });

  it("regista o código de receita em qualquer fábrica e preserva-o no histórico", () => {
    render(<ProcessChecklist />);
    const recipeCode = screen.getByLabelText("Código da receita") as HTMLInputElement;
    fireEvent.change(recipeCode, { target: { value: "REC-F1-042" } });
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(screen.getByText("Fábrica 3 · SG"));
    expect((screen.getByLabelText("Código da receita") as HTMLInputElement).value).toBe("REC-F1-042");

    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(screen.getByText("Bolo Avó Mármore"));
    fireEvent.click(screen.getAllByRole("combobox")[2]);
    fireEvent.click(screen.getByText("Fase final"));
    fireEvent.change(screen.getByPlaceholderText("Ex.: 06:00–14:00 / Turno A"), { target: { value: "06:00–14:00" } });
    fireEvent.change(screen.getByPlaceholderText("Nome do responsável"), { target: { value: "Técnica de teste" } });
    screen.getAllByRole("button", { name: "C" }).forEach((button) => fireEvent.click(button));
    fireEvent.click(screen.getByRole("button", { name: "Guardar checklist" }));

    const stored = JSON.parse(localStorage.getItem("qualicontrol-process-checklist-v1") ?? "[]");
    expect(stored[0].recipeCode).toBe("REC-F1-042");
    expect(screen.getByText(/Receita: REC-F1-042/)).toBeTruthy();
  });

  it("permite à Responsável criar um produto e definir os parâmetros das três fases", () => {
    render(<ProcessChecklist />);
    fireEvent.click(screen.getByRole("button", { name: "Gerir produtos e parâmetros" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar novo produto" }));
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Pão de teste" } });
    fireEvent.change(screen.getByLabelText("Fase inicial"), { target: { value: "Verificação dos lotes a uso\nAmassadeira: 5 min" } });
    fireEvent.change(screen.getByLabelText("Fase de produção"), { target: { value: "Gramagem: 0,500 kg" } });
    fireEvent.change(screen.getByLabelText("Fase final"), { target: { value: "Nº de unidades por massa" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuração" }));

    const stored = JSON.parse(localStorage.getItem("qualicontrol-process-catalog-v1") ?? "{}");
    expect(stored.catalog["1"].products["Pão de teste"]).toEqual({
      1: ["Verificação dos lotes a uso", "Amassadeira: 5 min"],
      2: ["Gramagem: 0,500 kg"],
      3: ["Nº de unidades por massa"],
    });
  });

  it("permite à Responsável editar os parâmetros de um produto predefinido", () => {
    render(<ProcessChecklist />);
    fireEvent.click(screen.getByRole("button", { name: "Gerir produtos e parâmetros" }));
    fireEvent.change(screen.getByLabelText("Fase inicial"), { target: { value: "Verificação dos lotes a uso\nParâmetro revisto" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuração" }));

    const stored = JSON.parse(localStorage.getItem("qualicontrol-process-catalog-v1") ?? "{}");
    expect(stored.catalog["1"].products["Broa de Milho"][1]).toEqual(["Verificação dos lotes a uso", "Parâmetro revisto"]);
  });

  it("oculta a gestão de configurações para perfis sem autorização de Responsável", () => {
    qualityAccess.canManage = false;
    render(<ProcessChecklist />);
    expect(screen.queryByRole("button", { name: "Gerir produtos e parâmetros" })).toBeNull();
  });
});
