// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { QualityAccessProvider } from "../client/src/contexts/QualityAccessContext";
import WorkspaceSelector from "../client/src/pages/WorkspaceSelector";

describe("seletor de áreas de trabalho", () => {
  beforeEach(() => cleanup());

  it("mantém acessos separados para QualiControl e Gestão de Ocorrências", () => {
    render(<QualityAccessProvider value={{ activeProfile: { id: 1, name: "Joana Pina", title: "Resp. Qualidade", role: "manager" }, canManage: true }}><WorkspaceSelector /></QualityAccessProvider>);
    expect(screen.getByRole("link", { name: /qualicontrol/i }).getAttribute("href")).toBe("/qualicontrol");
    expect(screen.getByRole("link", { name: /gestão de ocorrências/i }).getAttribute("href")).toBe("/ocorrencias");
  });

  it("mostra Gestão de Ocorrências exclusivamente para Nuno Matias e para Gestão", () => {
    const { rerender } = render(<QualityAccessProvider value={{ activeProfile: { id: 4, name: "Nuno Matias", title: "Técnico", role: "technician" }, canManage: false }}><WorkspaceSelector /></QualityAccessProvider>);
    expect(screen.queryByRole("link", { name: /qualicontrol/i })).toBeNull();
    expect(screen.getByRole("link", { name: /gestão de ocorrências/i }).getAttribute("href")).toBe("/ocorrencias");
    rerender(<QualityAccessProvider value={{ activeProfile: { id: 5, name: "Gestão", title: "Gestão", role: "technician" }, canManage: false }}><WorkspaceSelector /></QualityAccessProvider>);
    expect(screen.queryByRole("link", { name: /qualicontrol/i })).toBeNull();
    expect(screen.getByRole("link", { name: /gestão de ocorrências/i })).toBeTruthy();
  });

  it("mantém Neuza exclusivamente no QualiControl", () => {
    render(<QualityAccessProvider value={{ activeProfile: { id: 2, name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" }, canManage: false }}><WorkspaceSelector /></QualityAccessProvider>);
    expect(screen.getByRole("link", { name: /qualicontrol/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /gestão de ocorrências/i })).toBeNull();
  });
});
