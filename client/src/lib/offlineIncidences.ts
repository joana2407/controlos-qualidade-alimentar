export const OFFLINE_INCIDENCE_EVENT = "qualicontrol:offline-incidences";
export const OFFLINE_INCIDENCE_SYNC_TAG = "qualicontrol-incidence-sync";

export type OfflineIncidencePhoto = { fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; dataUrl: string };

export type OfflineIncidenceDraft = {
  offlineSyncId: string;
  title: string;
  description: string;
  factoryId: number | null;
  module: string;
  photos: OfflineIncidencePhoto[];
  occurredAt: string;
  queuedAt: string;
  authorProfileId: number;
  authorName: string;
};

const DB_NAME = "qualicontrol-offline";
const STORE_NAME = "offline-incidences";

function announceQueueChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_INCIDENCE_EVENT));
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento offline."));
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "offlineSyncId" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function runStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onerror = () => reject(request.error ?? new Error("Não foi possível atualizar a fila offline."));
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Não foi possível atualizar a fila offline.")); };
  });
}

export async function listOfflineIncidences(): Promise<OfflineIncidenceDraft[]> {
  const items = await runStore("readonly", (store) => store.getAll());
  return [...items].sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
}

async function removeOfflineIncidences(ids: string[]) {
  if (!ids.length) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    ids.forEach((id) => store.delete(id));
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Não foi possível remover os itens sincronizados.")); };
  });
}

async function requestBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
  if (sync) await sync.register(OFFLINE_INCIDENCE_SYNC_TAG);
  registration.active?.postMessage({ type: "SYNC_OFFLINE_INCIDENCES" });
}

export async function syncOfflineIncidences() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, pending: (await listOfflineIncidences()).length };
  const items = await listOfflineIncidences();
  if (!items.length) return { synced: 0, pending: 0 };
  const response = await fetch("/api/offline-incidences", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: "Não foi possível sincronizar as incidências." }))).error);
  const result = await response.json() as { syncedIds: string[] };
  await removeOfflineIncidences(result.syncedIds);
  announceQueueChange();
  return { synced: result.syncedIds.length, pending: (await listOfflineIncidences()).length };
}

export async function queueOfflineIncidence(draft: Omit<OfflineIncidenceDraft, "offlineSyncId" | "queuedAt">) {
  const record: OfflineIncidenceDraft = {
    ...draft,
    offlineSyncId: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  };
  await runStore("readwrite", (store) => store.put(record));
  announceQueueChange();
  try {
    await requestBackgroundSync();
    if (navigator.onLine) return await syncOfflineIncidences();
  } catch {
    // A incidência mantém-se na fila local e será reenviada quando a ligação regressar.
  }
  return { synced: 0, pending: (await listOfflineIncidences()).length };
}

export function initialiseOfflineIncidenceSync() {
  const synchronise = () => syncOfflineIncidences().catch(() => undefined);
  window.addEventListener("online", synchronise);
  window.addEventListener("focus", synchronise);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") synchronise(); });
  navigator.serviceWorker?.addEventListener("message", (event) => {
    if (event.data?.type === "OFFLINE_INCIDENCES_SYNCED") {
      announceQueueChange();
      synchronise();
    }
  });
  synchronise();
  return () => {
    window.removeEventListener("online", synchronise);
    window.removeEventListener("focus", synchronise);
  };
}
