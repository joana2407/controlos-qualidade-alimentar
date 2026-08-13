export type FactoryScoped = { factoryId: number | null };

export function scopeToFactory<T extends FactoryScoped>(records: T[], factoryId?: number) {
  return factoryId ? records.filter((record) => record.factoryId === factoryId) : records;
}

export function calculatePlanCompliance(tasks: Array<FactoryScoped & { status: string }>) {
  if (!tasks.length) return 0;
  return Number(((tasks.filter((task) => task.status === "completed").length / tasks.length) * 100).toFixed(1));
}

export function countOpenNonconformities(ncs: Array<FactoryScoped & { status: string; severity: string }>) {
  return {
    open: ncs.filter((nc) => nc.status !== "closed").length,
    criticalOpen: ncs.filter((nc) => nc.status !== "closed" && nc.severity === "critical").length,
  };
}
