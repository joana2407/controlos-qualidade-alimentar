import * as XLSX from "xlsx";
import { desc, eq, sql } from "drizzle-orm";
import { dailyReportArchives } from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}
function dateKey(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "sem-data" : date.toISOString().slice(0, 10);
}
function displayDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
}
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (value instanceof Date) return displayDate(value);
  if (Array.isArray(value) || (typeof value === "object" && value)) return JSON.stringify(value);
  return String(value);
}
function toWorkbook(archive: any) {
  const snapshot = asRecord(archive.snapshot);
  const tasks = asRows(snapshot.plannedTasks);
  const controls = asRows(snapshot.controlEntries);
  const incidences = asRows(snapshot.incidences);
  const notes = asRows(snapshot.dailyNotes);
  const incidencePhotos = asRows(snapshot.incidencePhotos);
  const controlPhotos = asRows(snapshot.controlPhotos);
  const photos: Record<string, unknown>[] = [
    ...incidencePhotos.map(photo => ({ ...photo, Tipo: "Incidência" })),
    ...controlPhotos.map(photo => ({ ...photo, Tipo: "Controlo" })),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    "Data operacional": dateKey(archive.operationalDate),
    "Período incluído": `${dateKey(archive.operationalDate)} 00:00–23:59 (Europe/Lisbon)`,
    Versão: `V${archive.revision}`,
    Tipo: archive.archiveKind === "initial" ? "Arquivo diário inicial" : "Revisão retroativa",
    "Criado em": displayDate(archive.createdAt),
    "Criado por": archive.createdBy ?? "",
    "Motivo da revisão": archive.revisionReason ?? "",
    "Tarefas planeadas": tasks.length,
    Controlos: controls.length,
    Incidências: incidences.length,
    Anotações: notes.length,
    Fotografias: photos.length,
  }]), "Resumo da versão");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tasks.map((task) => ({
    ID: formatValue(task.id), Controlo: formatValue(task.module), Título: formatValue(task.title), "Fábrica / linha": formatValue(task.factoryName ?? task.factory ?? task.factoryId),
    Responsável: formatValue(task.responsible ?? task.assignedToName), Estado: formatValue(task.status), Data: displayDate(task.dueAt),
    "Concluído em": displayDate(task.completedAt), "Criado por": formatValue(task.createdByName ?? task.createdBy), Dados: formatValue(task),
  }))), "Tarefas planeadas");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(controls.map((entry) => ({
    ID: formatValue(entry.id), Data: displayDate(entry.completedAt), "Data operacional": formatValue(asRecord(entry.payload).actualVerificationDate ?? asRecord(entry.payload).plannedDate), Controlo: formatValue(entry.module), "Fábrica / linha": formatValue(entry.factoryName ?? entry.factory ?? entry.factoryId),
    Área: formatValue(entry.area), Resultado: formatValue(entry.result), Título: formatValue(entry.title),
    "Registado por": formatValue(entry.registeredByName), Função: formatValue(entry.registeredByTitle), "Tarefa associada": formatValue(asRecord(entry.payload).plannedTaskId), Observações: formatValue(entry.notes), Dados: formatValue(entry.payload),
  }))), "Controlos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(incidences.map((incidence) => ({
    ID: formatValue(incidence.id), "Registo de origem": formatValue(incidence.sourceEntryId), Data: displayDate(incidence.detectedAt ?? incidence.occurredAt ?? incidence.createdAt ?? incidence.completedAt), "Data da ocorrência": formatValue(asRecord(incidence.payload).occurredOn), Título: formatValue(incidence.title), Controlo: formatValue(incidence.module),
    Área: formatValue(incidence.area), "Fábrica / linha": formatValue(incidence.factoryId), Estado: formatValue(incidence.status), Gravidade: formatValue(incidence.severity), Responsável: formatValue(incidence.assignedTo), Descrição: formatValue(incidence.description ?? incidence.notes), Tratamento: formatValue(asRecord(incidence.payload).incidenceTreatment), Dados: formatValue(incidence.payload),
  }))), "Incidências");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(photos.map(photo => ({
    Tipo: formatValue(photo.Tipo), "ID do registo": formatValue(photo.incidenceId ?? photo.controlEntryId), Chave: formatValue(photo.key), Ficheiro: formatValue(photo.fileName), "Tipo MIME": formatValue(photo.mimeType), "Ligação para fotografia": formatValue(photo.url),
  }))), "Fotografias");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(notes.map((note) => ({
    Anotação: formatValue(note.note), "Atualizada por": formatValue(note.updatedByName ?? note.createdBy), Data: displayDate(note.updatedAt ?? note.createdAt),
  }))), "Anotações");
  return workbook;
}

/**
 * Garante o backup final do dia. As revisões continuam na BD para auditoria,
 * mas apenas a revisão mais recente mantém a referência ao ficheiro Excel.
 */
export async function ensureDailyReportArchiveBackup(archiveId: number) {
  const db = await getDb();
  if (!db) throw new Error("Base de dados indisponível para guardar o backup diário.");
  const archive = (await db.select().from(dailyReportArchives).where(eq(dailyReportArchives.id, archiveId)).limit(1))[0];
  if (!archive) throw new Error("Versão de arquivo não encontrada para gerar o backup.");

  const operationalDate = dateKey(archive.operationalDate);
  const sameDay = await db.select().from(dailyReportArchives)
    .where(sql`DATE(${dailyReportArchives.operationalDate}) = ${operationalDate}`)
    .orderBy(desc(dailyReportArchives.revision));
  const finalArchive = sameDay[0] ?? archive;
  if (finalArchive.id !== archive.id) {
    return { created: false, skipped: "not_final_version" as const, archive: finalArchive };
  }

  const filename = `relatorio-diario-${operationalDate}.xlsx`;
  const snapshotVersion = Number(asRecord(finalArchive.snapshot).schemaVersion ?? 1);
  if (finalArchive.backupFileKey && finalArchive.backupFileUrl && snapshotVersion >= 2) {
    for (const previous of sameDay.slice(1)) {
      if (previous.backupFileKey || previous.backupFileUrl) {
        await db.update(dailyReportArchives).set({ backupFileKey: null, backupFileUrl: null, backupGeneratedAt: null, backupSizeBytes: null }).where(eq(dailyReportArchives.id, previous.id));
      }
    }
    return { created: false, archive: finalArchive, reconciled: true };
  }
  const bytes = XLSX.write(toWorkbook(finalArchive), { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  // A chave estável substitui o objeto anterior no storage compatível com S3.
  const backup = await storagePut(`qualicontrol/backups-diarios/${operationalDate}/${filename}`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const generatedAt = new Date();

  for (const previous of sameDay) {
    if (previous.id !== finalArchive.id && (previous.backupFileKey || previous.backupFileUrl)) {
      await db.update(dailyReportArchives).set({ backupFileKey: null, backupFileUrl: null, backupGeneratedAt: null, backupSizeBytes: null }).where(eq(dailyReportArchives.id, previous.id));
    }
  }
  await db.update(dailyReportArchives).set({ backupFileKey: backup.key, backupFileUrl: backup.url, backupGeneratedAt: generatedAt, backupSizeBytes: bytes.byteLength }).where(eq(dailyReportArchives.id, finalArchive.id));
  return { created: true, archiveId: finalArchive.id, fileName: filename, ...backup, generatedAt, sizeBytes: bytes.byteLength };
}

export { toWorkbook };
