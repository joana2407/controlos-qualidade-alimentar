import { eq } from "drizzle-orm";
import { z } from "zod";
import { controlEntries, qualityModuleValues } from "../drizzle/schema";
import { getDb } from "./db";
import type { QualityOperator } from "./_core/context";

export const offlineIncidenceInputSchema = z.object({
  offlineSyncId: z.string().uuid(),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(2).max(3000),
  factoryId: z.number().int().positive().nullable(),
  area: z.string().trim().min(2).max(120),
  module: z.enum(qualityModuleValues),
  occurredAt: z.string().datetime(),
  queuedAt: z.string().datetime(),
});

export type OfflineIncidenceInput = z.infer<typeof offlineIncidenceInputSchema>;

export async function persistOfflineIncidence(input: OfflineIncidenceInput, operator: QualityOperator, createdBy: string) {
  const db = await getDb();
  if (!db) throw new Error("Base de dados indisponível.");

  const existing = (await db.select({ id: controlEntries.id }).from(controlEntries).where(eq(controlEntries.offlineSyncId, input.offlineSyncId)).limit(1))[0];
  if (existing) return { id: existing.id, duplicate: true };

  const completedAt = new Date(input.occurredAt);
  const inserted = await db.insert(controlEntries).values({
    module: input.module,
    title: input.title,
    area: input.area,
    factoryId: input.factoryId,
    result: "NC",
    notes: input.description,
    payload: {
      offlineManualIncidence: true,
      offlineQueuedAt: input.queuedAt,
      offlineSyncId: input.offlineSyncId,
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
