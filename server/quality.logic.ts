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

function easterSunday(year: number) {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100; const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451); const month = Math.floor((h + l - 7 * m + 114) / 31); const day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(year, month - 1, day);
}

function sameCalendarDay(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate(); }

/** Considera os feriados nacionais portugueses, incluindo Sexta-feira Santa e Corpo de Deus. */
export function isPortuguesePublicHoliday(date: Date) {
  const day = startOfDay(date);
  const fixedHolidays = [[0, 1], [3, 25], [4, 1], [5, 10], [7, 15], [9, 5], [10, 1], [11, 1], [11, 8], [11, 25]];
  if (fixedHolidays.some(([month, calendarDay]) => day.getMonth() === month && day.getDate() === calendarDay)) return true;
  const easter = easterSunday(day.getFullYear());
  const goodFriday = new Date(easter); goodFriday.setDate(easter.getDate() - 2);
  const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);
  return sameCalendarDay(day, goodFriday) || sameCalendarDay(day, corpusChristi);
}

/** O planeamento operacional considera de segunda a sexta-feira e exclui os feriados nacionais portugueses. */
export function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6 && !isPortuguesePublicHoliday(date);
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

function fridayOnOrAfter(date: Date) {
  const result = startOfDay(date);
  result.setDate(result.getDate() + ((5 - result.getDay() + 7) % 7));
  return result;
}

/** Devolve a data de vencimento do ciclo de um ponto de Quebráveis. */
export function fragileInspectionDueDate(periodicity: FragilePeriodicity, lastInspectionAt: Date | null | undefined, referenceDate = new Date()) {
  const reference = startOfDay(referenceDate);
  if (periodicity === "D") return reference;
  if (!lastInspectionAt) return fridayOnOrAfter(reference);
  if (periodicity === "S") return fridayOnOrAfter(new Date(startOfDay(lastInspectionAt).setDate(startOfDay(lastInspectionAt).getDate() + 7)));
  if (periodicity === "Q") return fridayOnOrAfter(new Date(startOfDay(lastInspectionAt).setDate(startOfDay(lastInspectionAt).getDate() + 14)));
  return fridayOnOrAfter(new Date(lastInspectionAt.getFullYear(), lastInspectionAt.getMonth() + 1, 1));
}

/**
 * Os pontos diários vencem em cada dia útil. Pontos semanais, quinzenais e mensais
 * são apresentados para verificação à sexta-feira do respetivo ciclo.
 */
export function isFragileInspectionPending(periodicity: FragilePeriodicity, lastInspectionAt: Date | null | undefined, referenceDate = new Date()) {
  const reference = startOfDay(referenceDate);
  if (periodicity === "D") return isBusinessDay(reference) && (!lastInspectionAt || startOfDay(lastInspectionAt) < reference);
  const dueOperationalDay = nextBusinessDay(fragileInspectionDueDate(periodicity, lastInspectionAt, reference));
  return isBusinessDay(reference) && reference.getTime() >= dueOperationalDay.getTime();
}

export function fragileInspectionDelayDays(periodicity: FragilePeriodicity, lastInspectionAt: Date | null | undefined, referenceDate = new Date()) {
  const due = fragileInspectionDueDate(periodicity, lastInspectionAt, referenceDate);
  return Math.max(0, Math.floor((startOfDay(referenceDate).getTime() - due.getTime()) / (24 * 60 * 60 * 1000)));
}
