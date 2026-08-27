import { describe, expect, it, vi } from "vitest";

const backupMock = vi.hoisted(() => ({ db: null as any, storagePut: vi.fn(async () => ({ key: "qualicontrol/backups-diarios/2026-08-21/relatorio.xlsx", url: "/manus-storage/qualicontrol/backups-diarios/2026-08-21/relatorio.xlsx" })) }));
vi.mock("./db", () => ({ getDb: async () => backupMock.db }));
vi.mock("./storage", () => ({ storagePut: backupMock.storagePut }));

import { ensureDailyReportArchiveBackup } from "./daily-report-backup";

describe("backup Excel persistente do arquivo diário", () => {
  it("guarda uma versão arquivada no armazenamento e conserva a respetiva referência", async () => {
    const archive = { id: 7, operationalDate: new Date("2026-08-21T12:00:00Z"), revision: 2, archiveKind: "retroactive_revision", createdAt: new Date("2026-08-23T10:00:00Z"), createdBy: "Joana Pina", revisionReason: "Registo retroativo", backupFileKey: null, backupFileUrl: null, snapshot: { plannedTasks: [{ module: "bphf" }], controlEntries: [{ title: "Verificação", module: "bphf", result: "C" }], incidences: [], dailyNotes: [] } };
    const updates: any[] = [];
    backupMock.storagePut.mockClear();
    backupMock.db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [archive] }) }) }),
      update: () => ({ set: (values: any) => ({ where: async () => { updates.push(values); } }) }),
    };

    const result = await ensureDailyReportArchiveBackup(7);

    expect(result).toMatchObject({ created: true, archiveId: 7, fileName: "relatorio-diario-2026-08-21-V2.xlsx" });
    expect(backupMock.storagePut).toHaveBeenCalledWith("qualicontrol/backups-diarios/2026-08-21/relatorio-diario-2026-08-21-V2.xlsx", expect.any(Buffer), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(updates[0]).toMatchObject({ backupFileKey: expect.stringContaining("backups-diarios"), backupFileUrl: expect.stringContaining("/manus-storage/"), backupSizeBytes: expect.any(Number) });
  });
});
