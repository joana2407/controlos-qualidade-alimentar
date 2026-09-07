import { describe, expect, it } from "vitest";
import {
  getLisbonCalendarParts,
  isLisbonMidnightBoundary,
  lisbonDateInputValue,
  lisbonDateTimeLabel,
  lisbonOperationalDay,
  lisbonTimeLabel,
} from "../shared/lisbon-time";

describe("relógio e dia operacional de Lisboa", () => {
  it("mantém o dia até às 23:59:59 e muda às 00:00 de Lisboa no verão", () => {
    const beforeMidnight = new Date("2026-09-07T22:59:59.000Z");
    const atMidnight = new Date("2026-09-07T23:00:00.000Z");
    expect(lisbonDateInputValue(beforeMidnight)).toBe("2026-09-07");
    expect(lisbonOperationalDay(atMidnight)).toBe("2026-09-08");
    expect(isLisbonMidnightBoundary(beforeMidnight, atMidnight)).toBe(true);
  });

  it("respeita a mudança de hora e continua a usar o calendário de Lisboa", () => {
    const instant = new Date("2026-10-25T23:30:00.000Z");
    const parts = getLisbonCalendarParts(instant);
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(10);
    expect(parts.day).toBe(25);
    expect(lisbonDateInputValue(instant)).toBe("2026-10-25");
  });

  it("apresenta data e hora em português, independentemente do fuso do dispositivo", () => {
    const instant = new Date("2026-09-07T23:00:05.000Z");
    expect(lisbonTimeLabel(instant)).toMatch(/^0[01]:00:05$/);
    expect(lisbonDateTimeLabel(instant)).toContain("2026");
  });
});
