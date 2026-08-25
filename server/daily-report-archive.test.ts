import { describe, expect, it } from "vitest";
import { buildDailyReportSnapshot, isLisbonArchiveTime } from "./daily-report-archive";

describe("arquivo diário de relatórios", () => {
  it("agrupa no dia operacional os registos concluídos posteriormente", () => {
    const snapshot = buildDailyReportSnapshot({
      operationalDate: "2026-08-21",
      tasks: [{ id: 4, dueAt: new Date("2026-08-21T09:00:00") }],
      entries: [{ id: 8, completedAt: new Date("2026-08-23T12:00:00"), payload: { plannedDate: "2026-08-21T09:00:00.000Z" } }],
      nonconformities: [{ id: 1, sourceEntryId: 8 }],
      summaries: [{ id: 1, referenceDate: "2026-08-21", note: "Sem ocorrências relevantes" }],
      factories: [{ id: 1, name: "Fábrica 1" }],
    });

    expect(snapshot.plannedTasks).toHaveLength(1);
    expect(snapshot.controlEntries).toHaveLength(1);
    expect(snapshot.incidences).toHaveLength(1);
    expect(snapshot.dailyNotes).toHaveLength(1);
  });

  it("reconhece as 23:55 de Lisboa tanto no horário de verão como no de inverno", () => {
    expect(isLisbonArchiveTime(new Date("2026-08-21T22:55:00.000Z"))).toBe(true);
    expect(isLisbonArchiveTime(new Date("2026-08-21T23:55:00.000Z"))).toBe(false);
    expect(isLisbonArchiveTime(new Date("2026-12-21T23:55:00.000Z"))).toBe(true);
  });
});
