import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
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
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    "Data operacional": dateKey(archive.operationalDate),
    Versão: `V${archive.revision}`,
    Tipo: archive.archiveKind === "initial" ? "Arquivo diário inicial" : "Revisão retroativa",
    "Criado em": displayDate(archive.createdAt),
    "Criado por": archive.createdBy ?? "",
    "Motivo da revisão": archive.revisionReason ?? "",
    "Tarefas planeadas": tasks.length,
    Controlos: controls.length,
    Incidências: incidences.length,
    Anotações: notes.length,
  }]), "Resumo da versão");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tasks.map((task) => ({
    Controlo: formatValue(task.module),
    "Fábrica / linha": formatValue(task.factoryName ?? task.factory),
    Responsável: formatValue(task.responsible ?? task.assignedToName),
    Estado: formatValue(task.status),
    Data: displayDate(task.dueAt),
  }))), "Tarefas planeadas");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(controls.map((entry) => ({
    Data: displayDate(entry.completedAt),
    Controlo: formatValue(entry.module),
    "Fábrica / linha": formatValue(entry.factoryName ?? entry.factory),
    Área: formatValue(entry.area),
    Resultado: formatValue(entry.result),
    Título: formatValue(entry.title),
    "Registado por": formatValue(entry.registeredByName),
    Função: formatValue(entry.registeredByTitle),
    Observações: formatValue(entry.notes),
    Dados: formatValue(entry.payload),
  }))), "Controlos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(incidences.map((incidence) => ({
    Data: displayDate(incidence.detectedAt ?? incidence.completedAt),
    Título: formatValue(incidence.title),
    Controlo: formatValue(incidence.module),
    Área: formatValue(incidence.area),
    Estado: formatValue(incidence.status),
    Gravidade: formatValue(incidence.severity),
    Descrição: formatValue(incidence.description ?? incidence.notes),
  }))), "Incidências");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(notes.map((note) => ({
    Anotação: formatValue(note.note),
    "Atualizada por": formatValue(note.updatedByName ?? note.createdBy),
    Data: displayDate(note.updatedAt ?? note.createdAt),
  }))), "Anotações");
  return workbook;
}

/** Gera apenas uma vez o ficheiro Excel permanente de uma versão imutável. */
export async function ensureDailyReportArchiveBackup(archiveId: number) {
  const db = await getDb();
  if (!db) throw new Error("Base de dados indisponível para guardar o backup diário.");
  const archive = (await db.select().from(dailyReportArchives).where(eq(dailyReportArchives.id, archiveId)).limit(1))[0];
  if (!archive) throw new Error("Versão de arquivo não encontrada para gerar o backup.");
  if (archive.backupFileKey && archive.backupFileUrl) return { created: false, archive };

  const operationalDate = dateKey(archive.operationalDate);
  const filename = `relatorio-diario-${operationalDate}-V${archive.revision}.xlsx`;
  const bytes = XLSX.write(toWorkbook(archive), { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  const backup = await storagePut(`qualicontrol/backups-diarios/${operationalDate}/${filename}`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const generatedAt = new Date();
  await db.update(dailyReportArchives).set({ backupFileKey: backup.key, backupFileUrl: backup.url, backupGeneratedAt: generatedAt, backupSizeBytes: bytes.byteLength }).where(eq(dailyReportArchives.id, archive.id));
  return { created: true, archiveId: archive.id, fileName: filename, ...backup, generatedAt, sizeBytes: bytes.byteLength };
}
