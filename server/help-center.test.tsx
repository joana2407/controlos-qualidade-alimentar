// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import HelpCenter from "../client/src/pages/HelpCenter";

describe("centro de ajuda", () => {
  afterEach(cleanup);

  it("apresenta instruções para os sete módulos e atalhos para os controlos", () => {
    render(<HelpCenter />);
    expect(screen.getByText("Ajuda para executar controlos com consistência.")).toBeTruthy();
    ["BPHF", "Detetores de metais", "Controlo sensorial", "Shelf-life", "Checklist mensal", "Caixas de sugestões", "Quebráveis"].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    expect(screen.getAllByRole("link", { name: /Abrir controlo/ })[0]?.getAttribute("href")).toBe("/controlos/bphf");
    expect(screen.getByRole("link", { name: /Ir para painel «Hoje»/ }).getAttribute("href")).toBe("/");
  });
});
