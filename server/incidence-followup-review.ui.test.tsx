// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/OfflineIncidencePanel", () => ({
  OfflineIncidencePanel: () => null,
}));
vi.mock("@/contexts/QualityAccessContext", () => ({
  useQualityAccess: () => ({
    canManage: true,
    activeProfile: { id: 3, name: "Joana Pina" },
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      quality: {
        listIncidences: { invalidate: vi.fn() },
        listTasks: { invalidate: vi.fn() },
        listIncidenceFollowUpTasks: { invalidate: vi.fn() },
      },
    }),
    quality: {
      metadata: { useQuery: () => ({ data: { factories: [], collaborators: [] } }) },
      listBphfInspectionEmployees: { useQuery: () => ({ data: [] }) },
      listIncidences: {
        useQuery: () => ({
          data: [
            {
              id: 80,
              title: "Quebrável — Lamelas Zona Lavagem",
              notes: "Lamela rasgada.",
              area: "Produção+lavagem SG",
              factoryId: 3,
              module: "fragile_items",
              completedAt: new Date("2026-08-28T13:24:22.000Z"),
              occurredOn: "2026-08-28",
              generatedNonconformity: false,
              nonconformityId: null,
              occurrenceNumber: null,
              registeredByProfileId: 3,
              registeredByName: "Joana Pina",
              registeredByTitle: "Resp. Qualidade",
              followUpReviewAlerts: [
                {
                  followUpTaskId: 1200001,
                  title: "Seguimento — Quebrável — Lamelas Zona Lavagem",
                  result: "C",
                  notes: "Lamelas substituídas.",
                  completedAt: "2026-09-08T22:12:19.000Z",
                  registeredByProfileId: 3,
                  registeredByName: "Joana Pina",
                  registeredByTitle: "Resp. Qualidade",
                },
              ],
              payload: { incidenceTreatment: { status: "completed" } },
            },
          ],
        }),
      },
      listNcs: { useQuery: () => ({ data: [] }) },
      incidenceRecurrenceAlerts: { useQuery: () => ({ data: [] }) },
      similarIncidenceAlerts: { useQuery: () => ({ data: [] }) },
      updateIncidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      listIncidenceFollowUpTasks: { useQuery: () => ({ data: [], isLoading: false }) },
      createIncidenceFollowUpTask: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      deleteIncidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      uploadVerificationEvidence: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

import Nonconformities from "../client/src/pages/Nonconformities";

afterEach(cleanup);

describe("alerta de revisão após seguimento", () => {
  it("mostra o alerta junto do tratamento, com o resultado, autoria e acesso à revisão", () => {
    render(<Nonconformities />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /Quebrável — Lamelas Zona Lavagem/i,
      })
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Revisão do tratamento necessária/i);
    expect(alert.textContent).toMatch(/Lamelas substituídas/i);
    expect(alert.textContent).toMatch(/Joana Pina/i);
    expect(screen.getByRole("button", { name: "Rever tratamento" })).toBeTruthy();
  });
});
