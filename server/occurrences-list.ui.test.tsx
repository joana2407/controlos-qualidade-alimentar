// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const setLocation = vi.fn();
const { listQuery } = vi.hoisted(() => ({ listQuery: vi.fn(() => ({ data: { total: 1, data: [{ id: 1, number: 7, occurredOn: new Date("2026-08-14"), type: "NC", origin: "I", description: "Desvio de higiene", sgsqaScope: "M1-BPHF", responsible: "Sabrina", implementationDueOn: new Date("2026-08-20"), status: "ABERTO", effectiveness: null }] }, isLoading: false, isFetching: false, refetch: vi.fn() })) }));

vi.mock("wouter", () => ({ useLocation: () => ["/ocorrencias/lista", setLocation], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/QualityAccessContext", () => ({ useQualityAccess: () => ({ canManage: true }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ occurrences: { list: { invalidate: vi.fn() } } }), quality: { listFactories: { useQuery: () => ({ data: [{ code: "F1_FATIADO", name: "Fábrica 1 (Fatiado)" }] }) } }, occurrences: { list: { useQuery: listQuery }, delete: { useMutation: () => ({ mutate: vi.fn() }) } } } }));

import OccurrencesList from "../client/src/pages/OccurrencesList";

afterEach(() => { cleanup(); localStorage.clear(); listQuery.mockClear(); });

describe("lista de ocorrências preservada", () => {
  it("expõe os filtros avançados e a tabela operacional familiar", () => {
    render(<OccurrencesList />);
    expect(screen.getByText("Descrição / Produto")).toBeTruthy();
    expect(screen.getByText("Âmbito SGSQA")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /filtros/i }));
    expect(screen.getByPlaceholderText("Nome...")).toBeTruthy();
    expect(screen.getByPlaceholderText("ex: 3.6.1")).toBeTruthy();
    expect(screen.getByText("Sem eficácia")).toBeTruthy();
    expect(screen.getAllByText("Prazo").length).toBeGreaterThan(1);
  });
});
