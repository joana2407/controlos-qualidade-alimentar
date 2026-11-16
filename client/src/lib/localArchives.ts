import * as XLSX from "xlsx";
import { insertLocalRow, type LocalDatabase, type LocalRow } from "./localDatabase";
import { dayKey, dayDate, entryDay, aliveEntry, localIncidences } from "./localQualityLogic";

function excelBackup(snapshot: LocalRow) {
  const workbook = XLSX.utils.book_new();
  const controls = (snapshot.controlEntries ?? []).map((entry: LocalRow) => ({ ID: entry.id, Controlo: entry.module, Fábrica: entry.factoryId, Título: entry.title, Área: entry.area, Resultado: entry.result, Observações: entry.notes, "Tec. responsável": entry.registeredByName, Data: entry.completedAt, Detalhes: JSON.stringify(entry.payload ?? {}) }));
  const tasks = (snapshot.plannedTasks ?? []).map((task: LocalRow) => ({ ID: task.id, Tarefa: task.title, Fábrica: task.factoryId, Data: task.dueAt, Estado: task.status, Responsável: task.responsible }));
  const incidences = (snapshot.incidences ?? []).map((entry: LocalRow) => ({ ID: entry.id, Título: entry.title, Fábrica: entry.factoryId, Decisão: entry.treatmentStatus, "NC gerada": entry.generatedNonconformity ? "Sim" : "Não", Tratamento: JSON.stringify(entry.treatment), Histórico: JSON.stringify(entry.treatmentHistory ?? []) }));
  for (const [name, rows] of [["Verificações", controls], ["Plano do Dia", tasks], ["Incidências", incidences], ["Notas", snapshot.dailyNotes ?? []]] as Array<[string, LocalRow[]]>) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Informação: "Sem registos nesta data" }]), name);
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  return { url: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`, bytes: Math.floor(base64.length * 3 / 4) };
}
export function createLocalArchive(db: LocalDatabase, date: any, profile: LocalRow, existing?: LocalRow): LocalRow {
  const key = dayKey(date), current = existing ?? db.tables.archives.find(archive => dayKey(archive.operationalDate) === key);
  const entries = db.tables.entries.filter(entry => entryDay(entry) === key || dayKey(entry.completedAt) === key);
  const snapshot = JSON.parse(JSON.stringify({ schemaVersion: 2, operationalDate: key, periodStart: `${key} 00:00 Europe/Lisbon`, periodEnd: `${key} 23:59:59 Europe/Lisbon`, generatedAt: new Date().toISOString(), factories: db.tables.factories, plannedTasks: db.tables.tasks.filter(task => dayKey(task.dueAt) === key), controlEntries: entries, incidences: localIncidences(db, { date: key }), incidencePhotos: entries.filter(entry => entry.result === "NC").flatMap(entry => (entry.payload?.evidencePhotos ?? []).map((photo: LocalRow) => ({ ...photo, controlEntryId: entry.id }))), controlPhotos: entries.flatMap(entry => (entry.payload?.evidencePhotos ?? []).map((photo: LocalRow) => ({ ...photo, controlEntryId: entry.id }))), dailyNotes: db.tables.notes.filter(note => dayKey(note.referenceDate) === key) }));
  const row = current ?? insertLocalRow(db, "archives", { operationalDate: dayDate(key), revision: 0 });
  Object.assign(row, { snapshot, revision: row.revision + 1, archiveKind: current ? "retroactive_revision" : "initial", revisionReason: current ? "Atualização local do relatório diário" : "Arquivo local do dia", createdBy: profile.name, createdAt: new Date(), backupFileKey: `local:qualicontrol-${key}.xlsx`, backupFileUrl: null, backupGeneratedAt: new Date(), backupSizeBytes: null });
  return row;
}
export function archiveHistory(db: LocalDatabase, input: LocalRow = {}): LocalRow[] {
  return db.tables.archives.filter(archive => !input.date || dayKey(archive.operationalDate) === dayKey(input.date)).sort((a, b) => +b.operationalDate - +a.operationalDate).map(archive => { const backup = excelBackup(archive.snapshot); return { ...archive, snapshot: undefined, controls: archive.snapshot.controlEntries.length, plannedTasks: archive.snapshot.plannedTasks.length, incidences: archive.snapshot.incidences.length, backupFileUrl: backup.url, backupSizeBytes: backup.bytes }; });
}
export function archiveAttention(db: LocalDatabase, profile: LocalRow) {
  const pending = db.tables.archives.filter(archive => archive.archiveKind === "retroactive_revision" && !db.tables.views.some(view => view.archiveId === archive.id && view.profileId === profile.id && view.revision === archive.revision));
  return { count: pending.length, revisions: pending.slice(0, 3).map(archive => ({ id: archive.id, operationalDate: archive.operationalDate, revision: archive.revision, revisionReason: archive.revisionReason, createdBy: archive.createdBy, createdAt: archive.createdAt })) };
}
