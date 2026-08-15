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

/** O planeamento operacional considera de segunda a sexta-feira; feriados podem ser tratados numa evolução posterior. */
export function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

/** Devolve o próprio dia quando útil ou o próximo dia útil quando a referência cai no fim de semana. */
export function nextBusinessDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  while (!isBusinessDay(result)) result.setDate(result.getDate() + 1);
  return result;
}

export function businessDayAfter(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  do result.setDate(result.getDate() + 1); while (!isBusinessDay(result));
  return result;
}

export type DispatchControlInput = {
  orderedBoxes: number;
  dispatchedBoxes: number;
  productLabelResult: "C" | "NC";
  boxLabelResult: "C" | "NC";
  productTemperature: number;
  vehicleTemperature: number;
  productTemperatureLimit: number;
  vehicleTemperatureLimit: number;
};

/** Calcula os cinco critérios e a conformidade global do registo de expedição. */
export function calculateDispatchConformity(input: DispatchControlInput) {
  const quantityResult = input.orderedBoxes === input.dispatchedBoxes ? "C" : "NC";
  const productTemperatureResult = input.productTemperature <= input.productTemperatureLimit ? "C" : "NC";
  const vehicleTemperatureResult = input.vehicleTemperature <= input.vehicleTemperatureLimit ? "C" : "NC";
  const result = [quantityResult, input.productLabelResult, input.boxLabelResult, productTemperatureResult, vehicleTemperatureResult].every((item) => item === "C") ? "C" : "NC";
  return { result, quantityResult, productTemperatureResult, vehicleTemperatureResult } as const;
}

export type FragilePeriodicity = "D" | "S" | "Q" | "M";

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfWeek(date: Date) {
  const result = startOfDay(date);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

/**
 * Indica se um ponto de controlo de quebráveis deve ser inspecionado na data de referência.
 * D e S seguem períodos de calendário; Q vence 14 dias após a última inspeção;
 * M vence no primeiro dia de um novo mês civil.
 */
export function isFragileInspectionPending(periodicity: FragilePeriodicity, lastInspectionAt: Date | null | undefined, referenceDate = new Date()) {
  if (!lastInspectionAt) return true;
  if (periodicity === "D") return startOfDay(lastInspectionAt) < startOfDay(referenceDate);
  if (periodicity === "S") return startOfWeek(lastInspectionAt) < startOfWeek(referenceDate);
  if (periodicity === "Q") return referenceDate.getTime() - lastInspectionAt.getTime() >= 14 * 24 * 60 * 60 * 1000;
  return lastInspectionAt.getFullYear() !== referenceDate.getFullYear() || lastInspectionAt.getMonth() !== referenceDate.getMonth();
}
