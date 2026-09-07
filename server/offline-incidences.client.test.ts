import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listOfflineIncidences, queueOfflineIncidence, syncOfflineIncidences } from "../client/src/lib/offlineIncidences";

const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, value: online });

function clearOfflineDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("qualicontrol-offline");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

describe("fila offline de incidências", () => {
  beforeEach(async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
    setOnline(false);
    await clearOfflineDatabase();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("guarda uma incidência localmente quando não há ligação", async () => {
    const result = await queueOfflineIncidence({
      title: "Embalagem danificada",
      description: "Produto com embalagem danificada na saída.",
      factoryId: 1,
      module: "not_applicable",
      photos: [{ fileName: "embalagem.jpg", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,Zm90bw==" }],
      occurredOn: "2026-08-18",
      occurredAt: "2026-08-20T10:00:00.000Z",
      authorProfileId: 1,
      authorName: "Sabrina Esteves",
    });

    expect(result).toMatchObject({ synced: 0, pending: 1 });
    await expect(listOfflineIncidences()).resolves.toEqual([expect.objectContaining({ title: "Embalagem danificada", authorName: "Sabrina Esteves", module: "not_applicable", occurredOn: "2026-08-18", photos: [expect.objectContaining({ fileName: "embalagem.jpg" })] })]);
  });

  it("remove da fila apenas as incidências confirmadas pela sincronização", async () => {
    await queueOfflineIncidence({
      title: "Rótulo incorreto",
      description: "Rótulo do produto não corresponde à ordem.",
      factoryId: 2,
      module: "dispatch_control",
      photos: [],
      occurredOn: "2026-08-19",
      occurredAt: "2026-08-20T11:00:00.000Z",
      authorProfileId: 2,
      authorName: "Neuza Antunes",
    });
    const [queued] = await listOfflineIncidences();
    setOnline(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ syncedIds: [queued.offlineSyncId] }) }));

    await expect(syncOfflineIncidences()).resolves.toEqual({ synced: 1, pending: 0 });
    await expect(listOfflineIncidences()).resolves.toEqual([]);
  });

  it("partilha uma única sincronização quando existem pedidos concorrentes", async () => {
    await queueOfflineIncidence({
      title: "Produto mal rotulado",
      description: "A etiqueta não corresponde ao produto expedido.",
      factoryId: 1,
      module: "dispatch_control",
      photos: [],
      occurredOn: "2026-08-20",
      occurredAt: "2026-08-20T12:00:00.000Z",
      authorProfileId: 1,
      authorName: "Sabrina Esteves",
    });
    const [queued] = await listOfflineIncidences();
    setOnline(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ syncedIds: [queued.offlineSyncId] }) });
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([syncOfflineIncidences(), syncOfflineIncidences()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ synced: 1, pending: 0 });
    expect(second).toEqual({ synced: 1, pending: 0 });
    await expect(listOfflineIncidences()).resolves.toEqual([]);
  });
});
