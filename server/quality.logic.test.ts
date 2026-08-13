import { describe, expect, it } from "vitest";
import { calculateConformityRate, calculateSensoryScore, shouldCreateCriticalMetalAlert } from "./quality.logic";

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
});
