import type { LocalDatabase, LocalRow } from "./localDatabase";
const DB_NAME = "qualicontrol-independent-media";
const STORE = "files";
function openDatabase(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
export async function storeLocalMedia(rows: LocalRow[]): Promise<void> {
  if (!rows.length) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => { const transaction = db.transaction(STORE, "readwrite"); for (const row of rows) transaction.objectStore(STORE).put(row.dataUrl, row.id); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = transaction.onabort = () => { db.close(); reject(new Error("Não foi possível preservar as fotografias no navegador. Nenhuma importação foi confirmada. Verifique o espaço disponível.")); }; });
}
const memory = new Map<string, string>();
export async function readLocalMedia(id: string): Promise<string | null> {
  if (memory.has(id)) return memory.get(id)!;
  const db = await openDatabase();
  return new Promise((resolve, reject) => { const transaction = db.transaction(STORE, "readonly"), request = transaction.objectStore(STORE).get(id); request.onsuccess = () => { const value = request.result ?? null; if (value && memory.size < 25) memory.set(id, value); resolve(value); }; request.onerror = () => reject(request.error); transaction.oncomplete = () => db.close(); });
}
export async function extractLocalMedia(database: LocalDatabase) {
  const rows = database.tables.media.filter(row => row.dataUrl);
  const ids = new Map<string, string>(rows.map(row => [row.dataUrl, String(row.id)]));
  function walk(value: any): any {
    if (typeof value === "string" && /^data:(?:image\/|application\/pdf)/.test(value)) {
      let id = ids.get(value);
      if (!id) { id = `photo-${crypto.randomUUID()}`; ids.set(value, id); rows.push({ id, dataUrl: value }); database.tables.media.push({ id }); }
      return `local-media:${id}`;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object" && !(value instanceof Date)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item)]));
    return value;
  }
  for (const name of Object.keys(database.tables)) if (name !== "media") database.tables[name] = walk(database.tables[name]);
  await storeLocalMedia(rows);
  database.tables.media = database.tables.media.map(({ dataUrl, ...metadata }) => metadata);
}
export async function includeLocalMedia(database: LocalDatabase) {
  database.tables.media = await Promise.all(database.tables.media.map(async row => { const dataUrl = await readLocalMedia(String(row.id)); if (!dataUrl) throw new Error("Uma fotografia do histórico não foi encontrada. O backup foi interrompido para não entregar uma cópia incompleta."); return { ...row, dataUrl }; }));
}
export async function resolveLocalMediaValue(database: LocalDatabase, value: any): Promise<any> {
  const pending: Array<Promise<void>> = [];
  function walk(node: any, parent?: any, key?: any): any {
    if (typeof node === "string" && node.startsWith("local-media:")) { pending.push(readLocalMedia(node.slice(12)).then(url => { if (parent) parent[key] = url ?? ""; })); return node; }
    if (Array.isArray(node)) { const result: any[] = []; node.forEach((item, index) => { result[index] = walk(item, result, index); }); return result; }
    if (node && typeof node === "object" && !(node instanceof Date)) { const result: any = {}; Object.entries(node).forEach(([name, item]) => { result[name] = walk(item, result, name); }); return result; }
    return node;
  }
  const result = walk(value); await Promise.all(pending); return result;
}
