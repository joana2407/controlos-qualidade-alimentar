import { desc, eq } from "drizzle-orm";
import {
  areas,
  checklistAreas,
  checklistItemAreas,
  checklistItemFactories,
  checklistItems,
  controlEntries,
  controlTasks,
  factories,
  fragileItems,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  entryMatchesPlannedTask,
  isHistoricalPlanTaskSatisfied,
} from "../server/routers/quality";

type AuditResult = {
  taskId: number;
  module: string;
  factoryId: number | null;
  plannedDate: string;
  matchingEntries: number;
  latestRegisteredAt: string | null;
};

const apply = process.argv.includes("--apply");
const db = await getDb();

if (!db) throw new Error("A base de dados não está disponível.");

const [tasks, entries, areaCatalog, monthlyItems, monthlyAssignments, monthlyAreaAssignments, monthlyAreaRows, factoryCatalog, fragileCatalog] =
  await Promise.all([
    db.select().from(controlTasks).orderBy(controlTasks.dueAt),
    db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
    db.select().from(areas).orderBy(areas.name),
    db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
    db.select().from(checklistItemFactories).orderBy(checklistItemFactories.factoryId),
    db.select().from(checklistItemAreas),
    db.select().from(checklistAreas),
    db.select().from(factories).orderBy(factories.name),
    db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
  ]);

const activeEntries = entries.filter(entry => {
  const payload =
    entry.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload)
      ? (entry.payload as Record<string, unknown>)
      : {};
  const lifecycle = payload.recordLifecycle;
  return !(
    lifecycle &&
    typeof lifecycle === "object" &&
    (lifecycle as Record<string, unknown>).status === "deleted"
  );
});

const reconciled = tasks
  .filter(task => task.area === "Plano do Dia" && task.status === "pending")
  .flatMap(task => {
    if (
      !isHistoricalPlanTaskSatisfied(
        task,
        activeEntries,
        areaCatalog,
        monthlyItems,
        monthlyAssignments,
        factoryCatalog,
        monthlyAreaAssignments,
        monthlyAreaRows,
        fragileCatalog
      )
    )
      return [];
    const matchingEntries = activeEntries.filter(entry =>
      entryMatchesPlannedTask(entry, task)
    );
    const latest = matchingEntries[0];
    return [
      {
        task,
        latest,
        result: {
          taskId: task.id,
          module: task.module,
          factoryId: task.factoryId,
          plannedDate: task.dueAt.toISOString().slice(0, 10),
          matchingEntries: matchingEntries.length,
          latestRegisteredAt: latest?.completedAt.toISOString() ?? null,
        } satisfies AuditResult,
      },
    ];
  });

if (apply) {
  for (const { task, latest } of reconciled) {
    await db
      .update(controlTasks)
      .set({
        status: "completed",
        completedAt: latest?.completedAt ?? task.dueAt,
        completedByProfileId: latest?.registeredByProfileId ?? null,
        completedByName: latest?.registeredByName ?? null,
        completedByTitle: latest?.registeredByTitle ?? null,
      })
      .where(eq(controlTasks.id, task.id));
  }
}

console.log(
  JSON.stringify(
    {
      mode: apply ? "applied" : "audit",
      reconciledCount: reconciled.length,
      tasks: reconciled.map(item => item.result),
    },
    null,
    2
  )
);

process.exit(0);
