// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import PlatformOverview from "../client/src/pages/PlatformOverview";

describe("visão geral da plataforma", () => {
  afterEach(cleanup);

  it("apresenta o fluxo operacional e os guias integrados sem duplicar atalhos de controlo", () => {
    render(<PlatformOverview />);
    expect(screen.getByText("Qualidade alimentar organizada por ação.")).toBeTruthy();
    expect(screen.queryByText("Acesso rápido aos controlos.")).toBeNull();
    expect(screen.getByText("Como executar cada controlo.")).toBeTruthy();
    ["BPHF", "Detetores de metais", "Controlo sensorial", "Shelf-life", "Checklist mensal", "Caixas de sugestões", "Quebráveis", "Controlo à expedição", "Análises internas", "Controlos de Temperatura"].forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    expect(screen.getByText("Registe o desvio primeiro; gere uma NC apenas quando a avaliação o justificar.")).toBeTruthy();
    expect(screen.getByText("1. Registar incidência")).toBeTruthy();
    expect(screen.getByText("2. Decidir sobre a NC")).toBeTruthy();
  });

  it("liga o painel Hoje e os guias aos destinos operacionais", () => {
    render(<PlatformOverview />);
    expect(screen.getByRole("link", { name: /Abrir painel «Hoje»/ }).getAttribute("href")).toBe("/");
    expect(document.querySelector('a[href="/controlos/bphf"]')).toBeTruthy();
    expect(document.querySelector('a[href="/controlos/fragile_items"]')).toBeTruthy();
    expect(document.querySelector('a[href="/controlos/dispatch_control"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: /Consultar incidências/i }).getAttribute("href")).toBe("/incidencias");
  });
});
