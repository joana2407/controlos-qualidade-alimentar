// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sessionMocks = vi.hoisted(() => ({ deactivate: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { accessStatus: { invalidate: vi.fn() } } }),
    quality: {
      accessStatus: { useQuery: () => ({ data: { activeProfile: { id: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" }, canManage: false }, isLoading: false }) },
      activatePinProfile: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      configureTeamPins: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      deactivatePinProfile: { useMutation: () => ({ isPending: false, mutate: sessionMocks.deactivate }) },
    },
  },
}));

import DashboardLayout from "../client/src/components/DashboardLayout";
import { OperatorPinGate } from "../client/src/components/OperatorPinGate";

const access = {
  profiles: [
    { id: 1, code: "SABRINA_ESTEVES", name: "Sabrina Esteves", title: "Tec. Qualidade", role: "technician" as const, isConfigured: true, active: true },
    { id: 2, code: "NEUZA_ANTUNES", name: "Neuza Antunes", title: "Tec. Qualidade", role: "technician" as const, isConfigured: true, active: true },
    { id: 3, code: "JOANA_PINA", name: "Joana Pina", title: "Resp. Qualidade", role: "manager" as const, isConfigured: true, active: true },
    { id: 4, code: "GESTAO", name: "Gestão", title: "Consulta", role: "viewer" as const, isConfigured: true, active: true },
  ],
  canBootstrap: false,
  needsInitialSetup: false,
};

describe("login operacional por PIN", () => {
  afterEach(cleanup);

  it("não pré-seleciona um perfil e só apresenta o PIN depois da escolha explícita", () => {
    render(<OperatorPinGate access={access} />);

    expect(screen.getByAltText("Logótipo A&S")).toBeTruthy();
    expect(screen.queryByLabelText("PIN de Sabrina Esteves")).toBeNull();
    expect(screen.getByText("Selecione o seu perfil para introduzir o PIN.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Sabrina Esteves/i }));
    expect(screen.getByLabelText("PIN de Sabrina Esteves")).toBeTruthy();
  });

  it("mantém uma sessão PIN ativa ao abrir o layout operacional", () => {
    render(<DashboardLayout workspace="selector"><p>Tarefas disponíveis</p></DashboardLayout>);

    expect(screen.getByText("Tarefas disponíveis")).toBeTruthy();
    expect(sessionMocks.deactivate).not.toHaveBeenCalled();
  });
});
