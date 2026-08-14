// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const occurrence = { id: 7, number: 42, occurredOn: new Date("2026-08-14"), status: "ABERTO", recurrent: true, recurrenceOfId: 2, origin: "I", factoryCode: "F1_FATIADO", clientSupplierAuditor: "—", brcRequirement: "4.11", sgsqaScope: "M1-BPHF", affectedProduct: "Pão de forma", lot: "L-42", expiry: "2026-08-20", rawMaterialLot: null, quantity: "12 cx", nonconformingProductClass: "PNC C1", description: "Desvio de higiene registado.", hazardType: "B", hazardDescription: "Contaminação microbiológica", justification: "Risco para o produto", rootCauseAnalysis: "Instrução não seguida", correction: "Segregação", correctionResponsible: "Sabrina", correctionImplementedOn: new Date("2026-08-14"), correctionEvidence: "Foto e registo", correctionEvidenceImages: "[]", correctiveAction: "Reforço de formação", correctiveActionResponsible: "Neuza", correctiveActionDueOn: new Date("2026-08-20"), correctiveActionClosedOn: null, correctiveActionEvidence: null, correctiveActionEvidenceImages: "[]", implementationDueOn: new Date("2026-08-20"), responsible: "Sabrina", closedOn: null, closingResponsible: null, effectivenessResponsible: null, effectivenessEvidence: null, assessmentMethod: null, effectiveness: "", impactsObjectives: "Não", effect: null, observations: null, descriptionImages: "[]" };
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ occurrences: { invalidate: vi.fn() } }),
    occurrences: { get: { useQuery: () => ({ data: occurrence, isLoading: false }) }, delete: { useMutation: () => ({ mutate: vi.fn() }) }, access: { useQuery: () => ({ data: { role: "admin", scope: "all" } }) } },
  },
}));
vi.mock("wouter", () => ({ Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>, useRoute: () => [true, { id: "7" }], useLocation: () => ["/ocorrencias/7", vi.fn()] }));

import OccurrenceDetail from "../client/src/pages/OccurrenceDetail";

afterEach(cleanup);
describe("detalhe preservado de ocorrência", () => {
  it("apresenta leitura estruturada, ações e ligação para edição", () => {
    render(<OccurrenceDetail />);
    expect(screen.getByRole("heading", { name: "Ocorrência #42" })).toBeTruthy();
    expect(screen.getByText("Ocorrência reincidente da ocorrência #2.")).toBeTruthy();
    expect(screen.getByText("Descrição e análise")).toBeTruthy();
    expect(screen.getByText("Correção imediata")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Editar/ }).getAttribute("href")).toBe("/ocorrencias/7/editar");
    expect(screen.getByRole("button", { name: /Eliminar/ })).toBeTruthy();
  });
});
