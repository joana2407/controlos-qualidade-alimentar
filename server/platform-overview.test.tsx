// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import PlatformOverview from "../client/src/pages/PlatformOverview";

describe("visão geral da plataforma", () => {
  afterEach(cleanup);

  it("apresenta o fluxo operacional e os guias integrados sem duplicar atalhos de controlo", () => {
    render(<PlatformOverview />);
    expect(screen.getByText("Qualidade alimentar organizada por ação.")).toBeTruthy();
    expect(screen.queryByText("Acesso rápido aos controlos.")).toBeNull();
    expect(screen.queryByText("Verifique pelo menos um operador em cada área aplicável.")).toBeNull();
    expect(screen.getByText("Como executar cada controlo.")).toBeTruthy();
    ["BPHF", "Detetores de metais", "Controlo sensorial", "Shelf-life", "Checklist Mensal", "Caixas de sugestões", "Quebráveis", "Controlo à expedição", "Análises internas", "Controlos de Temperatura"].forEach((label) => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
    expect(screen.getByText("Um desvio cria uma Incidência; só a decisão de tratamento pode gerar uma NC.")).toBeTruthy();
    expect(screen.getByText("1. Desvio → Incidência")).toBeTruthy();
    expect(screen.getByText("2. Tratar e decidir")).toBeTruthy();
    expect(screen.getByText("3. NC gerada quando aplicável")).toBeTruthy();
    expect(screen.getByText(/«Incidências» conta os desvios registados; «NC geradas» conta apenas/)).toBeTruthy();
    expect(screen.getByText(/3 incidências semelhantes no mesmo controlo/)).toBeTruthy();
    expect(screen.getByText("Concluir uma pendência de um dia anterior.")).toBeTruthy();
    expect(screen.getByText("Data prevista")).toBeTruthy();
    expect(screen.getByText("Data de realização")).toBeTruthy();
    expect(screen.getByText("Data e hora de registo")).toBeTruthy();
    expect(screen.getByText("Autor")).toBeTruthy();
  });

  it("liga o painel Hoje e os guias aos destinos operacionais", () => {
    render(<PlatformOverview />);
    expect(screen.getByRole("link", { name: /Abrir painel «Hoje»/ }).getAttribute("href")).toBe("/");
    expect(document.querySelector('a[href="/controlos/bphf"]')).toBeTruthy();
    expect(document.querySelector('a[href="/controlos/fragile_items"]')).toBeTruthy();
    expect(document.querySelector('a[href="/controlos/dispatch_control"]')).toBeTruthy();
    expect(screen.getByRole("link", { name: /Consultar incidências/i }).getAttribute("href")).toBe("/incidencias");
  });

  it("apresenta orientação PWA para Android e iPhone sem depender de uma instalação pendente", () => {
    render(<PlatformOverview />);
    expect(screen.getByText("Instale o QualiControl no telemóvel.")).toBeTruthy();
    const installButton = screen.getByRole("button", { name: "Instalar no telemóvel" });
    expect(installButton).toBeTruthy();
    fireEvent.click(installButton);
    expect(screen.getByText("Instalar QualiControl no telemóvel")).toBeTruthy();
    expect(screen.getByText("Android — Chrome ou Edge")).toBeTruthy();
    expect(screen.getByText("iPhone — Safari")).toBeTruthy();
  });
});
