import { resolveLocalMediaValue } from "./localMediaStorage";
import { observable } from "@trpc/server/observable";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";
import { QUALITY_PANEL_KEYS, QUALITY_EXTERNAL_PANEL_KEYS, hasQualityPanelAccess, panelsForQualityPath } from "@shared/quality-panel-access";
import { calculateSensoryScore, calculateDispatchConformity, isBusinessDay } from "../../../server/quality.logic";
import { getDispatchProfile } from "@shared/dispatch-control";
import { MONTHLY_CHECKLIST_TEMPLATE } from "./localChecklistTemplate";
import { MODULES } from "./quality";
import { LOCAL_SESSION_KEY, activeLocalProfile, publicLocalProfile, localPinDigest, insertLocalRow, requireLocalRow, type LocalRow, type LocalDatabase } from "./localDatabase";
import { BPHF_CRITERIA, TEMPERATURE_IDS, dayDate, dayKey, entryDay, aliveEntry, scopeEntries, scopeMatches, buildLocalCoverage, projectedTasks, localDashboard, localIncidences, localReports, localAnalytics, fragileLocalItems, taskProgress, factoryName } from "./localQualityLogic";
import { loadPersistentDatabase, persistDatabase } from "./localPersistence";
import { createLocalArchive, archiveHistory, archiveAttention } from "./localArchives";

