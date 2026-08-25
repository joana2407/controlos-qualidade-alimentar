// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { accessStatus: { invalidate: vi.fn() } } }),
    quality: {
      activatePinProfile: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      configureTeamPins: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

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

    expect(screen.queryByLabelText("PIN de Sabrina Esteves")).toBeNull();
    expect(screen.getByText("Selecione o seu perfil para introduzir o PIN.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Sabrina Esteves/i }));
    expect(screen.getByLabelText("PIN de Sabrina Esteves")).toBeTruthy();
  });
});
