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
  buildPlannedCoverage,
  completedCoverageSlots,
  entryMatchesPlannedTask,
  isHistoricalPlanTaskSatisfied,
} from "../server/routers/quality";

const apply = process.argv.includes("--apply");
const db = await getDb();
if (!db) throw new Error("A base de dados não está disponível.");

const [tasks, entries, areaCatalog, monthlyItems, monthlyAssignments, factoryCatalog, monthlyAreaAssignments, monthlyAreaRows, fragileCatalog] =
  await Promise.all([
    db.select().from(controlTasks).orderBy(controlTasks.dueAt),
    db.select().from(controlEntries).orderBy(desc(controlEntries.completedAt)),
    db.select().from(areas).orderBy(areas.name),
    db.select().from(checklistItems).orderBy(checklistItems.sortOrder),
    db.select().from(checklistItemFactories).orderBy(checklistItemFactories.factoryId),
    db.select().from(factories).orderBy(factories.name),
    db.select().from(checklistItemAreas),
    db.select().from(checklistAreas),
    db.select().from(fragileItems).orderBy(fragileItems.sortOrder),
  ]);

const planTasks = tasks.filter(
  task =>
    task.area === "Plano do Dia" &&
    task.status !== "cancelled" &&
    (!Array.isArray(task.plannedCoverage) || !task.plannedCoverage.length)
);

const backfill = planTasks.map(task => {
  const taskEntries = entries.filter(entry => entryMatchesPlannedTask(entry, task));
  const satisfied = isHistoricalPlanTaskSatisfied(
    task,
    entries,
    areaCatalog,
    monthlyItems,
    monthlyAssignments,
    factoryCatalog,
    monthlyAreaAssignments,
    monthlyAreaRows,
    fragileCatalog
  );
  const preserveCompletedCoverage = task.status === "completed" || satisfied;
  const plannedCoverage = preserveCompletedCoverage
    ? Array.from(completedCoverageSlots(task.module, taskEntries))
    : buildPlannedCoverage(
        task,
        entries,
        areaCatalog,
        monthlyItems,
        monthlyAssignments,
        factoryCatalog,
        monthlyAreaAssignments,
        monthlyAreaRows,
        fragileCatalog
      );
  return {
    task,
    plannedCoverage,
    source: preserveCompletedCoverage ? "completed_entries" : "legacy_rules",
  };
});

if (apply) {
  for (const item of backfill)
    await db
      .update(controlTasks)
      .set({ plannedCoverage: item.plannedCoverage })
      .where(eq(controlTasks.id, item.task.id));
}

console.log(
  JSON.stringify(
    {
      mode: apply ? "applied" : "audit",
      taskCount: backfill.length,
      completedEntrySnapshots: backfill.filter(
        item => item.source === "completed_entries"
      ).length,
      legacyRuleSnapshots: backfill.filter(item => item.source === "legacy_rules")
        .length,
      emptySnapshots: backfill.filter(item => item.plannedCoverage.length === 0).map(item => item.task.id),
    },
    null,
    2
  )
);

process.exit(0);
