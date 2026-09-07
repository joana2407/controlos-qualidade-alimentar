export const LISBON_TIME_ZONE = "Europe/Lisbon";

export type LisbonCalendarParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return Number(parts.find(part => part.type === type)?.value ?? 0);
}

export function getLisbonCalendarParts(value: Date | number = new Date()): LisbonCalendarParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LISBON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return {
    year: getPart(parts, "year"),
    month: getPart(parts, "month"),
    day: getPart(parts, "day"),
    hour: getPart(parts, "hour"),
    minute: getPart(parts, "minute"),
    second: getPart(parts, "second"),
  };
}

export function lisbonDateInputValue(value: Date | number = new Date()) {
  const { year, month, day } = getLisbonCalendarParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function lisbonDateTimeLabel(value: Date | number = new Date()) {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: LISBON_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function lisbonTimeLabel(value: Date | number = new Date()) {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: LISBON_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function lisbonDateLabel(value: Date | number = new Date()) {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: LISBON_TIME_ZONE,
    dateStyle: "full",
  }).format(new Date(value));
}

/** O dia operacional é sempre o dia do calendário em Lisboa, não o do dispositivo. */
export function lisbonOperationalDay(value: Date | number = new Date()) {
  return lisbonDateInputValue(value);
}

export function lisbonCalendarDateToUtc(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function isLisbonMidnightBoundary(previous: Date | number, current: Date | number) {
  return lisbonOperationalDay(previous) !== lisbonOperationalDay(current);
}
