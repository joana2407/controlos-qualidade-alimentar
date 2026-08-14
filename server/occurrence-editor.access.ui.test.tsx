// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let occurrenceRole = "admin";
vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ activeProfile: { name: "Sabrina Esteves" } }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ occurrences: { invalidate: vi.fn(), get: { invalidate: vi.fn() } } }), quality: { listFactories: { useQuery: () => ({ data: [] }) } }, occurrences: { access: { useQuery: () => ({ data: { role: occurrenceRole, scope: "all" } }) }, list: { useQuery: () => ({ data: { data: [] } }) }, get: { useQuery: () => ({ data: undefined, isLoading: false }) }, create: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) }, update: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) }, uploadImage: { useMutation: () => ({ mutateAsync: vi.fn() }) }, suggestTreatment: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) }, suggestBrc: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) } } } }));
vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>, useRoute: () => [false, null], useLocation: () => ["/ocorrencias/nova", vi.fn()] }));

import OccurrenceEditor from "../client/src/pages/OccurrenceEditor";

afterEach(cleanup);
describe("autorização de eficácia no editor de ocorrências", () => {
  it("permite eficácia a um perfil com papel admin mesmo que não seja manager global", () => {
    occurrenceRole = "admin"; render(<OccurrenceEditor />);
    const input = screen.getByText("Responsável pela eficácia").parentElement?.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });
  it("mantém eficácia bloqueada para o papel de consulta", () => {
    occurrenceRole = "gestao"; render(<OccurrenceEditor />);
    const input = screen.getByText("Responsável pela eficácia").parentElement?.querySelector("input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByText(/papel de administração de ocorrências/)).toBeTruthy();
  });
});
