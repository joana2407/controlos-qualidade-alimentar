import { describe, expect, it } from "vitest";
import { canAccessWorkspace } from "../client/src/lib/workspaceAccess";

const profile = (name: string, title = "Tec. Qualidade", role: "technician" | "manager" | "viewer" = "technician") => ({ id: 1, name, title, role });

describe("matriz de acesso às áreas de trabalho", () => {
  it("permite a consulta do QualiControl à Gestão, além da equipa de qualidade", () => {
    expect(canAccessWorkspace(profile("Sabrina Esteves"), "quality")).toBe(true);
    expect(canAccessWorkspace(profile("Neuza Antunes"), "quality")).toBe(true);
    expect(canAccessWorkspace(profile("Joana Pina", "Resp. Qualidade"), "quality")).toBe(true);
    expect(canAccessWorkspace(profile("Nuno Matias"), "quality")).toBe(false);
    expect(canAccessWorkspace(profile("Gestão", "Consulta", "viewer"), "quality")).toBe(true);
  });

  it("limita Nuno Matias e Gestão exclusivamente à Gestão de Ocorrências", () => {
    expect(canAccessWorkspace(profile("Sabrina Esteves"), "occurrences")).toBe(true);
    expect(canAccessWorkspace(profile("Joana Pina", "Resp. Qualidade"), "occurrences")).toBe(true);
    expect(canAccessWorkspace(profile("Nuno Matias"), "occurrences")).toBe(true);
    expect(canAccessWorkspace(profile("Gestão", "Gestão"), "occurrences")).toBe(true);
    expect(canAccessWorkspace(profile("Neuza Antunes"), "occurrences")).toBe(false);
  });
});
