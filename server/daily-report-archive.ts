import { desc, eq } from "drizzle-orm";
import { controlEntries, controlTasks, dailyIncidenceSummaries, dailyReportArchiveSettings, dailyReportArchives, factories, nonconformities } from "../drizzle/schema";
import { getDb } from "./db";
import { ensureDailyReportArchiveBackup } from "./daily-report-backup";

export type ArchiveKind = "initial" | "retroactive_revision";

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function lisbonParts(date: Date) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function isLisbonArchiveTime(date: Date) {
  const parts = lisbonParts(date);
  const minute = Number(parts.minute);
  // O agendador pode iniciar alguns minutos depois da hora cron.
  return parts.hour === "23" && minute >= 50 && minute <= 59 && !["Sat", "Sun"].includes(parts.weekday);
}

export function lisbonDateKey(date: Date) {
  const parts = lisbonParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function operationalDateValue(operationalDate: string) {
  return new Date(`${operationalDate}T12:00:00`);
}

function payloadRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function jsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonValue(item)]));
  return value;
}

export function buildDailyReportSnapshot(input: { operationalDate: string; tasks: any[]; entries: any[]; nonconformities: any[]; summaries: any[]; factories: any[] }) {
  const operationalEntries = input.entries.filter((entry) => {
    const payload = payloadRecord(entry.payload);
    const plannedDate = typeof payload.plannedDate === "string" ? localDateKey(new Date(payload.plannedDate)) : null;
    return plannedDate === input.operationalDate || localDateKey(new Date(entry.completedAt)) === input.operationalDate;
  });
  const entryIds = new Set(operationalEntries.map((entry) => entry.id));
  return jsonValue({
    schemaVersion: 1,
    operationalDate: input.operationalDate,
    generatedAt: new Date().toISOString(),
    factories: input.factories,
    plannedTasks: input.tasks.filter((task) => localDateKey(new Date(task.dueAt)) === input.operationalDate),
    controlEntries: operationalEntries,
    incidences: input.nonconformities.filter((item) => item.sourceEntryId && entryIds.has(item.sourceEntryId)),
    dailyNotes: input.summaries.filter((item) => localDateKey(new Date(item.referenceDate)) === input.operationalDate),
  }) as Record<string, unknown>;
}

async function archiveData(db: any, operationalDate: string) {
  const [tasks, entries, ncRows, summaryRows, factoryRows] = await Promise.all([
    db.select().from(controlTasks).orderBy(controlTasks.dueAt),
    db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
    db.select().from(nonconformities).orderBy(desc(nonconformities.detectedAt)),
    db.select().from(dailyIncidenceSummaries).orderBy(desc(dailyIncidenceSummaries.updatedAt)),
    db.select().from(factories).orderBy(factories.name),
  ]);
  return buildDailyReportSnapshot({ operationalDate, tasks, entries, nonconformities: ncRows, summaries: summaryRows, factories: factoryRows });
}

async function nextRevision(db: any, operationalDate: string) {
  const archives = await db.select().from(dailyReportArchives).where(eq(dailyReportArchives.operationalDate, operationalDateValue(operationalDate))).orderBy(desc(dailyReportArchives.revision));
  return (archives[0]?.revision ?? 0) + 1;
}

export async function createInitialDailyReportArchive(operationalDate: string, createdBy = "Arquivo automático") {
  const db = await getDb();
  if (!db) throw new Error("Base de dados indisponível para criar o arquivo diário.");
  const dateValue = operationalDateValue(operationalDate);
  const existing = (await db.select().from(dailyReportArchives).where(eq(dailyReportArchives.operationalDate, dateValue))).find((item: any) => item.archiveKind === "initial");
  if (existing) {
    const backup = await ensureDailyReportArchiveBackup(existing.id);
    return { created: false, archive: existing, backup };
  }
  const snapshot = await archiveData(db, operationalDate);
  const revision = await nextRevision(db, operationalDate);
  const inserted = await db.insert(dailyReportArchives).values({ operationalDate: dateValue, revision, archiveKind: "initial", triggerTaskId: null, triggerEntryId: null, revisionReason: "Arquivo diário inicial", snapshot, createdBy });
  const archiveId = Number(inserted?.[0]?.insertId);
  const backup = Number.isInteger(archiveId) && archiveId > 0 ? await ensureDailyReportArchiveBackup(archiveId) : null;
  return { created: true, revision, archiveId, backup };
}

