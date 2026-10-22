// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import HelpCenter from "../client/src/pages/HelpCenter";

describe("centro de ajuda", () => {
  afterEach(cleanup);

  it("apresenta instruções para os oito módulos e atalhos para os controlos", () => {
    render(<HelpCenter />);
    expect(screen.getByText("Ajuda para executar controlos com consistência.")).toBeTruthy();
    ["BPHF", "Detetores de metais", "Controlo sensorial", "Shelf-life", "Checklist Mensal", "Caixas de sugestões", "Quebráveis", "Controlo à expedição"].forEach((label) => expect(screen.getByText(label)).toBeTruthy());
    const controlLinks = screen.getAllByRole("link", { name: /Abrir controlo/ });
    expect(controlLinks[0]?.getAttribute("href")).toBe("/controlos/bphf");
    expect(controlLinks.some((link) => link.getAttribute("href") === "/controlos/dispatch_control")).toBe(true);
    expect(screen.getByRole("link", { name: /Ir para painel «Hoje»/ }).getAttribute("href")).toBe("/");
  });
});
