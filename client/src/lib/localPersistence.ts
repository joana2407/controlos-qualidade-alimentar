import { extractLocalMedia, includeLocalMedia } from "./localMediaStorage";
import superjson from "superjson";
import LZString from "lz-string";
import { LOCAL_DATABASE_KEY, initialLocalDatabase, validateLocalDatabase, type LocalDatabase } from "./localDatabase";

const INDEXED_MARKER = "indexeddb:v1";
const COMPRESSED_PREFIX = "lz:v1:";
const DB_NAME = "qualicontrol-independent-data";
const STORE = "database";
export function encodeLocalDatabase(database: LocalDatabase): string { return COMPRESSED_PREFIX + LZString.compressToUTF16(superjson.stringify(database)); }
export function decodeLocalDatabase(raw: string): LocalDatabase {
  const text = raw.startsWith(COMPRESSED_PREFIX) ? LZString.decompressFromUTF16(raw.slice(COMPRESSED_PREFIX.length)) : raw;
  if (!text) throw new Error("O ficheiro local está corrompido. Nenhum dado foi apagado.");
  const database = superjson.parse<LocalDatabase>(text); validateLocalDatabase(database); return database;
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("O navegador não permite abrir o histórico local.")); });
}
async function readIndexed(): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => { const transaction = db.transaction(STORE, "readonly"); const request = transaction.objectStore(STORE).get("current"); request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error); transaction.oncomplete = () => db.close(); });
}
async function writeIndexed(raw: string, revision: number, enforceRevision: boolean): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite"), store = transaction.objectStore(STORE);
    const request = store.get("current");
    request.onsuccess = () => { if (enforceRevision && request.result && decodeLocalDatabase(request.result).revision !== revision) { transaction.abort(); return; } store.put(raw, "current"); };
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onabort = transaction.onerror = () => { db.close(); reject(new Error("Não foi possível guardar o histórico: falta de espaço, armazenamento bloqueado ou alteração noutra janela. Exporte uma cópia de segurança e repita. Nenhum sucesso foi confirmado.")); };
  });
}
export async function loadPersistentDatabase(): Promise<LocalDatabase> {
  const raw = localStorage.getItem(LOCAL_DATABASE_KEY);
  if (!raw) return initialLocalDatabase();
  const stored = raw === INDEXED_MARKER ? await readIndexed() : raw;
  if (!stored) throw new Error("O histórico local não foi encontrado. Importe a cópia de segurança; o armazenamento não foi reinicializado.");
  return decodeLocalDatabase(stored);
}
export async function persistDatabase(database: LocalDatabase, revision: number, enforceRevision = true) {
  validateLocalDatabase(database);
  const current = localStorage.getItem(LOCAL_DATABASE_KEY);
  if (enforceRevision && current && current !== INDEXED_MARKER && decodeLocalDatabase(current).revision !== revision) throw new Error("Os dados foram alterados noutra janela. Atualize a página antes de repetir.");
  database.revision = revision + 1;
  await extractLocalMedia(database);
  const encoded = encodeLocalDatabase(database);
  if (current !== INDEXED_MARKER) {
    try { localStorage.setItem(LOCAL_DATABASE_KEY, encoded); window.dispatchEvent(new Event("qualicontrol-local-data")); return; }
    catch { /* Bases grandes/fotografias passam para IndexedDB; os dados antigos só são substituídos depois de confirmar a gravação. */ }
  }
  await writeIndexed(encoded, revision, enforceRevision && current === INDEXED_MARKER);
  localStorage.setItem(LOCAL_DATABASE_KEY, INDEXED_MARKER);
  window.dispatchEvent(new Event("qualicontrol-local-data"));
}
export async function exportStorageEntries(): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index++) { const key = localStorage.key(index); if (key) entries[key] = localStorage.getItem(key)!; }
  // O backup inclui a base real, não apenas o marcador IndexedDB.
  if (entries[LOCAL_DATABASE_KEY] === INDEXED_MARKER) { const raw = await readIndexed(); if (!raw) throw new Error("Não foi possível incluir o histórico no backup."); entries[LOCAL_DATABASE_KEY] = raw; }
  return entries;
}
export async function exportCompleteBackup() {
  const entries = await exportStorageEntries();
  const database = entries[LOCAL_DATABASE_KEY] ? decodeLocalDatabase(entries[LOCAL_DATABASE_KEY]) : null;
  if (database) await includeLocalMedia(database);
  return { entries, media: database?.tables.media ?? [] };
}
export async function restoreStorageEntries(entries: Record<string, string>, preserveOtherKeys = false, media: Array<Record<string, any>> = []) {
  if (!entries || Array.isArray(entries) || Object.values(entries).some(value => typeof value !== "string")) throw new Error("O backup contém valores inválidos.");
  const raw = entries[LOCAL_DATABASE_KEY];
  const database = raw ? decodeLocalDatabase(raw) : null;
  if (!Array.isArray(media) || media.some(row => typeof row.id !== "string" || typeof row.dataUrl !== "string" || !row.dataUrl.startsWith("data:"))) throw new Error("As fotografias do backup são inválidas.");
  if (database && media.length) { const byId = new Map(media.map(row => [row.id, row])); database.tables.media = database.tables.media.map(row => ({ ...row, ...(byId.get(String(row.id)) ?? {}) })); }
  // Validação completa antes de tocar no armazenamento. Rollback conserva a cópia anterior se houver erro.
  const before = await exportStorageEntries();
  try {
    if (!preserveOtherKeys) localStorage.clear();
    for (const [key, value] of Object.entries(entries)) if (key !== LOCAL_DATABASE_KEY) localStorage.setItem(key, value);
    if (database) await persistDatabase(database, database.revision, false);
  } catch (error) {
    localStorage.clear();
    for (const [key, value] of Object.entries(before)) if (key !== LOCAL_DATABASE_KEY) localStorage.setItem(key, value);
    if (before[LOCAL_DATABASE_KEY]) { const previous = decodeLocalDatabase(before[LOCAL_DATABASE_KEY]); await persistDatabase(previous, previous.revision, false); }
    throw error;
  }
}