const titles: Record<string, string> = { technician: "Tec. Qualidade", manager: "Resp. Qualidade", viewer: "Consulta" };
const publicMethods = new Set(["accessStatus", "configureTeamPins", "activatePinProfile", "deactivatePinProfile"]);
const managerMutations = new Set(["createPinProfile", "updatePinProfileAccess", "updatePinProfilePanels", "publishDailyPlan", "addBphfPlanAddendum", "createTask", "updateTask", "deleteTask", "createIncidenceFollowUpTask", "applyIncidenceGroupTreatment", "deleteIncidence", "createIncidenceTheme", "updateIncidenceTheme", "deactivateIncidenceTheme", "mergeIncidenceThemes", "createBphfInspectionEmployee", "updateBphfInspectionEmployee", "deleteBphfInspectionEmployee", "mergeBphfInspectionEmployees", "addChecklistArea", "updateChecklistArea", "removeChecklistArea", "addChecklistItem", "updateChecklistItem", "removeChecklistItem", "initializeChecklist", "createDispatchOrder", "generateDailyReportArchiveBackup", "generateMissingDailyReportArchiveBackups", "createManualDailyReportArchive"]);
const tableQueries: Record<string, string> = { listFactories: "factories", listAreas: "areas", listPlans: "tasks", listNcs: "ncs", listActions: "actions", listEvidences: "evidences", listBphfInspectionEmployees: "employees", listBphfInspectionEmployeesAdmin: "employees", listBphfEmployeeMerges: "employeeMerges", listIncidenceThemes: "themes", listIncidenceThemeMerges: "themeMerges", listFragileAreas: "fragileAreas", listChecklistAreas: "checklistAreas", listChecklistItems: "checklistItems", listDispatchOrders: "dispatchOrders", listIncidenceAiGuidance: "guidance" };
const crudCreate: Record<string, string> = { addArea: "areas", addPlan: "tasks", createBphfInspectionEmployee: "employees", addBphfInspectionEmployee: "employees", addFragileItem: "fragileItems", createFragileArea: "fragileAreas", addChecklistArea: "checklistAreas", addChecklistItem: "checklistItems", createDispatchOrder: "dispatchOrders", createNonconformity: "ncs", addCorrectiveAction: "actions", uploadEvidence: "evidences" };
const crudUpdate: Record<string, string> = { updateBphfInspectionEmployee: "employees", updateFragileItem: "fragileItems", updateChecklistArea: "checklistAreas", updateChecklistItem: "checklistItems", updateTask: "tasks", updateNc: "ncs", completeAction: "actions" };
const crudDelete: Record<string, string> = { deleteBphfInspectionEmployee: "employees", deleteFragileItem: "fragileItems", deleteFragileArea: "fragileAreas", removeChecklistArea: "checklistAreas", removeChecklistItem: "checklistItems", deleteTask: "tasks" };
function distinctName(db: LocalDatabase, table: string, name: string, id?: number) {
  if (!name?.trim()) throw new Error("Introduza uma designação.");
  if (db.tables[table].some(row => row.id !== id && row.name?.trim().toLocaleLowerCase("pt-PT") === name.trim().toLocaleLowerCase("pt-PT") && row.active !== "false")) throw new Error("Já existe um registo com esta designação.");
}
function historyEvent(profile: LocalRow, changes: LocalRow) { return { ...changes, changedAt: new Date().toISOString(), registeredAt: new Date().toISOString(), registeredByProfileId: profile.id, registeredByName: profile.name, registeredByTitle: profile.title }; }
function setTreatment(entry: LocalRow, input: LocalRow, profile: LocalRow) {
  entry.payload ??= {};
  const p = entry.payload;
  if (input.generatedNonconformity !== undefined) { p.generatedNonconformity = input.generatedNonconformity; p.treatmentDecision = input.generatedNonconformity ? "nc_generated" : "no_nc"; }
  if (input.occurrenceNumber !== undefined) p.nonconformityOccurrenceNumber = input.occurrenceNumber;
  if (input.treatment) { p.incidenceTreatmentHistory = [...(p.incidenceTreatmentHistory ?? []), historyEvent(profile, { decision: p.treatmentDecision ?? "pending", treatment: input.treatment, previousTreatment: p.incidenceTreatment ?? null })]; p.incidenceTreatment = input.treatment; }
  if (input.fragileTreatmentReview) p.fragileTreatmentReview = input.fragileTreatmentReview;
  if (input.treatment) p.followUpReviewAlerts = (p.followUpReviewAlerts ?? []).map((alert: LocalRow) => ({ ...alert, reviewedAt: new Date().toISOString(), reviewedByName: profile.name }));
}
function createTask(db: LocalDatabase, input: LocalRow, extras: LocalRow = {}) {
  const dueAt = input.dueAt ? new Date(input.dueAt) : dayDate(input.date);
  if (Number.isNaN(+dueAt) || !isBusinessDay(dueAt)) throw new Error("Selecione uma data válida num dia útil.");
  const ids = input.assigneeProfileIds ?? [];
  if (!ids.length || ids.some((id: number) => !db.tables.profiles.some(profile => profile.id === id && profile.active))) throw new Error("Selecione utilizadores ativos para a tarefa.");
  const task = insertLocalRow(db, "tasks", { module: "bphf", area: "Sem área", factoryId: input.factoryId ?? null, description: null, sourceEntryId: null, parentTaskId: null, planRevision: 1, plannedCoverage: null, completedAt: null, ...input, ...extras, dueAt, assigneeProfileIds: ids, responsible: db.tables.profiles.filter(profile => ids.includes(profile.id)).map(profile => profile.name).join(", "), status: "pending" });
  if (task.area === "Plano do Dia") task.plannedCoverage = buildLocalCoverage(db, task);
  return task;
}
function verificationKey(entry: LocalRow) {
  const p = entry.payload ?? {};
  return [entry.module, entry.factoryId, p.fragileItemId ?? p.collaboratorId ?? p.equipmentId ?? entry.area, p.criterion ?? "", p.product ?? p.productName ?? "", p.lot ?? ""].join("|");
}
function createEntry(db: LocalDatabase, input: LocalRow, profile: LocalRow) {
  const task = input.plannedTaskId ? requireLocalRow(db, "tasks", input.plannedTaskId) : null;
  if (task && (task.status === "cancelled" || task.module !== input.module || task.factoryId !== (input.factoryId ?? null))) throw new Error("O plano selecionado não corresponde ao controlo/fábrica.");
  if (task && profile.role !== "manager" && !task.assigneeProfileIds.includes(profile.id)) throw new Error("Este controlo não está atribuído ao seu perfil.");
  if (input.module !== "not_applicable" && !task && !input.manualIncidence) throw new Error("Publique ou selecione o Plano do Dia para registar este controlo.");
  const operational = input.incidenceOccurredOn ?? input.performedAt ?? (task ? dayKey(task.dueAt) : dayKey());
  const origin = task?.sourceEntryId ? requireLocalRow(db, "entries", task.sourceEntryId) : null;
  const payload = { ...(input.payload ?? {}), plannedTaskId: task?.id ?? null, plannedDate: task ? dayDate(task.dueAt).toISOString() : dayDate(operational).toISOString(), actualVerificationDate: operational, ...(origin ? { sourceEntryId: origin.id, collaboratorId: origin.payload?.collaboratorId, collaboratorName: origin.payload?.collaboratorName, followUpTaskId: task!.id, taskId: task!.id } : {}) };
  let result = input.result ?? "C";
  if (input.module === "sensory" && payload.scores) { const score = calculateSensoryScore(payload.scores); Object.assign(payload, score); result = score.percentage >= 70 ? "C" : "NC"; }
  const entry = insertLocalRow(db, "entries", { module: input.module, title: input.title, area: input.area, factoryId: input.factoryId ?? null, result, notes: input.notes ?? "", payload, completedAt: dayDate(operational), registeredByProfileId: profile.id, registeredByName: profile.name, registeredByTitle: profile.title, offlineSyncId: input.offlineSyncId ?? null });
  if (input.module === "fragile_items") {
    payload.state = result === "C" ? "Íntegro" : payload.state ?? "Danificado";
    const duplicate = db.tables.entries.find(other => other.id !== entry.id && aliveEntry(other) && other.module === "fragile_items" && other.factoryId === entry.factoryId && other.payload?.fragileItemId === payload.fragileItemId && entryDay(other) === entryDay(entry));
    if (duplicate) { db.tables.entries.pop(); throw new Error("Este ponto já tem uma verificação nesta data. Edite o registo existente."); }
    const existing = localIncidences(db).find(other => other.id !== entry.id && other.module === "fragile_items" && other.factoryId === entry.factoryId && other.payload?.fragileItemId === payload.fragileItemId && !other.generatedNonconformity && other.treatmentProgress !== "completed");
    if (result === "NC" && existing) { const row = requireLocalRow(db, "entries", existing.id); row.payload.fragileRecurrenceHistory = [...(row.payload.fragileRecurrenceHistory ?? []), { controlEntryId: entry.id, operationalDate: entryDay(entry), notes: entry.notes, result, registeredByName: profile.name }]; payload.mergedIntoFragileIncidenceId = row.id; }
  }
  const matchingTasks = db.tables.tasks.filter(other => other.module === entry.module && other.factoryId === entry.factoryId && dayKey(other.dueAt) === entryDay(entry) && other.status !== "cancelled");
  for (const candidate of matchingTasks) {
    const source = candidate.sourceEntryId ? db.tables.entries.find(other => other.id === candidate.sourceEntryId) : null;
    const coversFollowUp = source && verificationKey(source) === verificationKey(entry);
    if (candidate.id === task?.id && candidate.sourceEntryId || coversFollowUp) { candidate.status = "completed"; candidate.completedAt = new Date(); if (source) { source.payload.followUpReviewAlerts = [...(source.payload.followUpReviewAlerts ?? []), { followUpTaskId: candidate.id, result, notes: entry.notes, completedAt: new Date().toISOString(), registeredByProfileId: profile.id, registeredByName: profile.name, registeredByTitle: profile.title }]; } }
    else if (candidate.area === "Plano do Dia" && taskProgress(db, candidate).completed) { candidate.status = "completed"; candidate.completedAt = new Date(); }
  }
  return entry;
}
function previewMerge(db: LocalDatabase, table: string, sourceId: number, targetId: number) {
  if (sourceId === targetId) throw new Error("Selecione dois registos diferentes.");
  const source = requireLocalRow(db, table, sourceId), target = requireLocalRow(db, table, targetId);
  const affected = db.tables.entries.filter(entry => table === "themes" ? entry.payload?.incidenceTheme === source.name || entry.payload?.incidenceRelationship?.label === source.name : entry.payload?.collaboratorId === source.id);
  return { source: { id: source.id, name: source.name }, target: { id: target.id, name: target.name }, affectedEntries: affected.length, byModule: Array.from(new Set(affected.map(entry => entry.module))).map(module => ({ module, total: affected.filter(entry => entry.module === module).length })), sample: affected.slice(0, 8).map(entry => ({ id: entry.id, module: entry.module, title: entry.title, completedAt: entry.completedAt })) };
}

