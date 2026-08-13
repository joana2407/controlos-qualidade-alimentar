// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OperatorAttribution } from "../client/src/components/quality/OperatorAttribution";

describe("autoria operacional na interface", () => {
  afterEach(cleanup);

  it("apresenta nome e função do perfil PIN que registou o controlo", () => {
    render(<OperatorAttribution name="Sabrina Esteves" title="Tec. Qualidade" />);
    expect(screen.getByTestId("operator-attribution").textContent).toBe("Registado por: Sabrina Esteves · Tec. Qualidade");
  });

  it("identifica explicitamente registos históricos sem perfil operacional", () => {
    render(<OperatorAttribution verb="Concluído por" />);
    expect(screen.getByTestId("operator-attribution").textContent).toBe("Concluído por: Não identificado");
  });
});
