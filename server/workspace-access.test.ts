import { describe, expect, it } from "vitest";
import { canAccessWorkspace } from "../client/src/lib/workspaceAccess";

const profile = (name: string, title = "Tec. Qualidade") => ({ id: 1, name, title, role: "technician" as const });

describe("matriz de acesso às áreas de trabalho", () => {
  it("mantém QualiControl apenas para Sabrina, Neuza e Joana", () => {
    expect(canAccessWorkspace(profile("Sabrina Esteves"), "quality")).toBe(true);
    expect(canAccessWorkspace(profile("Neuza Antunes"), "quality")).toBe(true);
    expect(canAccessWorkspace(profile("Joana Pina", "Resp. Qualidade"), "quality")).toBe(true);
    expect(canAccessWorkspace(profile("Nuno Matias"), "quality")).toBe(false);
    expect(canAccessWorkspace(profile("Gestão", "Gestão"), "quality")).toBe(false);
  });

  it("limita Nuno Matias e Gestão exclusivamente à Gestão de Ocorrências", () => {
    expect(canAccessWorkspace(profile("Sabrina Esteves"), "occurrences")).toBe(true);
    expect(canAccessWorkspace(profile("Joana Pina", "Resp. Qualidade"), "occurrences")).toBe(true);
    expect(canAccessWorkspace(profile("Nuno Matias"), "occurrences")).toBe(true);
    expect(canAccessWorkspace(profile("Gestão", "Gestão"), "occurrences")).toBe(true);
    expect(canAccessWorkspace(profile("Neuza Antunes"), "occurrences")).toBe(false);
  });
});