async function handleLocal(db: LocalDatabase, path: string, input: LocalRow, type: string): Promise<any> {
  if (path === "auth.me") return { id: 1, name: "QualiControl local", role: "admin", openId: "local-only" };
  if (path === "auth.logout") { sessionStorage.removeItem(LOCAL_SESSION_KEY); return { success: true }; }
  if (!path.startsWith("quality.")) throw new Error("Este painel não integra a versão local do QualiControl.");
  const method = path.slice(8), profile = activeLocalProfile(db);
  if (!publicMethods.has(method)) {
    if (!profile) throw new Error("Selecione o seu perfil e introduza o PIN.");
    if (type === "mutation" && profile.role === "viewer") throw new Error("O perfil de consulta não pode alterar dados.");
    if (managerMutations.has(method) && profile.role !== "manager") throw new Error("Esta operação é exclusiva da Responsável de Qualidade.");
    const panel = method.includes("Incidence") || method.includes("Incidenc") ? "incidents" : method.includes("Archive") ? "backups" : method === "reports" ? "reports" : method === "operationalAnalytics" ? "analytics" : null;
    if (panel && !hasQualityPanelAccess(profile.role, profile.panelAccess, panel)) throw new Error("O seu perfil não tem autorização para este painel.");
  }
  if (method === "accessStatus") return { profiles: db.tables.profiles.map(publicLocalProfile), activeProfile: profile ? publicLocalProfile(profile) : null, canManage: profile?.role === "manager", canBootstrap: !db.tables.profiles.some(profile => profile.pinHash), needsInitialSetup: !db.tables.profiles.some(profile => profile.pinHash), hasPlatformSession: true };
  if (method === "configureTeamPins") {
    if (db.tables.profiles.some(profile => profile.pinHash) && profile?.role !== "manager") throw new Error("Apenas a Responsável pode alterar PINs.");
    for (const item of input.pins ?? []) { const row = db.tables.profiles.find(profile => profile.code === item.code); if (!row) throw new Error("Perfil inexistente."); row.pinSalt = crypto.randomUUID(); row.pinHash = await localPinDigest(item.pin, row.pinSalt); }
    return { success: true };
  }
  if (method === "activatePinProfile") {
    const row = requireLocalRow(db, "profiles", input.profileId);
    if (!row.active || !row.pinHash || await localPinDigest(input.pin, row.pinSalt) !== row.pinHash) throw new Error("PIN incorreto ou perfil desativado.");
    sessionStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ profileId: row.id, expiresAt: Date.now() + 10 * 3600000 }));
    return { success: true, profile: publicLocalProfile(row) };
  }
  if (method === "deactivatePinProfile") { sessionStorage.removeItem(LOCAL_SESSION_KEY); return { success: true }; }
  if (method === "metadata") return { factories: db.tables.factories, areas: db.tables.areas.filter(row => row.active !== "false"), collaborators: db.tables.profiles.filter(row => row.active).map(publicLocalProfile), modules: MODULES.map(module => ({ id: module.id, label: module.label })) };
  if (method === "createPinProfile") { distinctName(db, "profiles", input.name); const salt = crypto.randomUUID(); const row = insertLocalRow(db, "profiles", { ...input, pin: undefined, code: `USR_${crypto.randomUUID()}`, title: titles[input.role], active: true, pinSalt: salt, pinHash: await localPinDigest(input.pin, salt), panelAccess: input.role === "manager" ? QUALITY_PANEL_KEYS : input.allowedPanels, externalPanelAccess: input.role === "manager" ? QUALITY_EXTERNAL_PANEL_KEYS : input.allowedExternalPanels }); return publicLocalProfile(row); }
  if (["updatePinProfileAccess", "updatePinProfilePanels"].includes(method)) {
    const row = requireLocalRow(db, "profiles", input.profileId);
    if ((input.role && input.role !== "manager" || input.active === false) && row.role === "manager" && db.tables.profiles.filter(other => other.role === "manager" && other.active).length === 1) throw new Error("É necessário manter pelo menos um Responsável de Qualidade ativo.");
    Object.assign(row, input, { panelAccess: input.allowedPanels ?? row.panelAccess, externalPanelAccess: input.allowedExternalPanels ?? row.externalPanelAccess, title: titles[input.role ?? row.role] }); return { success: true };
  }
  if (tableQueries[method]) {
    return db.tables[tableQueries[method]].filter(row => (method.endsWith("Admin") || method === "listIncidenceThemes" || row.active !== "false") && (method === "listChecklistItems" ? true : scopeMatches(row, input)) && (!input.operationalDate || dayKey(row.operationalDate) === input.operationalDate) && (!input.factoryId || method !== "listChecklistItems" || (row.factoryIds ?? [row.factoryId]).includes(input.factoryId)));
  }
  if (method === "dashboard") return localDashboard(db, input);
  if (method === "listTasks") return projectedTasks(db).filter(task => scopeMatches(task, input));
  if (method === "reports") return localReports(db, input);
  if (method === "operationalAnalytics") return localAnalytics(db, input);
  if (method === "listIncidences") return localIncidences(db, input);
  if (method === "controlAuthorization") {
    const tasks = projectedTasks(db).filter(task => task.area === "Plano do Dia" && task.module === input.module && task.factoryId === (input.factoryId ?? null));
    const task = input.plannedTaskId ? tasks.find(task => task.id === input.plannedTaskId) : input.plannedDate ? tasks.find(task => dayKey(task.dueAt) === dayKey(input.plannedDate)) : tasks.find(task => dayKey(task.dueAt) === dayKey()) ?? tasks.filter(task => !task.completed && dayKey(task.dueAt) < dayKey()).at(-1);
    const allowed = Boolean(task && (profile!.role === "manager" || task.assigneeProfileIds.includes(profile!.id)) && (!input.plannedDate || dayKey(task.dueAt) === dayKey(input.plannedDate)) && profile!.role !== "viewer");
    const siblings = task ? tasks.filter(other => dayKey(other.dueAt) === dayKey(task.dueAt)) : [];
    return { allowed, reason: allowed ? "Controlo publicado no Plano do Dia local." : "Publique o plano ou confirme a atribuição ao seu perfil.", taskId: task?.id ?? null, assignedTo: task?.responsible ?? null, dueAt: task?.dueAt ?? null, bphfCriteria: task?.module === "bphf" ? Array.from(new Set(siblings.flatMap(other => other.bphfCriteria ?? BPHF_CRITERIA))) : null, bphfCriterionTaskIds: Object.fromEntries(siblings.flatMap(other => (other.bphfCriteria ?? []).map((criterion: string) => [criterion, other.id]))), metalDetectorLines: task?.metalDetectorLines ?? null, isPreviousPending: Boolean(task && dayKey(task.dueAt) < dayKey()), isFuturePlanned: Boolean(task && dayKey(task.dueAt) > dayKey()) };
  }
  if (method === "pendingControlTasks") return projectedTasks(db).filter(task => !task.completed && task.module === input.module && scopeMatches(task, input) && dayKey(task.dueAt) <= dayKey() && (task.sourceEntryId || task.area === "Plano do Dia" && dayKey(task.dueAt) < dayKey()) && (profile!.role === "manager" || task.assigneeProfileIds.includes(profile!.id))).map(task => ({ ...task, isFollowUp: Boolean(task.sourceEntryId) }));
  if (method === "dailyControlResults") return { operationalDate: new Date(input.operationalDate), entries: scopeEntries(db, { module: input.module, factoryId: input.factoryId }).filter(entry => dayKey(entry.payload?.plannedDate ?? entry.completedAt) === dayKey(input.operationalDate)) };
  if (method === "controlObservations") return scopeEntries(db, input).filter(entry => entry.notes?.trim());
  if (method === "createTask") return { success: true, id: createTask(db, input).id };
  if (method === "publishDailyPlan") {
    let created = 0, alreadyPresent = 0; const dates = input.dates?.length ? input.dates : [input.date];
    for (const date of dates) for (const module of input.modules) {
      const factories = ["internal_analysis", "dispatch_control"].includes(module) ? [null] : input.factoryIds;
      for (const factoryId of factories) {
        if (db.tables.tasks.some(task => task.area === "Plano do Dia" && task.status !== "cancelled" && task.module === module && task.factoryId === factoryId && dayKey(task.dueAt) === dayKey(date))) { alreadyPresent++; continue; }
        createTask(db, { ...input, dueAt: date, factoryId }, { module, area: "Plano do Dia", title: `Plano do Dia — ${MODULES.find(item => item.id === module)?.label ?? module}`, bphfCriteria: module === "bphf" ? input.bphfCriteria ?? BPHF_CRITERIA : null, metalDetectorLines: module === "metal_detectors" ? input.metalDetectorLinesByFactory?.[factoryId] : null, temperatureEquipmentIds: module === "temperature_controls" ? TEMPERATURE_IDS[factoryId] ?? [] : null }); created++;
      }
    }
    return { success: true, created, alreadyPresent, addendaCreated: 0, dates: dates.map((date: Date) => ({ date, created, alreadyPresent })) };
  }
  if (method === "addBphfPlanAddendum") {
    const parent = requireLocalRow(db, "tasks", input.parentTaskId ?? input.taskId);
    const added = (input.bphfCriteria ?? []).filter((criterion: string) => !(parent.bphfCriteria ?? []).includes(criterion));
    if (!added.length) throw new Error("Os critérios selecionados já constam do plano.");
    const child = createTask(db, { ...parent, dueAt: parent.dueAt, assigneeProfileIds: input.assigneeProfileIds ?? parent.assigneeProfileIds }, { parentTaskId: parent.id, planRevision: (parent.planRevision ?? 1) + 1, bphfCriteria: added });
    return { success: true, created: 1, id: child.id };
  }
  if (method === "createEntry") { const entry = createEntry(db, input, profile!); return { success: true, id: entry.id, critical: entry.module === "metal_detectors" && entry.result === "NC", incidence: entry.result === "NC" }; }
  if (method === "updateControlEntry") {
    const row = requireLocalRow(db, "entries", input.id); if (profile!.role !== "manager" && row.registeredByProfileId !== profile!.id) throw new Error("Só o autor ou a Responsável pode editar esta verificação.");
    row.payload ??= {}; row.payload.editHistory = [...(row.payload.editHistory ?? []), historyEvent(profile!, { previous: { title: row.title, result: row.result, factoryId: row.factoryId, notes: row.notes } })];
    for (const key of ["title", "area", "result", "notes", "factoryId"]) if (input[key] !== undefined) row[key] = input[key];
    for (const key of ["productName", "lot", "validity", "collaboratorId"]) if (input[key] !== undefined) row.payload[key] = input[key];
    if (row.module === "fragile_items") row.payload.state = row.result === "C" ? "Íntegro" : input.fragileState ?? "Danificado";
    if (input.collaboratorId) row.payload.collaboratorName = requireLocalRow(db, "employees", input.collaboratorId).name;
    if (input.fragileEvidencePhotos) row.payload.evidencePhotos = input.fragileEvidencePhotos;
    row.updatedAt = new Date(); return { success: true };
  }
  if (method === "deleteControlEntry" || method === "deleteIncidence") {
    const row = requireLocalRow(db, "entries", input.id); if (profile!.role !== "manager" && row.registeredByProfileId !== profile!.id) throw new Error("Só o autor ou a Responsável pode eliminar este registo.");
    row.payload ??= {}; if (method === "deleteControlEntry") row.payload.recordLifecycle = { status: "deleted", deletedAt: new Date().toISOString(), deletedByName: profile!.name }; else row.payload.deletedAt = new Date().toISOString(); return { success: true };
  }
  if (method === "updateIncidence") {
    const row = requireLocalRow(db, "entries", input.id); setTreatment(row, input, profile!);
    for (const key of ["title", "area", "notes"]) if (input[key] !== undefined) row[key] = input[key];
    if (input.evidencePhotos) row.payload.evidencePhotos = input.evidencePhotos;
    if (input.occurredOn) row.payload.incidenceOccurredOn = input.occurredOn;
    if (input.collaboratorId !== undefined) { row.payload.collaboratorId = input.collaboratorId; row.payload.collaboratorName = input.collaboratorId ? requireLocalRow(db, "employees", input.collaboratorId).name : null; }
    return { success: true };
  }
  if (method === "applyIncidenceGroupTreatment") {
    const groups = new Map<string, string>();
    for (const id of input.incidenceIds) {
      const row = requireLocalRow(db, "entries", id); row.payload ??= {};
      const assignment = (input.assignments ?? []).find((item: LocalRow) => item.incidenceId === id);
      const label = assignment?.relationshipLabel ?? assignment?.label ?? assignment?.groupLabel;
      if (label) { if (!groups.has(label)) groups.set(label, crypto.randomUUID()); row.payload.incidenceTheme = label; row.payload.incidenceRelationship = { groupId: groups.get(label), label, classifiedAt: new Date().toISOString(), classifiedByName: profile!.name }; if (!db.tables.themes.some(theme => theme.name === label)) insertLocalRow(db, "themes", { name: label, active: "true", description: null }); }
      setTreatment(row, { generatedNonconformity: input.decision === "nc_generated" ? true : input.decision === "no_nc" ? false : undefined, treatment: input.treatment, occurrenceNumber: input.occurrenceNumber }, profile!);
    }
    return { success: true, updatedCount: input.incidenceIds.length, relationshipGroups: Array.from(groups.entries()).map(([label, groupId]) => ({ label, groupId })) };
  }
  if (method === "createIncidenceFollowUpTask") { const source = requireLocalRow(db, "entries", input.sourceEntryId); return { success: true, id: createTask(db, input, { sourceEntryId: source.id, module: source.module, factoryId: source.factoryId, area: source.area, description: `${input.description}\nColaborador: ${source.payload?.collaboratorName ?? "Não aplicável"}` }).id }; }
  if (method === "listIncidenceFollowUpTasks") return projectedTasks(db).filter(task => task.sourceEntryId === input.sourceEntryId);
  if (method === "findCoincidentFollowUpTask") { const source = requireLocalRow(db, "entries", input.sourceEntryId); const task = db.tables.tasks.find(task => task.module === source.module && task.factoryId === source.factoryId && dayKey(task.dueAt) === dayKey(input.dueAt) && task.status !== "cancelled"); return { coincident: Boolean(task), task: task ?? null }; }
  if (method === "completeTask") {
    const task = requireLocalRow(db, "tasks", input.id);
    if (profile!.role !== "manager" && !task.assigneeProfileIds.includes(profile!.id)) throw new Error("Esta tarefa não está atribuída ao seu perfil.");
    createEntry(db, { module: task.module, title: task.title, area: task.area, factoryId: task.factoryId, result: input.result, notes: input.notes, plannedTaskId: task.id, payload: { taskId: task.id, evidencePhotos: input.evidencePhotos ?? [] } }, profile!);
    task.status = "completed"; task.completedAt = new Date(); task.completedByName = profile!.name; return { success: true, followUpCompleted: Boolean(task.sourceEntryId), incidenceReviewRequired: Boolean(task.sourceEntryId) };
  }
  if (method === "incidenceVerificationHistory" || method === "fragileInspectionHistory" || method === "listBphfCollaboratorInspections") {
    const source = input.sourceEntryId ? requireLocalRow(db, "entries", input.sourceEntryId) : null;
    return db.tables.entries.filter(aliveEntry).filter(row => source ? verificationKey(row) === verificationKey(source) || row.payload?.sourceEntryId === source.id : input.fragileItemId ? row.payload?.fragileItemId === input.fragileItemId : row.payload?.collaboratorId === (input.collaboratorId ?? input.employeeId)).sort((a, b) => +b.completedAt - +a.completedAt).map(row => ({ ...row, operationalDate: entryDay(row), state: row.payload?.state ?? null, evidencePhotos: row.payload?.evidencePhotos ?? [], isSourceVerification: row.id === source?.id, isFollowUpVerification: Boolean(row.payload?.sourceEntryId), followUpTaskId: row.payload?.followUpTaskId ?? null }));
  }
  if (method === "listFragileItems" || method === "fragilePending") return fragileLocalItems(db, input, method === "fragilePending");
  if (method === "temperatureHistory") return scopeEntries(db, { ...input, module: "temperature_controls" }).flatMap(entry => (entry.payload?.equipment ?? []).map((equipment: LocalRow) => ({ ...equipment, completedAt: entry.completedAt, operationalDate: entryDay(entry), registeredByName: entry.registeredByName, notes: entry.notes })));
  if (method === "monthlyChecklistProgress") return db.tables.factories.map(factory => { const items = db.tables.checklistItems.filter(item => item.active !== "false" && (item.factoryIds ?? []).includes(factory.id)); const areas = Array.from(new Set(items.flatMap(item => item.areaNames ?? [item.area]))).map(areaName => { const checks = items.filter(item => (item.areaNames ?? [item.area]).includes(areaName)); const completed = checks.filter(item => db.tables.entries.some(entry => aliveEntry(entry) && entry.factoryId === factory.id && entry.payload?.checklistItemId === item.id && entry.area === areaName && entryDay(entry).slice(0, 7) === dayKey().slice(0, 7))).length; return { areaName, total: checks.length, completed, minimumMet: completed > 0 }; }); const completed = areas.filter(area => area.minimumMet).length; return { factoryId: factory.id, factoryName: factory.name, total: areas.length, completed, percentage: areas.length ? Math.round(completed / areas.length * 100) : 0, areas }; });
  if (method === "initializeChecklist") { let created = 0; if (!db.tables.checklistAreas.some(area => area.name === "Geral")) insertLocalRow(db, "checklistAreas", { name: "Geral", active: "true", factoryIds: [1, 2, 3] }); for (const label of MONTHLY_CHECKLIST_TEMPLATE) if (!db.tables.checklistItems.some(item => item.label === label)) { insertLocalRow(db, "checklistItems", { label, area: "Geral", areaNames: ["Geral"], factoryIds: [1, 2, 3], active: "true", sortOrder: created++ }); } return { success: true, created }; }
  if (["dailyIncidenceSummary", "dailyIncidences"].includes(method)) {
    const incidences = localIncidences(db, { ...input, date: input.date ?? input.referenceDate }); const withNonconformity = incidences.filter(entry => entry.generatedNonconformity).length;
    return { date: dayDate(input.date), total: incidences.length, withNonconformity, withoutNonconformity: incidences.length - withNonconformity, pendingTreatment: incidences.filter(entry => entry.treatmentStatus === "pending").length, incidences, byFactory: db.tables.factories.map(factory => ({ factoryName: factory.name, total: incidences.filter(entry => entry.factoryId === factory.id).length })), note: db.tables.notes.find(note => dayKey(note.referenceDate) === dayKey(input.date) && note.factoryId === (input.factoryId ?? 0))?.note ?? "" };
  }
  if (method === "saveDailyIncidenceNote") { const row = db.tables.notes.find(note => dayKey(note.referenceDate) === dayKey(input.date) && note.factoryId === (input.factoryId ?? 0)); if (row) row.note = input.note; else insertLocalRow(db, "notes", { ...input, referenceDate: dayDate(input.date), factoryId: input.factoryId ?? 0 }); return { success: true }; }
  if (["createIncidenceTheme", "updateIncidenceTheme"].includes(method)) {
    distinctName(db, "themes", input.name, input.id); const old = input.id ? requireLocalRow(db, "themes", input.id) : null;
    if (old && old.name !== input.name) for (const entry of db.tables.entries) if (entry.payload?.incidenceTheme === old.name) { entry.payload.incidenceThemeHistory = [...(entry.payload.incidenceThemeHistory ?? []), historyEvent(profile!, { oldTheme: old.name, newTheme: input.name })]; entry.payload.incidenceTheme = input.name; if (entry.payload.incidenceRelationship?.label === old.name) entry.payload.incidenceRelationship.label = input.name; }
    const row = old ?? insertLocalRow(db, "themes", {}); Object.assign(row, { name: input.name.trim(), description: input.description ?? null, active: input.active ?? "true", updatedAt: new Date() }); return { success: true, id: row.id };
  }
  if (method === "deactivateIncidenceTheme") { requireLocalRow(db, "themes", input.id).active = input.active === "true" ? "true" : "false"; return { success: true }; }
  if (method === "previewIncidenceThemeMerge") return previewMerge(db, "themes", input.sourceThemeId, input.targetThemeId);
  if (method === "previewBphfEmployeeMerge") return previewMerge(db, "employees", input.sourceEmployeeId, input.targetEmployeeId);
  if (["mergeIncidenceThemes", "mergeBphfInspectionEmployees"].includes(method)) {
    const themes = method === "mergeIncidenceThemes", table = themes ? "themes" : "employees", sourceId = input.sourceThemeId ?? input.sourceEmployeeId, targetId = input.targetThemeId ?? input.targetEmployeeId;
    const preview = previewMerge(db, table, sourceId, targetId), source = requireLocalRow(db, table, sourceId), target = requireLocalRow(db, table, targetId); let updated = 0;
    for (const entry of db.tables.entries) if (themes ? entry.payload?.incidenceTheme === source.name || entry.payload?.incidenceRelationship?.label === source.name : entry.payload?.collaboratorId === source.id) {
      entry.payload[themes ? "incidenceThemeHistory" : "collaboratorMergeHistory"] = [...(entry.payload[themes ? "incidenceThemeHistory" : "collaboratorMergeHistory"] ?? []), historyEvent(profile!, { sourceId, sourceName: source.name, targetId, targetName: target.name })];
      if (themes) { entry.payload.incidenceTheme = target.name; if (entry.payload.incidenceRelationship) entry.payload.incidenceRelationship.label = target.name; } else { entry.payload.collaboratorId = target.id; entry.payload.collaboratorName = target.name; } updated++;
    }
    source.active = "false"; insertLocalRow(db, themes ? "themeMerges" : "employeeMerges", { ...input, sourceName: source.name, targetName: target.name, affectedEntries: updated, mergedAt: new Date(), mergedByName: profile!.name }); return { success: true, updated, affectedEntries: preview.affectedEntries };
  }
  if (method.startsWith("upload")) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(input.dataUrl ?? "")) throw new Error("Selecione uma fotografia JPEG, PNG ou WebP.");
    if (input.dataUrl.length > 3000000) throw new Error("Reduza a fotografia para menos de 2 MB antes de a guardar localmente.");
    const image = { success: true, key: `local-photo-${crypto.randomUUID()}`, url: input.dataUrl, fileName: input.fileName, mimeType: input.mimeType };
    if (method === "uploadFragileReferenceImage") requireLocalRow(db, "fragileItems", input.id ?? input.fragileItemId).referenceImageUrl = image.url;
    return image;
  }
  if (method === "registerDispatchControl") {
    const limits = getDispatchProfile(input.profile); const checks = input.productChecks ?? [{ name: input.product, orderedQuantity: input.orderedBoxes, lots: [{ lot: input.lot, dispatchedQuantity: input.dispatchedBoxes }], productLabelResult: input.productLabelResult, boxLabelResult: input.boxLabelResult, productTemperature: input.productTemperature }];
    const productValidations = checks.map((check: LocalRow) => { const dispatchedQuantity = (check.lots ?? []).reduce((sum: number, lot: LocalRow) => sum + lot.dispatchedQuantity, 0); return { ...check, dispatchedQuantity, conformity: calculateDispatchConformity({ orderedBoxes: check.orderedQuantity, dispatchedBoxes: dispatchedQuantity, productLabelResult: check.productLabelResult, boxLabelResult: check.boxLabelResult, productTemperature: check.productTemperature, vehicleTemperature: input.vehicleTemperature, productTemperatureLimit: limits.productTemperatureLimit, vehicleTemperatureLimit: limits.vehicleTemperatureLimit }) }; });
    const result = productValidations.some((check: LocalRow) => check.conformity.result === "NC") ? "NC" : "C";
    const entry = createEntry(db, { ...input, module: "dispatch_control", title: `Encomenda ${input.orderNumber}`, area: "Expedição", result, notes: input.observations, payload: { ...input, productChecks: productValidations, conformity: { result }, profile: input.profile } }, profile!);
    if (input.dispatchOrderId) Object.assign(requireLocalRow(db, "dispatchOrders", input.dispatchOrderId), { status: "completed", controlEntryId: entry.id }); return { success: true, conformity: { result }, limits, incidence: result === "NC" };
  }
  if (method === "calculateSensory") return calculateSensoryScore(input.scores ?? input);
  if (method === "calculateDispatchConformity") return calculateDispatchConformity(input as any);
  if (method === "incidenceRecurrenceAlerts" || method === "similarIncidenceAlerts") return recurrenceAlerts(db, method === "incidenceRecurrenceAlerts");
  if (method === "dailyReportArchiveHistory") return archiveHistory(db, input);
  if (method === "dailyReportArchiveDetail") return requireLocalRow(db, "archives", input.id);
  if (method === "dailyReportArchiveAttention") return archiveAttention(db, profile!);
  if (method === "markDailyReportArchiveViewed") { insertLocalRow(db, "views", { archiveId: input.id ?? input.archiveId, profileId: profile!.id, viewedAt: new Date() }); return { success: true, tracked: true }; }
  if (["generateDailyReportArchiveBackup", "createManualDailyReportArchive"].includes(method)) { const existing = input.id ? requireLocalRow(db, "archives", input.id) : null; const archive = createLocalArchive(db, existing?.operationalDate ?? input.date ?? input.operationalDate ?? new Date(), profile!, existing ?? undefined); return { success: true, created: true, archiveId: archive.id }; }
  if (method === "generateMissingDailyReportArchiveBackups") { let generated = 0; for (const archive of db.tables.archives) if (!archive.backupFileUrl) { createLocalArchive(db, archive.operationalDate, profile!, archive); generated++; } return { success: true, generated, failed: 0 }; }
  if (method === "qualityManagerReconcileConsistency") { const repaired: LocalRow[] = []; for (const task of db.tables.tasks.filter(task => task.area === "Plano do Dia" && task.status !== "cancelled")) { const status = taskProgress(db, task).completed ? "completed" : "pending"; if (status !== task.status) { task.status = status; repaired.push({ id: task.id }); } } return { success: true, repairedCount: repaired.length, repaired }; }
  if (method === "teachIncidenceAi") { insertLocalRow(db, "guidance", { ...input, createdByName: profile!.name }); return { success: true }; }
  if (["qualityManagerAiBriefing", "incidenceAiAssist", "qualityManagerAiAssist", "suggestFoodDefenseMeasure", "parseDispatchOrderPdf"].includes(method)) throw new Error("Esta função exige um serviço externo e não está disponível na versão independente. Introduza os dados manualmente; nenhum pedido foi enviado a servidores externos.");
  if (method === "renameFragileArea" || method === "mergeFragileAreas") {
    const from = input.oldName ?? input.sourceName ?? input.currentName, to = input.newName ?? input.targetName;
    if (!from || !to) throw new Error("Selecione a área de origem e de destino.");
    for (const item of db.tables.fragileItems) if (item.location === from && scopeMatches(item, input)) item.location = to;
    const area = db.tables.fragileAreas.find(area => area.name === from && scopeMatches(area, input)); if (area) { if (method === "mergeFragileAreas") area.active = "false"; else area.name = to; } return { success: true };
  }
  if (crudCreate[method]) {
    const table = crudCreate[method]; if (input.name) distinctName(db, table, input.name);
    if (method === "createDispatchOrder" && db.tables.dispatchOrders.some(order => dayKey(order.operationalDate) === input.operationalDate && order.orderNumber === input.orderNumber)) throw new Error("Já existe uma encomenda com este número nesta data.");
    const row = insertLocalRow(db, table, { ...input, active: "true", status: table === "fragileItems" ? "active" : table === "ncs" ? "open" : "pending", factoryId: input.factoryId ?? null, factoryIds: input.factoryIds ?? (input.factoryId ? [input.factoryId] : [1, 2, 3]), area: input.areaNames?.[0] ?? input.area, areaNames: input.areaNames ?? [input.area ?? "Geral"], operationalDate: input.operationalDate ? dayDate(input.operationalDate) : undefined, registeredByName: profile!.name, detectedAt: new Date(), createdByName: profile!.name }); return { success: true, id: row.id, employee: row };
  }
  if (crudUpdate[method]) { const row = requireLocalRow(db, crudUpdate[method], input.id); if (input.name) distinctName(db, crudUpdate[method], input.name, row.id); Object.assign(row, input, { updatedAt: new Date() }); if (input.areaNames) row.area = input.areaNames[0]; if (input.dueAt) row.dueAt = new Date(input.dueAt); return { success: true }; }
  if (crudDelete[method]) { const row = requireLocalRow(db, crudDelete[method], input.id); row.active = "false"; row.status = "cancelled"; if (crudDelete[method] === "fragileItems") row.status = "inactive"; return { success: true }; }
  if (method === "initializeMasterData") return { success: true }; // Catálogo de fábricas/áreas inicializado pelo armazenamento local.
  throw new Error(`A operação «${method}» não está implementada no modo local. Nenhuma alteração foi efetuada.`);
}
function recurrenceAlerts(db: LocalDatabase, collaborators: boolean): LocalRow[] {
  const grouped = new Map<string, LocalRow[]>();
  for (const entry of localIncidences(db).filter(entry => !entry.generatedNonconformity && entry.treatmentProgress !== "completed")) {
    const key = collaborators ? String(entry.payload?.collaboratorId ?? entry.payload?.collaboratorName ?? "") : verificationKey(entry);
    if (!key) continue; grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  return Array.from(grouped.entries()).map(([key, entries]) => ({ key, module: entries[0].module, factoryId: entries[0].factoryId, collaboratorId: entries[0].payload?.collaboratorId ?? null, collaboratorName: entries[0].payload?.collaboratorName ?? key, label: entries[0].title, title: entries[0].title, total: entries.reduce((sum, entry) => sum + 1 + (entry.fragileRecurrenceHistory ?? []).length + (entry.followUpReviewAlerts ?? []).filter((alert: LocalRow) => alert.result === "NC").length, 0), incidences: entries.length, incidenceIds: entries.map(entry => entry.id), latestDate: entries[0].completedAt, count: entries.length, factoryName: factoryName(db, entries[0].factoryId) })).filter(alert => alert.total >= 3);
}
let mutationQueue: Promise<unknown> = Promise.resolve();
export function executeLocalOperation(path: string, input: LocalRow = {}, type = "query"): Promise<any> {
  const run = async () => {
    const db = await loadPersistentDatabase(), revision = db.revision;
    const result = await handleLocal(db, path, input ?? {}, type);
    if (type === "mutation" && ["quality.createEntry", "quality.completeTask", "quality.registerDispatchControl", "quality.updateControlEntry", "quality.updateIncidence"].includes(path)) { const profile = activeLocalProfile(db); if (profile) { const row = input?.id ? db.tables.entries.find(row => row.id === input.id) : db.tables.entries.at(-1); if (row) createLocalArchive(db, entryDay(row), profile); } }
    if (type === "mutation" && !["quality.activatePinProfile", "quality.deactivatePinProfile", "auth.logout"].includes(path)) await persistDatabase(db, revision);
    return resolveLocalMediaValue(db, result);
  };
  if (type !== "mutation") return run();
  const operation = mutationQueue.then(run, run); mutationQueue = operation.catch(() => undefined); return operation;
}
export const localStorageLink: TRPCLink<AppRouter> = () => ({ op }) => observable(observer => {
  let cancelled = false;
  executeLocalOperation(op.path, op.input as LocalRow ?? {}, op.type).then(data => { if (!cancelled) { observer.next({ result: { data } }); observer.complete(); } }, error => { if (!cancelled) observer.error(TRPCClientError.from(error)); });
  return () => { cancelled = true; };
});
