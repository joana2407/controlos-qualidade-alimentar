import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import superjson from "superjson";
import LZString from "lz-string";
import { getDb } from "../server/db";
import * as schema from "../drizzle/schema";
import { storageGetSignedUrl } from "../server/storage";

const output = "/home/ubuntu/qualicontrol-historico-preservado.json";
const mediaCache = "/home/ubuntu/qualicontrol-historical-media-local";
await fs.mkdir(mediaCache, { recursive: true });
const db = await getDb(); if (!db) throw new Error("Base de dados indisponível; a exportação foi interrompida sem alterar dados.");
const mapping: Record<string, any> = { factories: schema.factories, areas: schema.areas, profiles: schema.qualityPinProfiles, employees: schema.bphfInspectionEmployees, tasks: schema.controlTasks, entries: schema.controlEntries, themes: schema.incidenceThemes, themeMerges: schema.incidenceThemeMerges, employeeMerges: schema.bphfEmployeeMerges, fragileAreas: schema.fragileAreas, fragileItems: schema.fragileItems, checklistAreas: schema.checklistAreas, checklistItems: schema.checklistItems, dispatchOrders: schema.dispatchOrders, ncs: schema.nonconformities, actions: schema.correctiveActions, evidences: schema.evidences, archives: schema.dailyReportArchives, guidance: schema.incidenceAiGuidance, notes: schema.dailyIncidenceSummaries, views: schema.dailyReportArchiveViews };
const tables: Record<string, any[]> = { media: [] };
for (const [name, table] of Object.entries(mapping)) { tables[name] = await db.select().from(table); console.log(`Exportado ${name}: ${tables[name].length}`); }
const panelAccess = await db.select().from(schema.qualityPanelAccess);
const factoryAssignments = await db.select().from(schema.checklistItemFactories);
const areaAssignments = await db.select().from(schema.checklistItemAreas);
for (const profile of tables.profiles) {
  delete profile.pinHash; delete profile.pinSalt; profile.pinHash = null; profile.active = profile.active === "true";
  const access = panelAccess.find(access => access.profileId === profile.id);
  profile.panelAccess = access?.allowedPanels ?? ["dashboard", "platform", "operational_controls", "incidents", "reports", "analytics", "backups"];
  profile.externalPanelAccess = access?.allowedExternalPanels ?? [];
}
for (const item of tables.checklistItems) {
  item.factoryIds = factoryAssignments.filter(assignment => assignment.checklistItemId === item.id).map(assignment => assignment.factoryId);
  item.areaNames = areaAssignments.filter(assignment => assignment.checklistItemId === item.id).map(assignment => tables.checklistAreas.find(area => area.id === assignment.checklistAreaId)?.name).filter(Boolean);
  if (!item.areaNames.length) item.areaNames = [item.area];
}
// Os arquivos/snapshots originais são preservados, incluindo versões históricas. Nunca são reconstruídos pela exportação.
await fs.writeFile("/home/ubuntu/qualicontrol-base-historica-original.json", superjson.stringify({ version: 1, revision: 0, nextId: Date.now(), tables }));
const references = new Set<string>();
function collect(value: any) {
  if (typeof value === "string" && value.startsWith("/manus-storage/") && !value.match(/\.xlsx?(?:$|\?)/i)) references.add(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === "object" && !(value instanceof Date)) Object.entries(value).forEach(([key, value]) => { if (!["backupFileUrl", "backupFileKey"].includes(key)) collect(value); });
}
collect(tables);
console.log(`Ficheiros históricos para preservar: ${references.size}`);
const replacements = new Map<string, string>(), failed: Array<{ url: string; reason: string }> = [];
let done = 0;
const work = Array.from(references);
await Promise.all(Array.from({ length: 5 }, async () => {
  while (work.length) {
    const source = work.shift()!; const key = source.slice("/manus-storage/".length);
    try {
      const cacheFile = path.join(mediaCache, Buffer.from(key).toString("base64url") + ".json");
      let record: { dataUrl: string };
      try { record = JSON.parse(await fs.readFile(cacheFile, "utf8")); }
      catch {
        const url = await storageGetSignedUrl(key), response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const type = response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
        if (type.includes("text/html")) throw new Error("O armazenamento devolveu HTML em vez do ficheiro.");
        const bytes = Buffer.from(await response.arrayBuffer()); if (!bytes.length) throw new Error("Ficheiro vazio");
        record = { dataUrl: `data:${type};base64,${bytes.toString("base64")}` }; await fs.writeFile(cacheFile, JSON.stringify(record));
      }
      const id = `history-media-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
      tables.media.push({ id, sourceKey: key, dataUrl: record.dataUrl }); replacements.set(source, `local-media:${id}`);
    } catch (error) { failed.push({ url: source, reason: error instanceof Error ? error.message : String(error) }); }
    done++; if (done % 10 === 0 || done === references.size) console.log(`Ficheiros preservados: ${done}/${references.size}; indisponíveis: ${failed.length}`);
  }
}));
function replace(value: any): any {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map(replace);
  if (value && typeof value === "object" && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, replace(value)]));
  return value;
}
for (const name of Object.keys(tables)) if (name !== "media") tables[name] = replace(tables[name]);
let highestId = 0; for (const rows of Object.values(tables)) for (const row of rows) if (typeof row.id === "number") highestId = Math.max(highestId, row.id);
const database = { version: 1, revision: 0, nextId: Math.max(Date.now(), highestId + 1), tables };
const media = tables.media.map(row => ({ ...row }));
database.tables.media = tables.media.map(({ dataUrl, ...metadata }) => metadata);
const encoded = "lz:v1:" + LZString.compressToUTF16(superjson.stringify(database));
const backup = { format: "qualicontrol-local-storage-backup", version: 1, exportedAt: new Date().toISOString(), transferKind: "remote-history", entries: { "qualicontrol-independent-db-v1": encoded }, media, preservation: { counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])), unavailableFiles: failed, sourceUnchanged: true, originalPinsNotExported: true } };
await fs.writeFile(output, JSON.stringify(backup));
const stats = await fs.stat(output); await fs.writeFile("/home/ubuntu/qualicontrol-history-export-summary.json", JSON.stringify({ counts: backup.preservation.counts, unavailableFiles: failed, bytes: stats.size, encodedCharacters: encoded.length }, null, 2));
console.log(`Cópia privada concluída: ${output}; ${stats.size} bytes. Base original não alterada.`);
process.exit(0);
