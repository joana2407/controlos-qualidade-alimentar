// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { executeLocalOperation as op } from "../client/src/lib/localRpc";
import { initialLocalDatabase, LOCAL_DATABASE_KEY, LOCAL_SESSION_KEY } from "../client/src/lib/localDatabase";
import { loadPersistentDatabase, persistDatabase, exportStorageEntries, exportCompleteBackup, restoreStorageEntries, encodeLocalDatabase, decodeLocalDatabase } from "../client/src/lib/localPersistence";
import { BPHF_CRITERIA, dayDate, dayKey } from "../client/src/lib/localQualityLogic";
const mutation = (method: string, input: Record<string, any>) => op(`quality.${method}`, input, "mutation");
const query = (method: string, input: Record<string, any> = {}) => op(`quality.${method}`, input);
async function manager() {
  await mutation("configureTeamPins", { pins: [{ code: "JOANA_PINA", pin: "2468" }, { code: "NEUZA_ANTUNES", pin: "1357" }, { code: "GESTAO", pin: "9999" }] });
  await mutation("activatePinProfile", { profileId: 23, pin: "2468" });
}
async function plan(module = "shelf_life", factoryIds = [1], extra: Record<string, any> = {}) {
  await mutation("publishDailyPlan", { date: dayDate("2026-11-16"), factoryIds, modules: [module], assigneeProfileIds: [23, 22], ...extra });
  return (await query("listTasks")).find((task: any) => task.module === module);
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.stubGlobal("indexedDB", new IDBFactory()); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Não deve haver pedidos de rede"); })); });
describe("QualiControl independente", () => {
  it("arranca sem API, perfis PIN previamente definidos ou dados fictícios", async () => {
    const status = await query("accessStatus"); expect(status.needsInitialSetup).toBe(true); expect(status.canBootstrap).toBe(true); expect(status.activeProfile).toBe(null); expect(status.profiles).toHaveLength(4); expect((await loadPersistentDatabase()).tables.entries).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
  });
  it("configura PINs protegidos e verifica um PIN errado", async () => {
    await manager(); const db = await loadPersistentDatabase(); const joana = db.tables.profiles.find(row => row.id === 23)!; expect(joana.pinHash).not.toBe("2468"); expect((await query("accessStatus")).profiles[2].pinHash).toBeUndefined(); await expect(mutation("activatePinProfile", { profileId: 23, pin: "0000" })).rejects.toThrow("PIN incorreto");
  });
  it("não concede autorização de preenchimento sem um plano publicado", async () => { await manager(); expect((await query("controlAuthorization", { module: "shelf_life", factoryId: 1 })).allowed).toBe(false); });
  it("publica planos sem duplicados e não cria obrigações automáticas", async () => {
    await manager(); expect((await query("dashboard", { date: dayDate("2026-11-16") })).plannedControls).toHaveLength(0); await plan(); const second = await mutation("publishDailyPlan", { date: dayDate("2026-11-16"), factoryIds: [1], modules: ["shelf_life"], assigneeProfileIds: [23] }); expect(second.created).toBe(0); expect(second.alreadyPresent).toBe(1);
  });
  it("guarda verificações suplementares e mantém o plano concluído para todos os perfis", async () => {
    await manager(); const task = await plan();
    const input = { module: "shelf_life", title: "Pão de ensaio", area: "Produção", factoryId: 1, plannedTaskId: task.id, result: "C", payload: { product: "Pão", lot: "L-26320" } };
    await mutation("createEntry", input); await mutation("createEntry", input);
    const db = await loadPersistentDatabase(); expect(db.tables.entries).toHaveLength(2); expect(db.tables.archives).toHaveLength(1);
    expect((await query("dashboard", { date: dayDate("2026-11-16") })).plannedControls[0].completed).toBe(true);
    await mutation("activatePinProfile", { profileId: 22, pin: "1357" }); expect((await query("pendingControlTasks", { module: "shelf_life", factoryId: 1 })).length).toBe(0); expect((await query("controlAuthorization", { module: "shelf_life", factoryId: 1, plannedTaskId: task.id })).allowed).toBe(true);
  });
  it("conta verificações únicas de BPHF e não fecha cobertura parcial", async () => {
    await manager(); const task = await plan("bphf", [1], { bphfCriteria: [BPHF_CRITERIA[0]] });
    const input = { module: "bphf", title: BPHF_CRITERIA[0], area: "Embalagem T", factoryId: 1, plannedTaskId: task.id, result: "C", payload: { criterion: BPHF_CRITERIA[0] } };
    await mutation("createEntry", input); await mutation("createEntry", input); let dashboard = await query("dashboard", { date: task.dueAt }); expect(dashboard.plannedControls[0].completed).toBe(false); expect(dashboard.moduleProgress.bphf.percentage).toBe(50);
    await mutation("createEntry", { ...input, area: "Produção T" }); dashboard = await query("dashboard", { date: task.dueAt }); expect(dashboard.plannedControls[0].completed).toBe(true); expect(dashboard.moduleProgress.bphf.percentage).toBe(100);
  });
  it("segrega o plano por fábrica sem propagar resultados para as outras", async () => {
    await manager(); const task = await plan("shelf_life", [1, 2]); await mutation("createEntry", { module: "shelf_life", title: "Broa", area: "Produção", factoryId: 1, plannedTaskId: task.id, result: "C", payload: {} }); const data = await query("dashboard", { date: task.dueAt }); expect(data.plannedControls.filter((row: any) => row.completed)).toHaveLength(1); expect(data.plannedControls.find((row: any) => row.factoryId === 2).completed).toBe(false);
  });
  it("o perfil de consulta não pode criar registos nem alterar catálogos", async () => {
    await manager(); await mutation("activatePinProfile", { profileId: 24, pin: "9999" }); await expect(mutation("createBphfInspectionEmployee", { name: "Pessoa" })).rejects.toThrow("consulta");
  });
  it("apenas a Responsável pode editar o catálogo central e decisões globais", async () => {
    await manager(); await mutation("activatePinProfile", { profileId: 22, pin: "1357" }); await expect(mutation("createIncidenceTheme", { name: "Tema" })).rejects.toThrow("Responsável");
  });
  it("preserva o histórico de tratamento e audita a fusão de temas", async () => {
    await manager(); const task = await plan(); const first = await mutation("createEntry", { module: "shelf_life", title: "Pão com desvio", area: "Produção", factoryId: 1, plannedTaskId: task.id, result: "NC", payload: { incidenceTheme: "Tema incorreto" } });
    const source = await mutation("createIncidenceTheme", { name: "Tema incorreto" }); const target = await mutation("createIncidenceTheme", { name: "Tema correto" });
    await mutation("updateIncidence", { id: first.id, treatment: { status: "in_progress", correction: "Rever produção" } });
    expect((await query("previewIncidenceThemeMerge", { sourceThemeId: source.id, targetThemeId: target.id })).affectedEntries).toBe(1);
    await mutation("mergeIncidenceThemes", { sourceThemeId: source.id, targetThemeId: target.id, reason: "Correção" }); const incidence = (await query("listIncidences"))[0]; expect(incidence.payload.incidenceTheme).toBe("Tema correto"); expect(incidence.treatmentHistory).toHaveLength(1); expect(incidence.payload.incidenceThemeHistory).toHaveLength(1); expect((await query("listIncidenceThemeMerges"))).toHaveLength(1);
  });
  it("guarda fotografias sem URL externa e inclui-as no backup restaurável", async () => {
    await manager(); const task = await plan(); const dataUrl = "data:image/jpeg;base64,cGhvdG8=";
    await mutation("createEntry", { module: "shelf_life", title: "Fotografia", area: "Produção", factoryId: 1, plannedTaskId: task.id, result: "NC", payload: { evidencePhotos: [{ url: dataUrl, key: "photo", fileName: "photo.jpg", mimeType: "image/jpeg" }] } });
    const db = await loadPersistentDatabase(); expect(db.tables.media).toHaveLength(1); expect(db.tables.entries[0].payload.evidencePhotos[0].url).toMatch(/^local-media:/); expect((await query("listIncidences"))[0].payload.evidencePhotos[0].url).toBe(dataUrl);
    const backup = await exportCompleteBackup(); expect(backup.media[0].dataUrl).toBe(dataUrl);
    vi.stubGlobal("indexedDB", new IDBFactory());
    await restoreStorageEntries(backup.entries, false, backup.media); expect((await query("listIncidences"))[0].payload.evidencePhotos[0].url).toBe(dataUrl); expect(fetch).not.toHaveBeenCalled();
  });
  it("preserva IDs, datas e todos os arquivos históricos através da cópia JSON", async () => {
    const db = initialLocalDatabase(); db.tables.entries.push({ id: 60001, module: "shelf_life", completedAt: dayDate("2026-08-01"), payload: { lot: "Histórico" } }); db.tables.archives.push({ id: 30001, operationalDate: dayDate("2026-08-01"), revision: 1, snapshot: { schemaVersion: 2, controlEntries: [{ id: 60001 }], incidences: [], plannedTasks: [] } }); await persistDatabase(db, 0); const exported = await exportStorageEntries(); localStorage.clear(); await restoreStorageEntries(exported); const restored = await loadPersistentDatabase(); expect(restored.tables.entries[0].id).toBe(60001); expect(restored.tables.entries[0].completedAt).toBeInstanceOf(Date); expect(restored.tables.archives[0].snapshot.controlEntries[0].id).toBe(60001);
  });
  it("rejeita importações inválidas antes de alterar os dados", async () => { await manager(); const before = localStorage.getItem(LOCAL_DATABASE_KEY); await expect(restoreStorageEntries({ [LOCAL_DATABASE_KEY]: "corrompido" })).rejects.toThrow(); expect(localStorage.getItem(LOCAL_DATABASE_KEY)).toBe(before); });
  it("não apaga catálogos de processos existentes ao transferir o histórico", async () => { localStorage.setItem("qualicontrol-process-catalog-v1", "catálogo original"); await restoreStorageEntries({ [LOCAL_DATABASE_KEY]: encodeLocalDatabase(initialLocalDatabase()) }, true); expect(localStorage.getItem("qualicontrol-process-catalog-v1")).toBe("catálogo original"); });
  it("arquiva uma versão final por dia sem eliminar verificações", async () => { await manager(); const task = await plan(); for (let index = 0; index < 3; index++) await mutation("createEntry", { module: "shelf_life", title: `Verificação ${index}`, area: "Produção", factoryId: 1, plannedTaskId: task.id, result: "C", payload: {} }); const db = await loadPersistentDatabase(); expect(db.tables.entries).toHaveLength(3); expect(db.tables.archives).toHaveLength(1); const archives = await query("dailyReportArchiveHistory"); expect(archives[0].controls).toBe(3); expect(archives[0].backupFileUrl).toMatch(/^data:application\/vnd.openxmlformats/); });
  it("produz relatórios e indicadores a partir dos registos locais", async () => { await manager(); const task = await plan(); await mutation("createEntry", { module: "shelf_life", title: "Pão", area: "Produção", factoryId: 1, plannedTaskId: task.id, result: "NC", payload: {} }); const reports = await query("reports"); expect(reports.filteredSummary.total).toBe(1); expect(reports.filteredSummary.nonconforming).toBe(1); const analytics = await query("operationalAnalytics", { referenceDate: task.dueAt }); expect(analytics.incidences.total).toBe(1); expect(analytics.completion.completed).toBe(1); expect(analytics.results.nonconforming).toBe(1); });
  it("reconhece decisões de NC históricas mesmo sem uma NC formal duplicada", async () => {
    await manager(); const db = await loadPersistentDatabase(); db.tables.entries.push({ id: 700001, module: "shelf_life", title: "Histórico", result: "NC", factoryId: 1, completedAt: dayDate("2026-08-01"), payload: { treatmentDecision: "nc_generated", incidenceTreatment: { status: "completed" } } }); await persistDatabase(db, db.revision); expect((await query("listIncidences"))[0].generatedNonconformity).toBe(true);
  });
  it("não simula sucesso para uma operação não implementada", async () => { await manager(); await expect(mutation("inventedProcedure", {})).rejects.toThrow("não está implementada"); });
  it("recusa IA/PDF externos sem efetuar chamadas de rede", async () => { await manager(); await expect(mutation("parseDispatchOrderPdf", {})).rejects.toThrow("serviço externo"); expect(fetch).not.toHaveBeenCalled(); });
});
