// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

if (!HTMLElement.prototype.hasPointerCapture)
  HTMLElement.prototype.hasPointerCapture = () => false;
if (!HTMLElement.prototype.scrollIntoView)
  HTMLElement.prototype.scrollIntoView = () => undefined;

const route = vi.hoisted(() => ({ value: "dispatch_control" }));
const updateEntry = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/QualityAccessContext", () => ({
  useQualityAccess: () => ({
    activeProfile: { id: 2, name: "Sabrina Esteves", role: "technician" },
    canManage: true,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      quality: {
        dashboard: { invalidate: vi.fn() },
        reports: { invalidate: vi.fn() },
        listNcs: { invalidate: vi.fn() },
        fragilePending: { invalidate: vi.fn() },
        dailyControlResults: { invalidate: vi.fn() },
      },
    }),
    quality: {
      metadata: {
        useQuery: () => ({ data: { factories: [], areas: [] } }),
      },
      dashboard: {
        useQuery: () => ({
          isLoading: false,
          data: { moduleProgress: {}, moduleProgressByFactory: {} },
        }),
      },
      dailyControlResults: {
        useQuery: () => ({
          isLoading: false,
          data: {
            entries: [
              {
                id: 9138,
                title: "Expedição 9138 — JCL",
                area: "Expedição ambiente",
                factoryId: null,
                result: "N/A",
                notes: "Uma referência não foi verificada.",
                completedAt: new Date("2026-09-01T15:45:06"),
                registeredByProfileId: 2,
                registeredByName: "Sabrina Esteves",
                registeredByTitle: "Tec. Qualidade",
                payload: {
                  profile: "ambiente",
                  orderNumber: "9138",
                  customer: "JCL",
                  vehicleTemperature: 8,
                  observations: "Temperatura do veículo dentro do limite.",
                  verificationSummary: { verified: 1, notVerified: 1 },
                  reasons: [
                    "Sementes de girassol: referência não verificada — indisponível no momento da inspeção.",
                  ],
                  productChecks: [
                    {
                      verificationStatus: "verified",
                      name: "Broa de milho",
                      orderedQuantity: 20,
                      lots: [{ lot: "26243", dispatchedQuantity: 20 }],
                      productLabelResult: "C",
                      boxLabelResult: "C",
                      productTemperature: 7,
                      observations: "Sem desvios.",
                    },
                    {
                      verificationStatus: "not_verified",
                      name: "Sementes de girassol",
                      orderedQuantity: 4,
                      notVerifiedReason:
                        "Indisponível no momento da inspeção.",
                    },
                  ],
                },
              },
            ],
          },
        }),
      },
      pendingControlTasks: { useQuery: () => ({ isLoading: false, data: [] }) },
      controlAuthorization: {
        useQuery: () => ({
          isLoading: false,
          data: {
            allowed: true,
            taskId: 51,
            dueAt: new Date("2026-09-01T12:00:00"),
            isPreviousPending: false,
            isFuturePlanned: false,
            reason: "Autorizado",
          },
        }),
      },
      createEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      uploadVerificationEvidence: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      parseDispatchOrderPdf: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      registerDispatchControl: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      updateControlEntry: {
        useMutation: () => ({ isPending: false, mutate: updateEntry }),
      },
      deleteControlEntry: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
  useRoute: () => [true, { module: route.value }],
  useSearch: () => "",
  useLocation: () => [window.location.pathname, (target: string) => window.history.pushState({}, "", target)],
}));

import ModuleControl from "../client/src/pages/ModuleControl";

describe("detalhe e edição de Expedição", () => {
  afterEach(() => {
    cleanup();
    updateEntry.mockReset();
  });

  it("mostra todas as referências e abre o editor completo por referência", async () => {
    const user = userEvent.setup();
    render(<ModuleControl />);

    await user.click(screen.getByRole("button", { name: "Ver detalhes de Expedição 9138 — JCL" }));
    expect(screen.getByText("Referências da encomenda")).toBeTruthy();
    expect(screen.getByText("Broa de milho")).toBeTruthy();
    expect(screen.getByText("Sementes de girassol")).toBeTruthy();
    expect(screen.getByText(/Indisponível no momento da inspeção/)).toBeTruthy();
    expect(screen.getByText(/Temperatura do veículo:/)).toBeTruthy();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Editar Expedição 9138 — JCL" }));
    expect(screen.getByText(/Atualize cada referência, incluindo lotes/)).toBeTruthy();
    expect(screen.getByLabelText("Estado da referência Broa de milho")).toBeTruthy();
    expect(screen.getByLabelText("Motivo de não verificação")).toBeTruthy();
    expect(screen.getByLabelText("Temperatura do veículo (°C)")).toBeTruthy();
  });
});
