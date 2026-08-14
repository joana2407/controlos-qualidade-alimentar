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
});
