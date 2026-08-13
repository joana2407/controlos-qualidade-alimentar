export const SENSORY_WEIGHTS = {
  Aspeto: 0.1,
  "Fim de boca": 0.15,
  Cor: 0.15,
  Cheiro: 0.1,
  Textura: 0.1,
  Sabor: 0.4,
} as const;

export type SensoryScores = {
  aspeto: number;
  fimDeBoca: number;
  cor: number;
  cheiro: number;
  textura: number;
  sabor: number;
};

export function calculateSensoryScore(scores: SensoryScores) {
  const weightedScore =
    scores.aspeto * SENSORY_WEIGHTS.Aspeto +
    scores.fimDeBoca * SENSORY_WEIGHTS["Fim de boca"] +
    scores.cor * SENSORY_WEIGHTS.Cor +
    scores.cheiro * SENSORY_WEIGHTS.Cheiro +
    scores.textura * SENSORY_WEIGHTS.Textura +
    scores.sabor * SENSORY_WEIGHTS.Sabor;

  return {
    scoreOnFive: Number(weightedScore.toFixed(2)),
    percentage: Number((weightedScore * 20).toFixed(1)),
  };
}

export function calculateConformityRate(results: Array<"C" | "NC" | "N/A" | null | undefined>) {
  const applicable = results.filter((result) => result === "C" || result === "NC");
  if (applicable.length === 0) return 0;
  return Number(((applicable.filter((result) => result === "C").length / applicable.length) * 100).toFixed(1));
}

export function shouldCreateCriticalMetalAlert(module: string, result: string | null | undefined) {
  return module === "metal_detectors" && result === "NC";
}
