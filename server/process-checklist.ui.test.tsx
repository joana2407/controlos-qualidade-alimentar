// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProcessChecklist from "../client/src/pages/ProcessChecklist";
import { PROCESS_CONTROL_CATALOG, restructureProcessCatalog } from "../client/src/lib/processControlCatalog";

const qualityAccess = vi.hoisted(() => ({ canManage: true }));
vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ activeProfile: { id: 3, name: "Joana Pina", title: "Resp. Qualidade", role: "manager" }, canManage: qualityAccess.canManage, canOperate: true }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { quality: { listBphfInspectionEmployees: { useQuery: () => ({ data: [{ id: 1, name: "Responsável da produção" }] }) } } } }));

const selectOption = (label: string, option: string) => {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByText(option));
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  qualityAccess.canManage = true;
  vi.restoreAllMocks();
});

describe("Controlo de Processos", () => {
  it("aplica a grelha transversal a todos os produtos das três fábricas", () => {
    const requiredPhases = ["Pesagem e amassadura", "Produção", "Cozedura", "Embalamento"];
    const requiredPoints: Record<string, string[]> = {
      "Pesagem e amassadura": ["PESAGEM DE MP", "Amassadura"],
      "Produção": ["Repouso", "Tender/dividir a massa", "Nº unidades por massa", "Levedação", "Acabamento"],
      "Cozedura": ["Tratamento térmico"],
      "Embalamento": ["Condições de embalamento", "Rotulagem", "Nº Quebras", "Nº Sobras", "Nº Amostras", "Nº Cx/massa"],
    };

    for (const factory of Object.values(PROCESS_CONTROL_CATALOG)) {
      for (const product of Object.values(factory.products)) {
        expect(product.phases.map(phase => phase.name)).toEqual(requiredPhases);
        for (const phase of product.phases) {
          expect(phase.parameters.map(parameter => parameter.split(" — ")[0])).toEqual(expect.arrayContaining(requiredPoints[phase.name]));
        }
      }
    }
  });

  it("migra um catálogo local anterior sem perder parâmetros específicos", () => {
    const migrated = restructureProcessCatalog({
      "1": { sheet: "Fábrica 1", products: { "Produto de teste": { 1: ["PESAGEM DE MP", "Amassadeira: 10 min"], 2: ["Forno: 220 ºC", "Embalamento"], 3: ["Nº Quebras"] } } },
      "2": { sheet: "Fábrica 2", products: {} },
      "3": { sheet: "Fábrica 3", products: {} },
    } as any);
    const phases = migrated["1"].products["Produto de teste"].phases;
    expect(phases.find(phase => phase.name === "Pesagem e amassadura")?.parameters).toContain("Amassadura — Amassadeira: 10 min");
    expect(phases.find(phase => phase.name === "Cozedura")?.parameters).toContain("Tratamento térmico — Forno: 220 ºC");
    expect(phases.find(phase => phase.name === "Embalamento")?.parameters.map(parameter => parameter.split(" — ")[0])).toEqual(expect.arrayContaining(["Condições de embalamento", "Nº Quebras", "Nº Amostras"]));
  });

  it("preserva as fases que a Responsável decidiu eliminar numa configuração guardada", () => {
    const savedCatalog = {
      "1": { sheet: "Fábrica 1", products: { "Produto configurado": { phases: [{ id: "1", name: "Pesagem", parameters: ["PESAGEM DE MP"] }, { id: "2", name: "Produção", parameters: ["Amassadura"] }] } } },
      "2": { sheet: "Fábrica 2", products: {} },
      "3": { sheet: "Fábrica 3", products: {} },
    } as any;
    expect(restructureProcessCatalog(savedCatalog)["1"].products["Produto configurado"].phases.map(phase => phase.name)).toEqual(["Pesagem", "Produção"]);
  });

  it("disponibiliza os horários predefinidos e muda o turno ao trocar de fábrica", () => {
    render(<ProcessChecklist />);
    expect((screen.getByLabelText("Horário do turno") as HTMLButtonElement).textContent).toContain("15h-23h");
    selectOption("Fábrica", "Fábrica 2 · Granel");
    expect((screen.getByLabelText("Horário do turno") as HTMLButtonElement).textContent).toContain("15-23h");
    selectOption("Fábrica", "Fábrica 3 · SG");
    expect((screen.getByLabelText("Horário do turno") as HTMLButtonElement).textContent).toContain("14h-22h");
  });

  it("apresenta a validação individual e várias MP na pesagem", () => {
    render(<ProcessChecklist />);
    selectOption("Produto", "Broa de Milho");
    expect(screen.getByText("PESAGEM DE MP")).toBeTruthy();
    expect(screen.getByLabelText("MP")).toBeTruthy();
    expect(screen.getByLabelText("Lote")).toBeTruthy();
    expect(screen.getByLabelText("Validade")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Adicionar MP" }));
    expect(screen.getAllByLabelText("MP")).toHaveLength(2);
    expect(screen.getAllByLabelText("Lote")).toHaveLength(2);
    expect(screen.getAllByLabelText("Validade")).toHaveLength(2);
  });

  it("mantém cálculo e reconciliação em Condições de embalamento", () => {
    render(<ProcessChecklist />);
    selectOption("Produto", "Broa de Milho");
    selectOption("Fase", "Embalamento");
    expect(screen.getByText("Condições de embalamento")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Forma de embalamento primário"), { target: { value: "Saco" } });
    fireEvent.change(screen.getByLabelText("N.º unidades / unidade de venda"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("N.º unidades / caixa"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("N.º unidades produzidas"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("N.º Cx Final"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("N.º de quebras"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("N.º de sobras"), { target: { value: "0" } });
    expect(screen.getByText("4 em falta")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("N.º Cx Final"), { target: { value: "2" } });
    expect(screen.getByText("20.00%", { exact: false })).toBeTruthy();
    expect(screen.getByText("80.00%", { exact: false })).toBeTruthy();
  });

  it("permite criar produto, acrescentar fase e definir pontos individuais", () => {
    render(<ProcessChecklist />);
    fireEvent.click(screen.getByRole("button", { name: "Gerir produtos e parâmetros" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar novo produto" }));
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Pão de teste" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar fase" }));
    fireEvent.change(screen.getByLabelText("Nome da fase 5"), { target: { value: "Arrefecimento" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Adicionar ponto de controlo" })[4]);
    fireEvent.change(screen.getByLabelText("Ponto 1 da fase 5"), { target: { value: "Arrefecimento — inferior a 30 ºC" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar configuração" }));

    const stored = JSON.parse(localStorage.getItem("qualicontrol-process-catalog-v1") ?? "{}");
    const configuredProduct = stored.catalog["1"].products["Pão de teste"];
    expect(configuredProduct.phases.map((phase: { name: string }) => phase.name)).toEqual(expect.arrayContaining(["Pesagem e amassadura", "Embalamento", "Arrefecimento"]));
    expect(configuredProduct.phases.find((phase: { name: string }) => phase.name === "Arrefecimento").parameters).toEqual(["Arrefecimento — inferior a 30 ºC"]);
  });

  it("permite à Responsável eliminar pontos, fases e produtos com confirmação", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ProcessChecklist />);
    fireEvent.click(screen.getByRole("button", { name: "Gerir produtos e parâmetros" }));
    const initialPointCount = screen.getAllByRole("button", { name: /Eliminar ponto \d+ da fase/ }).length;
    fireEvent.click(screen.getAllByRole("button", { name: /Eliminar ponto 1 da fase/ })[0]);
    expect(screen.getAllByRole("button", { name: /Eliminar ponto \d+ da fase/ }).length).toBe(initialPointCount - 1);
    fireEvent.click(screen.getAllByRole("button", { name: "Eliminar fase" })[3]);
    expect(screen.queryByLabelText("Nome da fase 4")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar produto" }));
    expect(screen.getByLabelText("Nome do produto")).toBeTruthy();
  });

  it("oculta a gestão de configurações para perfis sem autorização de Responsável", () => {
    qualityAccess.canManage = false;
    render(<ProcessChecklist />);
    expect(screen.queryByRole("button", { name: "Gerir produtos e parâmetros" })).toBeNull();
  });
});
