// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const analyticsInputs = vi.hoisted(() => [] as Array<{ period: string; referenceDate: Date; startDate: Date; endDate: Date }>);

vi.mock("@/lib/trpc", () => ({
  trpc: {
    quality: {
      operationalAnalytics: {
        useQuery: (input: { period: string; referenceDate: Date; startDate: Date; endDate: Date }) => {
          analyticsInputs.push(input);
          return {
            isLoading: false,
            error: null,
            data: {
              period: input.period,
              periodStart: new Date("2026-09-01T00:00:00"),
              periodEnd: new Date("2026-09-08T00:00:00"),
              completion: { total: 8, completed: 6, pending: 2, rate: 75 },
              completionByFactory: [
                { factoryId: 1, label: "Fábrica 1 (Fatiado)", total: 3, completed: 3, pending: 0, rate: 100 },
                { factoryId: 2, label: "Fábrica 2 (Granel)", total: 3, completed: 2, pending: 1, rate: 66.7 },
                { factoryId: 3, label: "Fábrica 3 (Sem Gluten)", total: 2, completed: 1, pending: 1, rate: 50 },
              ],
              completionByControl: [
                { module: "bphf", total: 3, completed: 2, pending: 1, rate: 66.7 },
                { module: "temperature_controls", total: 2, completed: 2, pending: 0, rate: 100 },
              ],
              results: { total: 12, conforming: 10, nonconforming: 1, notApplicable: 1, conformity: 90.9 },
              incidences: {
                total: 1,
                byTreatment: [
                  { status: "pending", total: 0 },
                  { status: "in_progress", total: 1 },
                  { status: "completed", total: 0 },
                ],
                byDecision: [
                  { status: "pending", total: 0 },
                  { status: "no_nc", total: 0 },
                  { status: "nc_generated", total: 1 },
                ],
                nonconformities: {
                  total: 1,
                  byStatus: [
                    { status: "open", total: 1 },
                    { status: "in_progress", total: 0 },
                    { status: "awaiting_validation", total: 0 },
                    { status: "closed", total: 0 },
                  ],
                  bySeverity: [
                    { severity: "critical", total: 0 },
                    { severity: "high", total: 1 },
                    { severity: "medium", total: 0 },
                    { severity: "low", total: 0 },
                  ],
                },
              },
              activityByTechnician: [
                { profileId: 1, name: "Sabrina Esteves", title: "Tec. Qualidade", total: 8, conforming: 7, incidences: 1, generatedNonconformities: 1, conformity: 87.5 },
              ],
              activityTrend: [
                { label: "01/09", registrations: 4, incidences: 1, generatedNonconformities: 1, completedTasks: 2, plannedTasks: 3 },
                { label: "02/09", registrations: 8, incidences: 0, generatedNonconformities: 0, completedTasks: 4, plannedTasks: 5 },
              ],
              factories: [],
            },
          };
        },
      },
    },
  },
}));

import OperationalAnalytics from "../client/src/pages/OperationalAnalytics";

describe("painel de análise operacional", () => {
  afterEach(() => {
    cleanup();
    analyticsInputs.length = 0;
  });

  it("apresenta os indicadores e as análises pedidas para o período", () => {
    render(<OperationalAnalytics />);

    expect(screen.getByRole("heading", { name: "Visão operacional de qualidade" })).toBeTruthy();
    expect(screen.getByText("Execução do plano")).toBeTruthy();
    expect(screen.getByText("Completitude por fábrica")).toBeTruthy();
    expect(screen.getByText("Completitude e resultados por controlo")).toBeTruthy();
    expect(screen.getByText("Tratamento de incidências")).toBeTruthy();
    expect(screen.getAllByText("Não conformidades").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Atividade por técnico")).toBeTruthy();
    expect(screen.getByText("Evolução no período")).toBeTruthy();
    expect(screen.getByText("Fábrica 1 (Fatiado)")).toBeTruthy();
    expect(screen.getByText("Sabrina Esteves")).toBeTruthy();
    expect(screen.getAllByText("NC geradas").length).toBeGreaterThan(0);
    expect(screen.getByText("Incidências")).toBeTruthy();
    expect(
      screen.getByText(/O vermelho fica reservado às NC formais geradas a partir de incidências/i)
    ).toBeTruthy();
    expect(analyticsInputs[0]).toMatchObject({ period: "day" });
    expect(analyticsInputs[0].startDate).toBeInstanceOf(Date);
    expect(analyticsInputs[0].endDate).toBeInstanceOf(Date);
  });

  it("altera o período da consulta para a análise semanal e mantém a data de referência", () => {
    render(<OperationalAnalytics />);
    const dateInput = screen.getByLabelText("Data de referência da análise") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-09-03" } });
    fireEvent.click(screen.getByRole("button", { name: "Semana" }));

    expect(analyticsInputs.at(-1)).toMatchObject({ period: "week" });
    expect((analyticsInputs.at(-1)?.referenceDate ?? new Date()).toISOString()).toContain("2026-09-03T12:00:00.000Z");
    expect(screen.getByText("Semana ISO 36 · 2026")).toBeTruthy();
  });

  it("permite analisar um intervalo personalizado de datas", () => {
    render(<OperationalAnalytics />);
    fireEvent.change(screen.getByLabelText("Data inicial da análise"), { target: { value: "2026-08-20" } });
    fireEvent.change(screen.getByLabelText("Data final da análise"), { target: { value: "2026-08-31" } });

    expect(analyticsInputs.at(-1)).toMatchObject({ period: "custom" });
    expect((analyticsInputs.at(-1)?.startDate ?? new Date()).toISOString()).toContain("2026-08-20T12:00:00.000Z");
    expect((analyticsInputs.at(-1)?.endDate ?? new Date()).toISOString()).toContain("2026-08-31T12:00:00.000Z");
    expect(screen.getByText("Intervalo personalizado")).toBeTruthy();
  });
});
