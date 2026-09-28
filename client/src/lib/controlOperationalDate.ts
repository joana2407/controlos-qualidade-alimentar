const CONTROL_OPERATIONAL_DATE_STORAGE_PREFIX =
  "quality-control-operational-date";

export function isOperationalDateKey(
  value: string | null | undefined
): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function dateFromOperationalDateKey(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

export function currentLisbonDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function readControlOperationalDate(module: string): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(
    `${CONTROL_OPERATIONAL_DATE_STORAGE_PREFIX}:${module}`
  );
  return isOperationalDateKey(value) ? value : null;
}

export function writeControlOperationalDate(
  module: string,
  value: string
): void {
  if (typeof window === "undefined") return;
  const key = `${CONTROL_OPERATIONAL_DATE_STORAGE_PREFIX}:${module}`;
  if (isOperationalDateKey(value)) window.localStorage.setItem(key, value);
  else window.localStorage.removeItem(key);
}
