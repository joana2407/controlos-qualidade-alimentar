// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateDispatchConformity } from "../server/quality.logic";

const mutate = vi.fn();
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ quality: { dashboard: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() }, listNcs: { invalidate: vi.fn() } } }),
    quality: {
      calculateDispatchConformity: { useQuery: (input: Parameters<typeof calculateDispatchConformity>[0]) => ({ data: calculateDispatchConformity(input) }) },
      registerDispatchControl: { useMutation: () => ({ mutate, isPending: false }) },
    },
  },
}));

import { ControlFactoryContext, DispatchControl } from "../client/src/pages/ModuleControl";

afterEach(() => { cleanup(); mutate.mockReset(); });

function renderDispatchControl() {
  return render(<ControlFactoryContext.Provider value={{ factories: [{ id: 1, name: "Fábrica 1 (Fatiado)" }], factoryId: "1", setFactoryId: vi.fn() }}><DispatchControl /></ControlFactoryContext.Provider>);
}

describe("fluxo de interface do controlo à expedição", () => {
  it("mostra o perfil ambiente e os seus limites importados", () => {
    renderDispatchControl();
    expect(screen.getAllByText("Validação Expedição ambiente").length).toBeGreaterThan(0);
    expect(screen.getByText("Produto e veículo ≤ 25 °C")).toBeTruthy();
    expect(screen.getByText("Conformidade global")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ajuda sobre a temperatura do produto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ajuda sobre a temperatura do veículo" })).toBeTruthy();
  });

  it("exige observações quando uma rotulagem NC torna a expedição não conforme", () => {
    renderDispatchControl();
    const textboxes = screen.getAllByRole("textbox") as Array<HTMLInputElement | HTMLTextAreaElement>;
    fireEvent.change(textboxes[0], { target: { value: "ENC-001" } });
    fireEvent.change(textboxes[1], { target: { value: "Cliente Norte" } });
    fireEvent.change(textboxes[3], { target: { value: "Pão de forma" } });
    fireEvent.change(textboxes[4], { target: { value: "L-001" } });
    const numbers = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    fireEvent.change(numbers[0], { target: { value: "12" } });
    fireEvent.change(numbers[1], { target: { value: "12" } });
    fireEvent.change(numbers[2], { target: { value: "20" } });
    fireEvent.change(numbers[3], { target: { value: "20" } });
    fireEvent.click(screen.getAllByRole("button", { name: "NC" })[0]);

    expect(screen.getByText("Não conforme")).toBeTruthy();
    const observations = textboxes[5] as HTMLTextAreaElement;
    expect(observations.required).toBe(true);
    fireEvent.change(observations, { target: { value: "Rótulo do produto não conforme." } });
    fireEvent.click(screen.getByRole("button", { name: "Registar incidência à expedição" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ factoryId: 1, profile: "ambiente", orderNumber: "ENC-001", productLabelResult: "NC", observations: "Rótulo do produto não conforme." }));
  });
});
