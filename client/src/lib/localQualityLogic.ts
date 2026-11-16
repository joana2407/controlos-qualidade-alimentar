import { lisbonDateInputValue, lisbonCalendarDateToUtc } from "@shared/lisbon-time";
import { calculateConformityRate, fragileInspectionDueDate, isFragileInspectionPending } from "../../../server/quality.logic";
import { MODULES, suggestionLocationsForFactory } from "./quality";
import { FOOD_DEFENSE_CRITERIA } from "./foodDefenseCatalog";
import type { LocalDatabase, LocalRow } from "./localDatabase";

export const BPHF_CRITERIA = ["Estado de limpeza e conservação do fardamento", "Higienização das mãos dos manipuladores", "Cumprimento geral das regras de BPHF", "Estado de limpeza e organização dos cacifos do pessoal e de trabalho"];
export const TEMPERATURE_IDS: Record<number, string[]> = { 1: ["f1-freezer-1", "f1-freezer-2"], 2: ["f2-cold-room", "f2-dispatch-freezer"] };
const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" });
const dateKeys = new Map<number, string>();
export function dayKey(value: any = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value), time = +date;
  if (Number.isNaN(time)) return "";
  const existing = dateKeys.get(time); if (existing) return existing;
  const parts = dateFormatter.formatToParts(date), values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const key = `${values.year}-${values.month}-${values.day}`;
  if (dateKeys.size > 50000) dateKeys.clear(); dateKeys.set(time, key); return key;
}
export const dayDate = (value: any = new Date()): Date => lisbonCalendarDateToUtc(dayKey(value));
export const aliveEntry = (entry: LocalRow) => !entry.payload?.deletedAt && entry.payload?.recordLifecycle?.status !== "deleted";
export const entryDay = (entry: LocalRow) => dayKey(entry.payload?.plannedDate ?? entry.payload?.actualVerificationDate ?? entry.completedAt);
export const factoryName = (db: LocalDatabase, id: number | null) => db.tables.factories.find(factory => factory.id === id)?.name ?? "Sem fábrica/linha";
export const scopeMatches = (row: LocalRow, input: LocalRow) => input.factoryId === undefined || row.factoryId === input.factoryId;
export const scopeEntries = (db: LocalDatabase, input: LocalRow = {}, operational = false) => db.tables.entries.filter(aliveEntry).filter(row => scopeMatches(row, input) && (!input.module || row.module === input.module) && (!input.modules?.length || input.modules.includes(row.module)) && (!input.result || row.result === input.result) && (!input.date || entryDay(row) === dayKey(input.date)) && (!input.startDate || (operational ? entryDay(row) : dayKey(row.completedAt)) >= dayKey(input.startDate)) && (!input.endDate || (operational ? entryDay(row) : dayKey(row.completedAt)) <= dayKey(input.endDate))).sort((a, b) => +b.completedAt - +a.completedAt);
const slot = (...parts: any[]) => JSON.stringify(parts);
const slotLabel = (value: string) => { try { return JSON.parse(value).slice(1).join(" · "); } catch { return value; } };
type CoverageIndex = { length: number; revision: number; byScope: Map<string, LocalRow[]>; byFragile: Map<number, LocalRow[]> };
const coverageIndexes = new WeakMap<LocalDatabase, CoverageIndex>();
function coverageIndex(db: LocalDatabase): CoverageIndex {
  const old = coverageIndexes.get(db); if (old && old.length === db.tables.entries.length && old.revision === db.revision) return old;
  const index: CoverageIndex = { length: db.tables.entries.length, revision: db.revision, byScope: new Map(), byFragile: new Map() };
  for (const entry of db.tables.entries) {
    if (!aliveEntry(entry)) continue;
    const key = `${entry.module}|${entry.factoryId}|${entryDay(entry)}`;
    const scoped = index.byScope.get(key) ?? []; scoped.push(entry); index.byScope.set(key, scoped);
    if (entry.module === "fragile_items" && entry.payload?.fragileItemId) { const id = entry.payload.fragileItemId, items = index.byFragile.get(id) ?? []; items.push(entry); index.byFragile.set(id, items); }
  }
  coverageIndexes.set(db, index); return index;
}
export function lastFragileInspection(db: LocalDatabase, id: number, before?: string): Date | null {
  const items = coverageIndex(db).byFragile.get(id) ?? [];
  let latest = ""; for (const item of items) { const key = entryDay(item); if ((!before || key < before) && key > latest) latest = key; }
  return latest ? dayDate(latest) : null;
}
export function buildLocalCoverage(db: LocalDatabase, task: LocalRow): string[] {
  const { module, factoryId } = task;
  if (module === "bphf") return db.tables.areas.filter(area => area.group === "bphf" && area.active !== "false" && area.factoryId === factoryId).flatMap(area => (task.bphfCriteria ?? BPHF_CRITERIA).map((criterion: string) => slot("bphf", area.name, criterion)));
  if (module === "metal_detectors") return (task.metalDetectorLines ?? db.tables.areas.filter(area => area.group === "metal" && area.factoryId === factoryId).map(area => area.name)).map((line: string) => slot("metal", line));
  if (module === "temperature_controls") return (task.temperatureEquipmentIds ?? TEMPERATURE_IDS[factoryId] ?? []).map((id: string) => slot("temperature", id));
  if (module === "suggestion_boxes") return suggestionLocationsForFactory(db.tables.factories.find(factory => factory.id === factoryId)?.code).map(location => slot("suggestion", location));
  if (module === "monthly_checklist") return db.tables.checklistItems.filter(item => item.active !== "false" && (item.factoryIds ?? [item.factoryId]).includes(factoryId)).flatMap(item => (item.areaNames ?? [item.area]).map((area: string) => slot("monthly", item.id, area)));
  if (module === "food_defense") return FOOD_DEFENSE_CRITERIA.map(criterion => slot("food_defense", criterion.id));
  if (module === "fragile_items") return db.tables.fragileItems.filter(item => item.status === "active" && item.factoryId === factoryId && isFragileInspectionPending(item.periodicity, lastFragileInspection(db, item.id, dayKey(task.dueAt)), new Date(task.dueAt))).map(item => slot("fragile", item.id));
  return [slot("submission")];
}
export function completedLocalSlots(module: string, entries: LocalRow[]): Set<string> {
  const slots = new Set<string>();
  entries.filter(aliveEntry).forEach(entry => {
    const payload = entry.payload ?? {};
    switch (module) {
      case "bphf": slots.add(slot("bphf", entry.area, payload.criterion ?? entry.title)); break;
      case "metal_detectors": slots.add(slot("metal", entry.area)); break;
      case "temperature_controls": (payload.equipment ?? []).forEach((equipment: LocalRow) => slots.add(slot("temperature", equipment.id))); break;
      case "monthly_checklist": if (payload.checklistItemId) slots.add(slot("monthly", payload.checklistItemId, entry.area)); break;
      case "food_defense": if (payload.foodDefenseCriterionId) slots.add(slot("food_defense", payload.foodDefenseCriterionId)); (payload.criteria ?? []).forEach((criterion: LocalRow) => slots.add(slot("food_defense", criterion.id))); break;
      case "fragile_items": if (payload.fragileItemId) slots.add(slot("fragile", payload.fragileItemId)); break;
      case "suggestion_boxes": slots.add(slot("suggestion", entry.area)); break;
      default: slots.add(slot("submission"));
    }
  });
  return slots;
}
export function taskProgress(db: LocalDatabase, task: LocalRow) {
  if (task.area !== "Plano do Dia") return { completed: task.status === "completed", expected: 1, done: task.status === "completed" ? 1 : 0, missing: task.status === "completed" ? [] : [task.title] };
  const entries = coverageIndex(db).byScope.get(`${task.module}|${task.factoryId}|${dayKey(task.dueAt)}`) ?? [];
  const coverage: string[] = task.plannedCoverage ?? buildLocalCoverage(db, task);
  const applicable = task.module === "fragile_items" ? coverage.filter(value => db.tables.fragileItems.some(item => item.id === JSON.parse(value)[1] && item.status === "active")) : coverage;
  const doneSlots = completedLocalSlots(task.module, entries);
  const missing = applicable.filter(value => !doneSlots.has(value));
  return { completed: missing.length === 0 && (applicable.length > 0 || ["fragile_items"].includes(task.module)), expected: applicable.length, done: applicable.length - missing.length, missing: missing.map(slotLabel) };
}
export function projectedTasks(db: LocalDatabase): LocalRow[] {
  const byId = new Map(db.tables.entries.map(entry => [entry.id, entry]));
  const reports = new Map<number, LocalRow>();
  for (const entry of db.tables.entries) if (aliveEntry(entry)) { const id = entry.payload?.taskId ?? entry.payload?.followUpTaskId; if (id && !reports.has(id)) reports.set(id, entry); }
  return db.tables.tasks.filter(task => task.status !== "cancelled").map(task => {
    const progress = taskProgress(db, task);
    const report = reports.get(task.id);
    const origin = task.sourceEntryId ? byId.get(task.sourceEntryId) : null;
    return { ...task, status: progress.completed ? "completed" : "pending", completed: progress.completed, missingVerificationCount: progress.missing.length, missingVerifications: progress.missing, qualityModule: task.area === "Plano do Dia" ? task.module : null, incidenceOrigin: origin ? { ...origin, collaboratorName: origin.payload?.collaboratorName, factoryName: factoryName(db, origin.factoryId), evidencePhotos: origin.payload?.evidencePhotos ?? [] } : null, executionReport: report ? { ...report, evidencePhotos: report.payload?.evidencePhotos ?? [] } : null };
  });
}
export function localIncidences(db: LocalDatabase, input: LocalRow = {}): LocalRow[] {
  return scopeEntries(db, input, true).filter(entry => entry.result === "NC" && !entry.payload?.sourceEntryId && !entry.payload?.mergedIntoFragileIncidenceId).map(entry => {
    const p = entry.payload ?? {};
    const generated = Boolean(p.generatedNonconformity || p.treatmentDecision === "nc_generated" || db.tables.ncs.some(nc => nc.sourceEntryId === entry.id));
    const treatment = p.incidenceTreatment ?? { status: "pending" };
    return { ...entry, occurredOn: p.incidenceOccurredOn ?? entryDay(entry), factoryName: factoryName(db, entry.factoryId), generatedNonconformity: generated, treatmentStatus: generated ? "nc_generated" : (p.treatmentDecision ?? "pending"), treatmentProgress: treatment.status, treatment, treatmentHistory: p.incidenceTreatmentHistory ?? [], incidenceRelationship: p.incidenceRelationship ?? null, followUpReviewAlerts: p.followUpReviewAlerts ?? [], nonconformityId: db.tables.ncs.find(nc => nc.sourceEntryId === entry.id)?.id ?? null, occurrenceNumber: p.nonconformityOccurrenceNumber ?? null, fragileRecurrenceHistory: p.fragileRecurrenceHistory ?? [] };
  }).filter((entry: LocalRow) => !input.collaboratorId || entry.payload?.collaboratorId === input.collaboratorId);
}
export function localDashboard(db: LocalDatabase, input: LocalRow = {}) {
  const key = dayKey(input.date);
  const tasks = projectedTasks(db).filter(task => scopeMatches(task, input));
  const today = tasks.filter(task => dayKey(task.dueAt) === key);
  const plannedControls = today.filter(task => task.area === "Plano do Dia");
  const moduleProgress: LocalRow = {}, moduleProgressByFactory: LocalRow = {};
  for (const module of MODULES) {
    const moduleTasks = plannedControls.filter(task => task.module === module.id);
    const summarize = (scoped: LocalRow[]) => {
      const values = scoped.map(task => taskProgress(db, task));
      const expected = values.reduce((sum, item) => sum + item.expected, 0), completed = values.reduce((sum, item) => sum + item.done, 0);
      return { expected, completed, registeredToday: completed, pending: values.flatMap(item => item.missing), percentage: expected ? Math.round(completed / expected * 100) : 0, lastCompletedAt: scoped.find(task => task.completed)?.completedAt };
    };
    moduleProgress[module.id] = summarize(moduleTasks);
    moduleProgressByFactory[module.id] = db.tables.factories.map(factory => { const scoped = moduleTasks.filter(task => task.factoryId === factory.id); return { factoryId: factory.id, ...summarize(scoped), pendingTaskId: scoped.find(task => !task.completed)?.id }; });
  }
  const pending = tasks.filter(task => !task.completed && dayKey(task.dueAt) <= key);
  const adHoc = tasks.filter(task => task.area !== "Plano do Dia");
  const tomorrow = new Date(dayDate(key)); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const weekEnd = new Date(dayDate(key)); weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return { tasks: adHoc.filter(task => dayKey(task.dueAt) === key).slice(0, 20), plannedControls, operationalDate: dayDate(key), taskGroups: { today: adHoc.filter(task => dayKey(task.dueAt) === key), tomorrow: adHoc.filter(task => dayKey(task.dueAt) === dayKey(tomorrow)), thisWeek: adHoc.filter(task => task.dueAt > tomorrow && task.dueAt < weekEnd) }, criticalNcs: db.tables.ncs.filter(nc => nc.severity === "critical" && nc.status !== "closed").slice(0, 6), dueActions: db.tables.actions.filter(action => action.status !== "verified" && action.dueAt < new Date()).slice(0, 6), metrics: { pending: pending.length, overdue: pending.filter(task => dayKey(task.dueAt) < key).length, criticalOpen: db.tables.ncs.filter(nc => nc.severity === "critical" && nc.status !== "closed").length, completedToday: scopeEntries(db, { ...input, date: key }).length, fragilePending: pending.filter(task => task.module === "fragile_items").length, dailyExecutionRate: today.length ? Math.round(today.filter(task => task.completed).length / today.length * 100) : 0 }, moduleProgress, moduleProgressByFactory, monthlyChecklistReminder: false, foodDefenseReminder: false };
}
const resultSummary = (entries: LocalRow[]) => ({ total: entries.length, conforming: entries.filter(entry => entry.result === "C").length, nonconforming: entries.filter(entry => entry.result === "NC").length, notApplicable: entries.filter(entry => entry.result === "N/A").length, conformity: calculateConformityRate(entries.map(entry => entry.result)) });
const completionSummary = (tasks: LocalRow[]) => { const completed = tasks.filter(task => task.completed).length; return { total: tasks.length, completed, pending: tasks.length - completed, rate: tasks.length ? Math.round(completed / tasks.length * 1000) / 10 : 0 }; };
export function localReports(db: LocalDatabase, input: LocalRow = {}) {
  if (input.startDate && input.endDate && dayKey(input.startDate) > dayKey(input.endDate)) throw new Error("A data inicial deve ser anterior à data final.");
  const detailKeys = ["orderNumber", "productName", "lot", "validity", "customer", "analysisProduct", "analysisClient", "verificationType", "line", "samplePoint", "category", "test", "equipment", "location", "state", "periodicity", "analyst", "deliveryNote", "triage", "inspectedCollaborator", "detailSearch"];
  const entries = scopeEntries(db, input).filter(entry => (!input.taskId || [entry.payload?.plannedTaskId, entry.payload?.taskId].includes(input.taskId)) && (!input.collaboratorProfileId || entry.registeredByProfileId === input.collaboratorProfileId) && detailKeys.every(key => !input[key] || JSON.stringify({ title: entry.title, area: entry.area, payload: entry.payload }).toLocaleLowerCase("pt-PT").includes(String(input[key]).toLocaleLowerCase("pt-PT"))));
  const tasks = projectedTasks(db).filter(task => scopeMatches(task, input) && (!input.startDate || dayKey(task.dueAt) >= dayKey(input.startDate)) && (!input.endDate || dayKey(task.dueAt) <= dayKey(input.endDate)));
  const modules = MODULES.map(module => { const scoped = entries.filter(entry => entry.module === module.id); return { module: module.id, total: scoped.length, conformity: calculateConformityRate(scoped.map(entry => entry.result)), nc: scoped.filter(entry => entry.result === "NC").length }; });
  const areas = Array.from(new Set(entries.map(entry => entry.area))).map(area => { const scoped = entries.filter(entry => entry.area === area); return { area, total: scoped.length, conformity: calculateConformityRate(scoped.map(entry => entry.result)) }; });
  const trends = Array.from(new Set(entries.map(entry => dayKey(entry.completedAt)))).sort().map(key => { const scoped = entries.filter(entry => dayKey(entry.completedAt) === key); return { label: key, entries: scoped.length, c: scoped.filter(entry => entry.result === "C").length, nc: scoped.filter(entry => entry.result === "NC").length }; });
  const ncs = db.tables.ncs.filter(nc => scopeMatches(nc, input) && (!input.ncStatus || nc.status === input.ncStatus));
  const end = input.endDate ? dayDate(input.endDate) : null; if (end) end.setUTCDate(end.getUTCDate() + 1);
  return { modules, areas, trends, filteredSummary: resultSummary(entries), recentEntries: entries.slice(0, 12), filteredEntries: entries, planCompliance: completionSummary(tasks).rate, openNcs: ncs.filter(nc => nc.status !== "closed").length, criticalOpen: ncs.filter(nc => nc.status !== "closed" && nc.severity === "critical").length, dispatchOrders: entries.filter(entry => entry.module === "dispatch_control").map(entry => ({ orderNumber: entry.payload?.orderNumber ?? entry.title, customer: entry.payload?.customer ?? null, result: entry.result, completedAt: entry.completedAt })), filters: { ...Object.fromEntries([...detailKeys, "module", "result", "ncStatus", "taskId"].map(key => [key, input[key] ?? null])), startDate: input.startDate ? dayDate(input.startDate) : null, endDate: end }, taskOptions: tasks.filter(task => task.area !== "Plano do Dia").map(task => ({ id: task.id, title: task.title, module: task.module, dueAt: task.dueAt })) };
}
export function localAnalytics(db: LocalDatabase, input: LocalRow = {}) {
  let start = dayDate(input.referenceDate), end = new Date(start); const period = input.period ?? "day";
  if (period === "week") { start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7); end = new Date(start); end.setUTCDate(end.getUTCDate() + 6); }
  if (period === "month") { start.setUTCDate(1); end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)); }
  if (input.startDate && input.endDate) { start = dayDate(input.startDate); end = dayDate(input.endDate); }
  const scoped = { startDate: start, endDate: end }, entries = scopeEntries(db, scoped);
  const tasks = projectedTasks(db).filter(task => dayKey(task.dueAt) >= dayKey(start) && dayKey(task.dueAt) <= dayKey(end));
  const incidences = localIncidences(db, scoped), generated = incidences.filter(entry => entry.generatedNonconformity), ncs = db.tables.ncs.filter(nc => dayKey(nc.detectedAt) >= dayKey(start) && dayKey(nc.detectedAt) <= dayKey(end));
  const activityByTechnician = Array.from(new Set(entries.map(entry => entry.registeredByProfileId))).map(profileId => { const scoped = entries.filter(entry => entry.registeredByProfileId === profileId); const stats = resultSummary(scoped); return { profileId, name: scoped[0]?.registeredByName ?? "Sem técnico", title: scoped[0]?.registeredByTitle ?? null, ...stats, incidences: scoped.filter(entry => entry.result === "NC").length, generatedNonconformities: generated.filter(entry => entry.registeredByProfileId === profileId).length }; });
  const activityTrend: LocalRow[] = [];
  for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) { const key = dayKey(date); const dayTasks = tasks.filter(task => dayKey(task.dueAt) === key); activityTrend.push({ label: key, registrations: entries.filter(entry => dayKey(entry.completedAt) === key).length, incidences: incidences.filter(entry => entry.occurredOn === key).length, generatedNonconformities: generated.filter(entry => entry.occurredOn === key).length, completedTasks: dayTasks.filter(task => task.completed).length, plannedTasks: dayTasks.length }); if (activityTrend.length > 3660) throw new Error("Selecione um intervalo de até dez anos."); }
  const periodEnd = new Date(end); periodEnd.setUTCDate(periodEnd.getUTCDate() + 1);
  return { period, periodStart: start, periodEnd, completion: completionSummary(tasks), completionByFactory: [...db.tables.factories, ...(tasks.some(task => task.factoryId === null) ? [{ id: null, name: "Controlos transversais" }] : [])].map(factory => ({ factoryId: factory.id, label: factory.name, ...completionSummary(tasks.filter(task => task.factoryId === factory.id)) })), completionByControl: Array.from(new Set(tasks.map(task => task.module))).map(module => ({ module, ...completionSummary(tasks.filter(task => task.module === module)), ...resultSummary(entries.filter(entry => entry.module === module)), registrations: entries.filter(entry => entry.module === module).length })), results: resultSummary(entries), incidences: { total: incidences.length, byTreatment: ["pending", "in_progress", "completed"].map(status => ({ status, total: incidences.filter(entry => entry.treatmentProgress === status).length })), byDecision: ["pending", "no_nc", "nc_generated"].map(status => ({ status, total: incidences.filter(entry => entry.treatmentStatus === status).length })), nonconformities: { total: generated.length + ncs.filter(nc => !incidences.some(entry => entry.id === nc.sourceEntryId)).length, byStatus: ["open", "in_progress", "awaiting_validation", "closed"].map(status => ({ status, total: ncs.filter(nc => nc.status === status).length })), bySeverity: ["critical", "high", "medium", "low"].map(severity => ({ severity, total: ncs.filter(nc => nc.severity === severity).length })) } }, activityByTechnician, activityTrend, factories: db.tables.factories };
}
export function fragileLocalItems(db: LocalDatabase, input: LocalRow = {}, pendingOnly = false): LocalRow[] {
  const reference = input.referenceDate ? new Date(input.referenceDate) : new Date();
  const planned = input.plannedTaskId ? db.tables.tasks.find(task => task.id === input.plannedTaskId) : null;
  return db.tables.fragileItems.filter(item => item.status === "active" && scopeMatches(item, input) && (!input.periodicity || item.periodicity === input.periodicity)).map(item => {
    const lastInspectionAt = lastFragileInspection(db, item.id), dueAt = fragileInspectionDueDate(item.periodicity, lastInspectionAt, reference);
    const completedForPlannedTask = Boolean(planned && db.tables.entries.some(entry => aliveEntry(entry) && entry.payload?.fragileItemId === item.id && entryDay(entry) === dayKey(planned.dueAt)));
    return { ...item, lastInspectionAt, nextInspectionAt: dueAt, dueAt, completedForPlannedTask, delayDays: Math.max(0, Math.floor((+reference - +dueAt) / 86400000)) };
  }).filter((item: LocalRow) => !pendingOnly || (!item.completedForPlannedTask && isFragileInspectionPending(item.periodicity, item.lastInspectionAt, reference)));
}
