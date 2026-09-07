import { eq } from "drizzle-orm";
import { z } from "zod";
import { controlEntries, qualityModuleValues } from "../drizzle/schema";
import { getDb } from "./db";
import type { QualityOperator } from "./_core/context";
import { storagePut } from "./storage";

export const offlineIncidenceInputSchema = z.object({
  offlineSyncId: z.string().uuid(),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(2).max(3000),
  factoryId: z.number().int().positive().nullable(),
  area: z.string().trim().min(2).max(120).optional().default("Não aplicável"),
  module: z.enum(qualityModuleValues),
  photos: z.array(z.object({ fileName: z.string().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), dataUrl: z.string().min(20).max(7_000_000) })).max(5).optional().default([]),
  occurredOn: z.string().date().optional(),
  occurredAt: z.string().datetime(),
  queuedAt: z.string().datetime(),
});

export type OfflineIncidenceInput = z.infer<typeof offlineIncidenceInputSchema>;

export async function persistOfflineIncidence(input: OfflineIncidenceInput, operator: QualityOperator, createdBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Base de dados indisponível.");

  const existing = (await db.select({ id: controlEntries.id }).from(controlEntries).where(eq(controlEntries.offlineSyncId, input.offlineSyncId)).limit(1))[0];
  if (existing) return { id: existing.id, duplicate: true };

  const completedAt = new Date();
  const evidencePhotos = await Promise.all(input.photos.map(async (photo) => {
    const base64 = photo.dataUrl.split(",")[1];
    if (!base64) throw new Error("Uma das fotografias da incidência é inválida.");
    const safeName = photo.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { key, url } = await storagePut(`offline-incidences/${input.offlineSyncId}/${Date.now()}-${safeName}`, Buffer.from(base64, "base64"), photo.mimeType);
    return { key, url, fileName: photo.fileName, mimeType: photo.mimeType };
  }));
  const inserted = await db.insert(controlEntries).values({
    module: input.module,
    title: input.title,
    area: input.area,
    factoryId: input.factoryId,
    result: "NC",
    notes: input.description,
    payload: {
      offlineManualIncidence: true,
      occurredOn: input.occurredOn ?? new Date(input.occurredAt).toISOString().slice(0, 10),
      offlineQueuedAt: input.queuedAt,
      offlineSyncId: input.offlineSyncId,
      evidencePhotos,
    },
    offlineSyncId: input.offlineSyncId,
    completedAt: Number.isNaN(completedAt.getTime()) ? new Date() : completedAt,
    registeredByProfileId: operator.id,
    registeredByName: operator.name,
    registeredByTitle: operator.title,
    createdBy,
  });
  const insertedId = Array.isArray(inserted) ? Number((inserted[0] as { insertId?: number } | undefined)?.insertId ?? 0) : 0;
  return { id: insertedId, duplicate: false };
}
