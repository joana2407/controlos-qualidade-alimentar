import { describe, expect, it, vi } from "vitest";
import { controlEntries, controlTasks, dailyIncidenceSummaries, dailyReportArchiveSettings, dailyReportArchives, factories, nonconformities } from "../drizzle/schema";

const archiveMock = vi.hoisted(() => ({ db: null as any, backup: vi.fn(async (archiveId: number) => ({ created: true, archiveId })) }));
vi.mock("./db", () => ({ getDb: async () => archiveMock.db }));
vi.mock("./daily-report-backup", () => ({ ensureDailyReportArchiveBackup: archiveMock.backup }));

import { buildDailyReportSnapshot, createInitialDailyReportArchive, createManualDailyReportArchive, createRetroactiveDailyReportRevision, isLisbonArchiveTime } from "./daily-report-archive";

function createArchiveDb() {
  const archives: any[] = [];
  const sourceFor = (table: unknown) => {
    if (table === dailyReportArchives) return archives;
    if (table === dailyReportArchiveSettings) return [{ id: 1, active: "true" }];
    if (table === controlTasks) return [{ id: 4, dueAt: new Date("2026-08-21T09:00:00"), title: "Verificação", status: "completed" }];
    if (table === controlEntries) return [{ id: 8, completedAt: new Date("2026-08-23T12:00:00"), payload: { plannedDate: "2026-08-21T09:00:00.000Z" } }];
    if (table === nonconformities) return [{ id: 1, sourceEntryId: 8 }];
    if (table === dailyIncidenceSummaries) return [{ id: 1, referenceDate: "2026-08-21", note: "Sem ocorrências relevantes" }];
    if (table === factories) return [{ id: 1, name: "Fábrica 1" }];
    return [];
  };
  const selection = (table: unknown) => {
    const ordered = () => table === dailyReportArchives ? [...sourceFor(table)].sort((a, b) => b.revision - a.revision) : sourceFor(table);
    const chain: any = {
      orderBy: async () => ordered(),
      where: () => chain,
      then: (resolve: (rows: any[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(ordered()).then(resolve, reject),
    };
    return chain;
  };
  return {
    archives,
    db: {
      select: () => ({ from: (table: unknown) => selection(table) }),
      insert: (table: unknown) => ({ values: async (values: any) => {
        if (table === dailyReportArchives) archives.push({ ...values, id: archives.length + 1 });
        return [{ insertId: archives.length }];
      } }),
    },
  };
}

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

  it("aceita a execução alguns minutos depois da hora prevista, sem aceitar a hora seguinte", () => {
    expect(isLisbonArchiveTime(new Date("2026-08-21T22:58:33.000Z"))).toBe(true);
    expect(isLisbonArchiveTime(new Date("2026-08-21T23:58:33.000Z"))).toBe(false);
    expect(isLisbonArchiveTime(new Date("2026-08-22T22:58:33.000Z"))).toBe(false);
  });

  it("mantém uma V1 de recuperação e cria apenas uma V2 para o controlo retroativo", async () => {
    const mock = createArchiveDb();
    archiveMock.db = mock.db;

    const result = await createRetroactiveDailyReportRevision({ taskId: 4, entryId: 8, dueAt: new Date("2026-08-21T09:00:00"), module: "bphf", reason: "Controlo registado posteriormente", createdBy: "Sabrina Esteves" });
    const repeat = await createRetroactiveDailyReportRevision({ taskId: 4, entryId: 8, dueAt: new Date("2026-08-21T09:00:00"), module: "bphf", reason: "Controlo registado posteriormente", createdBy: "Sabrina Esteves" });

    expect(result).toMatchObject({ created: true, revision: 2, operationalDate: "2026-08-21" });
    expect(mock.archives).toHaveLength(2);
    expect(mock.archives[0]).toMatchObject({ revision: 1, archiveKind: "initial", revisionReason: expect.stringContaining("Recuperação") });
    expect(mock.archives[1]).toMatchObject({ revision: 2, archiveKind: "retroactive_revision", triggerTaskId: 4, triggerEntryId: 8 });
    expect(repeat).toMatchObject({ created: false, skipped: "already_archived" });
  });

  it("não altera a V1 quando a criação inicial é repetida", async () => {
    const mock = createArchiveDb();
    archiveMock.db = mock.db;

    const first = await createInitialDailyReportArchive("2026-08-21");
    const repeated = await createInitialDailyReportArchive("2026-08-21");

    expect(first).toMatchObject({ created: true, revision: 1 });
    expect(repeated.created).toBe(false);
    expect(mock.archives).toHaveLength(1);
    expect(mock.archives[0]).toMatchObject({ revision: 1, archiveKind: "initial" });
    expect(mock.archives[0].operationalDate).toBeInstanceOf(Date);
  });

  it("guarda manualmente o backup diário da data selecionada sem duplicar o arquivo", async () => {
    const mock = createArchiveDb();
    archiveMock.db = mock.db;
    archiveMock.backup.mockClear();

    const first = await createManualDailyReportArchive("2026-08-21", "Arquivo manual por Joana Pina");
    const repeated = await createManualDailyReportArchive("2026-08-21", "Arquivo manual por Joana Pina");

    expect(first).toMatchObject({ created: true, revision: 1 });
    expect(repeated.created).toBe(false);
    expect(mock.archives).toHaveLength(1);
    expect(mock.archives[0]).toMatchObject({ archiveKind: "initial", createdBy: "Arquivo manual por Joana Pina" });
    expect(archiveMock.backup).toHaveBeenCalledWith(1);
  });

  it("gera o ficheiro de backup quando cria cada versão diária", async () => {
    const mock = createArchiveDb();
    archiveMock.db = mock.db;
    archiveMock.backup.mockClear();

    await createInitialDailyReportArchive("2026-08-21");
    await createRetroactiveDailyReportRevision({ taskId: 4, entryId: 8, dueAt: new Date("2026-08-21T09:00:00"), module: "bphf", reason: "Controlo registado posteriormente", createdBy: "Sabrina Esteves" });

    expect(archiveMock.backup).toHaveBeenCalledWith(1);
    expect(archiveMock.backup).toHaveBeenCalledWith(2);
  });
});
