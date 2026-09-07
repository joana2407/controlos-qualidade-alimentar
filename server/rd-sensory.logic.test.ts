import { describe, expect, it } from "vitest";
import { calculateRDSensoryWeightedScore, buildRDSensoryTimeline } from "./routers/rd-sensory";

describe("avaliação sensorial de I&D", () => {
  it("calcula a nota ponderada pelos critérios definidos no modelo R-P5.10(01)", () => {
    expect(calculateRDSensoryWeightedScore({
      projectId: 1,
      evaluatedAt: new Date("2026-09-07T12:00:00Z"),
      lifeDay: 10,
      tasterName: "Neuza Antunes",
      appearanceScore: 4,
      aftertasteScore: 3,
      colourScore: 5,
      smellScore: 4,
      textureScore: 3,
      flavourScore: 5,
    })).toBe(430);
  });

  it("agrupa avaliações de vários provadores pelo mesmo momento de vida", () => {
    const timeline = buildRDSensoryTimeline([
      { id: 1, projectId: 1, evaluatedAt: new Date("2026-09-03"), lifeDay: 3, tasterProfileId: 2, tasterName: "Neuza", appearanceScore: 4, aftertasteScore: 4, colourScore: 4, smellScore: 4, textureScore: 4, flavourScore: 4, weightedScore: 400, observations: null, suggestions: null, createdByProfileId: 2, createdByName: "Neuza", createdBy: "p2", createdAt: new Date() },
      { id: 2, projectId: 1, evaluatedAt: new Date("2026-09-03"), lifeDay: 3, tasterProfileId: 3, tasterName: "Sabrina", appearanceScore: 5, aftertasteScore: 5, colourScore: 5, smellScore: 5, textureScore: 5, flavourScore: 5, weightedScore: 500, observations: null, suggestions: null, createdByProfileId: 3, createdByName: "Sabrina", createdBy: "p3", createdAt: new Date() },
      { id: 3, projectId: 1, evaluatedAt: new Date("2026-09-10"), lifeDay: 10, tasterProfileId: 2, tasterName: "Neuza", appearanceScore: 3, aftertasteScore: 3, colourScore: 3, smellScore: 3, textureScore: 3, flavourScore: 3, weightedScore: 300, observations: null, suggestions: null, createdByProfileId: 2, createdByName: "Neuza", createdBy: "p2", createdAt: new Date() },
    ]);

    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({ lifeDay: 3, evaluations: 2, weightedAverage: 4.5 });
    expect(timeline[0]?.criteria.flavourScore).toEqual({ average: 4.5, mode: 5 });
    expect(timeline[1]).toMatchObject({ lifeDay: 10, evaluations: 1, weightedAverage: 3 });
  });
});
