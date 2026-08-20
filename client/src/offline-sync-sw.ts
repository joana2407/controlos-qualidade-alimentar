/// <reference lib="WebWorker" />
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> };

const DB_NAME = "qualicontrol-offline";
const STORE_NAME = "offline-incidences";
const SYNC_TAG = "qualicontrol-incidence-sync";

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "offlineSyncId" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function getItems(): Promise<Array<{ offlineSyncId: string }>> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onerror = () => { db.close(); reject(request.error); };
    request.onsuccess = () => { db.close(); resolve(request.result); };
  });
}

async function removeItems(ids: string[]) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    ids.forEach((id) => transaction.objectStore(STORE_NAME).delete(id));
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

async function notifyClients() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage({ type: "OFFLINE_INCIDENCES_SYNCED" }));
}

async function syncOfflineIncidencesInWorker() {
  const items = await getItems();
  if (!items.length) return;
  const response = await fetch("/api/offline-incidences", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw new Error("A sincronização offline será repetida quando a sessão estiver disponível.");
  const result = await response.json() as { syncedIds: string[] };
  await removeItems(result.syncedIds);
  await notifyClients();
}

self.addEventListener("sync", (event) => {
  const syncEvent = event as Event & { tag: string; waitUntil: (promise: Promise<unknown>) => void };
  if (syncEvent.tag === SYNC_TAG) syncEvent.waitUntil(syncOfflineIncidencesInWorker());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SYNC_OFFLINE_INCIDENCES") event.waitUntil(syncOfflineIncidencesInWorker());
});
