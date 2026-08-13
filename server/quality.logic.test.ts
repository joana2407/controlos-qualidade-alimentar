import { describe, expect, it } from "vitest";
import { calculateConformityRate, calculateSensoryScore, isFragileInspectionPending, shouldCreateCriticalMetalAlert } from "./quality.logic";

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
});
