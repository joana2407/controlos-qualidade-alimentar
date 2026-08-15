import { describe, expect, it } from "vitest";
import { businessDayAfter, calculateConformityRate, calculateDispatchConformity, calculateSensoryScore, isBusinessDay, isFragileInspectionPending, nextBusinessDay, shouldCreateCriticalMetalAlert } from "./quality.logic";

describe("quality calculations", () => {
  it("applies the fixed sensory weights and converts the result to percentage", () => {
    const result = calculateSensoryScore({ aspeto: 5, fimDeBoca: 4, cor: 3, cheiro: 4, textura: 5, sabor: 2 });
    expect(result).toEqual({ scoreOnFive: 3.25, percentage: 65 });
  });

  it("calculates conformity only from applicable C and NC results", () => {
    expect(calculateConformityRate(["C", "NC", "N/A", "C"])).toBe(66.7);
    expect(calculateConformityRate(["N/A"])).toBe(0);
  });

  it("creates a critical alert only for non-conforming metal detector controls", () => {
    expect(shouldCreateCriticalMetalAlert("metal_detectors", "NC")).toBe(true);
    expect(shouldCreateCriticalMetalAlert("bphf", "NC")).toBe(false);
    expect(shouldCreateCriticalMetalAlert("metal_detectors", "C")).toBe(false);
  });

  it("considera apenas segunda a sexta-feira no calendário operacional", () => {
    const friday = new Date(2026, 7, 14, 10, 0, 0);
    const saturday = new Date(2026, 7, 15, 10, 0, 0);
    expect(isBusinessDay(friday)).toBe(true);
    expect(isBusinessDay(saturday)).toBe(false);
    expect(nextBusinessDay(saturday)).toMatchObject(new Date(2026, 7, 17, 0, 0, 0));
    expect(businessDayAfter(friday)).toMatchObject(new Date(2026, 7, 17, 0, 0, 0));
  });

  it("identifies pending fragile inspections by daily, weekly, fortnightly and monthly periodicity", () => {
    const reference = new Date(2026, 7, 13, 10, 0, 0);
    expect(isFragileInspectionPending("D", new Date(2026, 7, 13, 8, 0, 0), reference)).toBe(false);
    expect(isFragileInspectionPending("D", new Date(2026, 7, 12, 16, 0, 0), reference)).toBe(true);
    expect(isFragileInspectionPending("S", new Date(2026, 7, 10, 9, 0, 0), reference)).toBe(false);
    expect(isFragileInspectionPending("S", new Date(2026, 7, 9, 9, 0, 0), reference)).toBe(true);
    expect(isFragileInspectionPending("Q", new Date(2026, 6, 31, 10, 0, 0), reference)).toBe(false);
    expect(isFragileInspectionPending("Q", new Date(2026, 6, 30, 9, 0, 0), reference)).toBe(true);
    expect(isFragileInspectionPending("M", new Date(2026, 7, 1, 8, 0, 0), reference)).toBe(false);
    expect(isFragileInspectionPending("M", new Date(2026, 6, 31, 8, 0, 0), reference)).toBe(true);
    expect(isFragileInspectionPending("M", null, reference)).toBe(true);
  });

  it("calcula C para a expedição apenas quando os cinco critérios estão conformes", () => {
    expect(calculateDispatchConformity({ orderedBoxes: 24, dispatchedBoxes: 24, productLabelResult: "C", boxLabelResult: "C", productTemperature: 24.7, vehicleTemperature: 25, productTemperatureLimit: 25, vehicleTemperatureLimit: 25 })).toEqual({ result: "C", quantityResult: "C", productTemperatureResult: "C", vehicleTemperatureResult: "C" });
  });

  it("calcula NC para temperaturas acima do limite e para divergências de quantidade ou rótulo", () => {
    expect(calculateDispatchConformity({ orderedBoxes: 24, dispatchedBoxes: 24, productLabelResult: "C", boxLabelResult: "C", productTemperature: -17.9, vehicleTemperature: -18, productTemperatureLimit: -18, vehicleTemperatureLimit: -18 })).toMatchObject({ result: "NC", productTemperatureResult: "NC", vehicleTemperatureResult: "C" });
    expect(calculateDispatchConformity({ orderedBoxes: 25, dispatchedBoxes: 24, productLabelResult: "NC", boxLabelResult: "C", productTemperature: 12, vehicleTemperature: 10, productTemperatureLimit: 25, vehicleTemperatureLimit: 25 })).toMatchObject({ result: "NC", quantityResult: "NC" });
  });
});
