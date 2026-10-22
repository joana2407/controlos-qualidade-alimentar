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
    expect(PROCESS_CONTROL_CATALOG["2"].products["Trigo Pão da Serra"][1]).toContain("PESAGEM DE MP");
  });

  it("disponibiliza o ponto de lotes para todos os produtos das três fábricas", () => {
    for (const factory of Object.values(PROCESS_CONTROL_CATALOG)) {
      for (const product of Object.values(factory.products)) {
        expect(product[1].some(parameter => parameter === "PESAGEM DE MP")).toBe(true);
      }
    }
  });

  it("carrega os pontos da fase selecionada e valida campos obrigatórios", () => {
    render(<ProcessChecklist />);
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(screen.getByText("Broa de Milho"));
    expect(screen.getByText("PESAGEM DE MP")).toBeTruthy();
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

  it("apresenta empelos por massa no tender e motivos no ponto de quebras", () => {
    render(<ProcessChecklist />);
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(screen.getByText("Broa de Milho"));
    fireEvent.click(screen.getAllByRole("combobox")[2]);
    fireEvent.click(screen.getByText("Fase final"));
    expect(screen.getByText("Motivos de quebra")).toBeTruthy();
    expect(screen.getByText("Nº Quebras")).toBeTruthy();
    expect(screen.getByLabelText("Metal")).toBeTruthy();
    expect(screen.getByLabelText("Mal cozido")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Metal"));
    fireEvent.click(screen.getByLabelText("Outro"));
    expect(screen.getByLabelText("Outro motivo — qual?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Outro motivo — qual?"), { target: { value: "Falha na linha" } });
    expect((screen.getByLabelText("Outro motivo — qual?") as HTMLInputElement).value).toBe("Falha na linha");
  });

  it("calcula unidades de venda, percentagem de quebra e rentabilidade no embalamento", () => {
    render(<ProcessChecklist />);
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(screen.getByText("Broa de Milho"));
    fireEvent.click(screen.getAllByRole("combobox")[2]);
    fireEvent.click(screen.getByText("Fase de produção"));
    fireEvent.change(screen.getByLabelText("Forma de embalamento primário"), { target: { value: "Saco" } });
    fireEvent.change(screen.getByLabelText("N.º unidades / unidade de venda"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("N.º unidades / caixa"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("N.º unidades produzidas"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("N.º unidades embaladas"), { target: { value: "8" } });
    expect(screen.getByText("Unidades de venda")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("20.00%", { exact: false })).toBeTruthy();
    expect(screen.getByText("80.00%", { exact: false })).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Responsável pela fase"), { target: { value: "Responsável da produção" } });
    screen.getAllByRole("button", { name: "C" }).forEach((button) => fireEvent.click(button));
    fireEvent.click(screen.getByRole("button", { name: "Guardar checklist" }));

    const stored = JSON.parse(localStorage.getItem("qualicontrol-process-checklist-v1") ?? "[]");
    expect(stored[0].recipeCode).toBe("REC-F1-042");
    expect(stored[0].responsiblePhase).toBe("Responsável da produção");
    expect(screen.getByText(/Responsável da fase: Responsável da produção/)).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("Fase inicial"), { target: { value: "PESAGEM DE MP\nParâmetro revisto" } });
    fireEvent.change(screen.getByLabelText("Formatos de embalagem"), { target: { value: "Saco 5 un | 5 | 20\nSaco individual | 1 | 30" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuração" }));

    const stored = JSON.parse(localStorage.getItem("qualicontrol-process-catalog-v1") ?? "{}");
    expect(stored.catalog["1"].products["Broa de Milho"][1]).toEqual(["PESAGEM DE MP", "Parâmetro revisto"]);
    const packaging = JSON.parse(localStorage.getItem("qualicontrol-process-packaging-catalog-v1") ?? "{}");
    expect(packaging["1"]["Broa de Milho"]).toEqual([
      { name: "Saco 5 un", unitsPerSalesUnit: "5", unitsPerBox: "20" },
      { name: "Saco individual", unitsPerSalesUnit: "1", unitsPerBox: "30" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(screen.getByText("Broa de Milho"));
    fireEvent.click(screen.getAllByRole("combobox")[2]);
    fireEvent.click(screen.getByText("Fase de produção"));
    expect((screen.getByLabelText("Forma de embalamento primário") as HTMLInputElement).value).toBe("Saco 5 un");
    expect((screen.getByLabelText("N.º unidades / unidade de venda") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("N.º unidades / caixa") as HTMLInputElement).value).toBe("20");
  });

  it("oculta a gestão de configurações para perfis sem autorização de Responsável", () => {
    qualityAccess.canManage = false;
    render(<ProcessChecklist />);
    expect(screen.queryByRole("button", { name: "Gerir produtos e parâmetros" })).toBeNull();
  });
});
