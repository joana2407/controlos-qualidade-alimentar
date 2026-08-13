// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import PlatformOverview from "../client/src/pages/PlatformOverview";

describe("visão geral da plataforma", () => {
  afterEach(cleanup);

  it("apresenta o fluxo operacional e os sete módulos de controlo", () => {
    render(<PlatformOverview />);
    expect(screen.getByText("Qualidade alimentar organizada por ação.")).toBeTruthy();
    expect(screen.getByText("Sete módulos, um único fluxo de qualidade.")).toBeTruthy();
    ["BPHF", "Detetores de metais", "Controlo sensorial", "Shelf-life", "Checklist mensal", "Caixas de sugestões", "Quebráveis"].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
  });

  it("liga os atalhos principais aos destinos operacionais", () => {
    render(<PlatformOverview />);
    expect(screen.getByRole("link", { name: /Abrir painel «Hoje»/ }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: /Explorar controlos/ }).getAttribute("href")).toBe("/controlos");
    expect(screen.getByRole("link", { name: /BPHF/ }).getAttribute("href")).toBe("/controlos/bphf");
    expect(screen.getByRole("link", { name: /Quebráveis/ }).getAttribute("href")).toBe("/controlos/fragile_items");
  });
});
