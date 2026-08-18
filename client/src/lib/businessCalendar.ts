function easterSunday(year: number) {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100; const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451); const month = Math.floor((h + l - 7 * m + 114) / 31); const day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(year, month - 1, day);
}

function sameCalendarDay(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate(); }

export function isOperationalBusinessDay(date: Date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const fixedHolidays = [[0, 1], [3, 25], [4, 1], [5, 10], [7, 15], [9, 5], [10, 1], [11, 1], [11, 8], [11, 25]];
  if (fixedHolidays.some(([month, calendarDay]) => date.getMonth() === month && date.getDate() === calendarDay)) return false;
  const easter = easterSunday(date.getFullYear());
  const goodFriday = new Date(easter); goodFriday.setDate(easter.getDate() - 2);
  const corpusChristi = new Date(easter); corpusChristi.setDate(easter.getDate() + 60);
  return !sameCalendarDay(date, goodFriday) && !sameCalendarDay(date, corpusChristi);
}

export function nextOperationalBusinessDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  while (!isOperationalBusinessDay(result)) result.setDate(result.getDate() + 1);
  return result;
}

export function operationalBusinessDayAfter(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  do result.setDate(result.getDate() + 1); while (!isOperationalBusinessDay(result));
  return result;
}

export function isMonthlyChecklistOpen(date: Date) {
  const openingDate = new Date(date.getFullYear(), date.getMonth(), 20);
  openingDate.setHours(0, 0, 0, 0);
  return date.getTime() >= nextOperationalBusinessDay(openingDate).getTime();
}

export function monthlyChecklistOpeningDate(date: Date) {
  return nextOperationalBusinessDay(new Date(date.getFullYear(), date.getMonth(), 20));
}