export async function createRetroactiveDailyReportRevision(input: { taskId: number; entryId?: number | null; dueAt: Date; module: string; reason: string; createdBy: string }) {
  const db = await getDb();
  if (!db) throw new Error("Base de dados indisponível para criar a revisão retroativa.");
  const settings = (await db.select().from(dailyReportArchiveSettings).orderBy(desc(dailyReportArchiveSettings.id)))[0];
  if (!settings || settings.active !== "true") return { created: false, skipped: "archive_disabled" as const };
  const operationalDate = localDateKey(new Date(input.dueAt));
  const duplicate = (await db.select().from(dailyReportArchives).where(eq(dailyReportArchives.triggerTaskId, input.taskId))).find((archive: any) => archive.archiveKind === "retroactive_revision");
  if (duplicate) {
    const backup = await ensureDailyReportArchiveBackup(duplicate.id);
    return { created: false, skipped: "already_archived" as const, backup };
  }
  const archivesForDate = await db.select().from(dailyReportArchives).where(eq(dailyReportArchives.operationalDate, operationalDateValue(operationalDate))).orderBy(desc(dailyReportArchives.revision));
  const hasInitialArchive = archivesForDate.some((archive: any) => archive.archiveKind === "initial");
  const snapshot = await archiveData(db, operationalDate);
  if (!hasInitialArchive) {
    const recoveryRevision = (archivesForDate[0]?.revision ?? 0) + 1;
    const recovered = await db.insert(dailyReportArchives).values({ operationalDate: operationalDateValue(operationalDate), revision: recoveryRevision, archiveKind: "initial", triggerTaskId: null, triggerEntryId: null, revisionReason: "Recuperação do arquivo inicial — o fecho automático das 23:55 não estava disponível.", snapshot, createdBy: "Arquivo automático (recuperação)" });
    const recoveredId = Number(recovered?.[0]?.insertId);
    if (Number.isInteger(recoveredId) && recoveredId > 0) await ensureDailyReportArchiveBackup(recoveredId);
  }
  const revision = await nextRevision(db, operationalDate);
  const inserted = await db.insert(dailyReportArchives).values({ operationalDate: operationalDateValue(operationalDate), revision, archiveKind: "retroactive_revision", triggerTaskId: input.taskId, triggerEntryId: input.entryId ?? null, revisionReason: `${input.module}: ${input.reason}`, snapshot, createdBy: input.createdBy });
  const archiveId = Number(inserted?.[0]?.insertId);
  const backup = Number.isInteger(archiveId) && archiveId > 0 ? await ensureDailyReportArchiveBackup(archiveId) : null;
  return { created: true, revision, operationalDate, archiveId, backup };
}

export async function runScheduledDailyReportArchive(taskUid: string, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Base de dados indisponível para executar o arquivo diário.");
  const settings = (await db.select().from(dailyReportArchiveSettings).where(eq(dailyReportArchiveSettings.scheduleCronTaskUid, taskUid)))[0];
  if (!settings || settings.active !== "true") return { ok: true, skipped: "inactive_or_orphan" };
  if (!isLisbonArchiveTime(now)) return { ok: true, skipped: "outside_lisbon_schedule" };
  const operationalDate = lisbonDateKey(now);
  const result = await createInitialDailyReportArchive(operationalDate, "Arquivo automático às 23:55");
  return { ok: true, operationalDate, ...result };
}
