// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShelfLife } from "../client/src/pages/ModuleControl";

afterEach(cleanup);

describe("fluxo shelf-life", () => {
  it("mantém o registo conforme simplificado sem campos de rastreabilidade", () => {
    const mutate = vi.fn();
    render(<ShelfLife createEntry={{ isPending: false, mutate }} />);

    expect(screen.queryByLabelText("Produto")).toBeNull();
    expect((screen.getByRole("button", { name: "Registar verificação conforme" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Registar verificação conforme" }));

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      module: "shelf_life",
      result: "C",
      createNonconformity: false,
      title: "Shelf-life — Conforme",
    }));
  });

  it("mostra os campos de rastreabilidade em NC e gera automaticamente a incidência", () => {
    const mutate = vi.fn();
    render(<ShelfLife createEntry={{ isPending: false, mutate }} />);

    fireEvent.click(screen.getByRole("button", { name: "NC" }));
    const product = document.getElementById("shelf-life-product") as HTMLInputElement;
    const lot = document.getElementById("shelf-life-lot") as HTMLInputElement;
    const validity = document.getElementById("shelf-life-validity") as HTMLInputElement;
    const reason = document.getElementById("shelf-life-reason") as HTMLTextAreaElement;
    expect(product).not.toBeNull();
    expect(lot).not.toBeNull();
    expect(validity).not.toBeNull();
    expect(reason).not.toBeNull();
    fireEvent.change(product, { target: { value: "Pão de forma" } });
    fireEvent.change(lot, { target: { value: "L-2026" } });
    fireEvent.change(validity, { target: { value: "2026-08-20" } });
    fireEvent.change(reason, { target: { value: "Bolor identificado." } });
    fireEvent.click(screen.getByRole("button", { name: "Registar NC e criar incidência" }));

    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      result: "NC",
      createNonconformity: true,
      title: "Incidência shelf-life — Pão de forma",
      payload: expect.objectContaining({ product: "Pão de forma", lot: "L-2026", dailyIncidenceGenerated: true }),
    }));
  });
});
