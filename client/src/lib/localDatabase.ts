import { QUALITY_PANEL_KEYS, QUALITY_EXTERNAL_PANEL_KEYS } from "@shared/quality-panel-access";

export const LOCAL_DATABASE_KEY = "qualicontrol-independent-db-v1";
export const LOCAL_SESSION_KEY = "qualicontrol-independent-session-v1";
export type LocalRow = Record<string, any>;
export type LocalDatabase = { version: 1; revision: number; nextId: number; tables: Record<string, LocalRow[]> };
export const TABLES = ["factories", "areas", "profiles", "employees", "tasks", "entries", "themes", "themeMerges", "employeeMerges", "fragileAreas", "fragileItems", "checklistAreas", "checklistItems", "dispatchOrders", "ncs", "actions", "evidences", "archives", "guidance", "notes", "views", "media"] as const;
export function initialLocalDatabase(): LocalDatabase {
  const tables: Record<string, LocalRow[]> = Object.fromEntries(TABLES.map(name => [name, []]));
  tables.factories = [{ id: 1, code: "F1_FATIADO", name: "Fábrica 1 · Fatiado" }, { id: 2, code: "F2_GRANEL", name: "Fábrica 2 · Granel" }, { id: 3, code: "F3_SEM_GLUTEN", name: "Fábrica 3 · SG" }];
  tables.areas = [{ id: 11, name: "Embalagem T", factoryId: 1, group: "bphf", active: "true" }, { id: 12, name: "Produção T", factoryId: 1, group: "bphf", active: "true" }, { id: 13, name: "Fábrica II", factoryId: 2, group: "bphf", active: "true" }, { id: 14, name: "Embalagem SG", factoryId: 3, group: "bphf", active: "true" }, { id: 15, name: "Produção SG", factoryId: 3, group: "bphf", active: "true" }, { id: 16, name: "Tradicional 1", factoryId: 1, group: "metal", active: "true" }, { id: 17, name: "Tradicional 2", factoryId: 1, group: "metal", active: "true" }, { id: 18, name: "Granel", factoryId: 2, group: "metal", active: "true" }, { id: 19, name: "SG", factoryId: 3, group: "metal", active: "true" }];
  tables.profiles = [{ id: 21, code: "SABRINA_ESTEVES", name: "Sabrina Esteves", role: "technician", title: "Tec. Qualidade" }, { id: 22, code: "NEUZA_ANTUNES", name: "Neuza Antunes", role: "technician", title: "Tec. Qualidade" }, { id: 23, code: "JOANA_PINA", name: "Joana Pina", role: "manager", title: "Resp. Qualidade" }, { id: 24, code: "GESTAO", name: "Gestão", role: "viewer", title: "Consulta" }].map(profile => ({ ...profile, active: true, panelAccess: [...QUALITY_PANEL_KEYS], externalPanelAccess: [...QUALITY_EXTERNAL_PANEL_KEYS], pinHash: null }));
  return { version: 1, revision: 0, nextId: Date.now(), tables };
}
export function validateLocalDatabase(value: any): asserts value is LocalDatabase {
  if (value?.tables && !value.tables.media) value.tables.media = [];
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.revision) || !Number.isSafeInteger(value.nextId) || !value.tables || TABLES.some(name => !Array.isArray(value.tables[name]))) throw new Error("A base local tem um formato inválido. Importe uma cópia de segurança válida; os dados existentes não foram apagados.");
}
export function insertLocalRow(database: LocalDatabase, table: string, fields: LocalRow): LocalRow {
  const row = { ...fields, id: database.nextId++, createdAt: new Date(), updatedAt: new Date() };
  database.tables[table].push(row);
  return row;
}
export function requireLocalRow(database: LocalDatabase, table: string, id: unknown): LocalRow {
  const row = database.tables[table].find(row => row.id === Number(id));
  if (!row) throw new Error("O registo solicitado não foi encontrado neste dispositivo.");
  return row;
}
export function activeLocalProfile(database: LocalDatabase): LocalRow | null {
  const raw = sessionStorage.getItem(LOCAL_SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (session.expiresAt < Date.now()) return null;
    return database.tables.profiles.find(profile => profile.id === session.profileId && profile.active === true) ?? null;
  } catch { return null; }
}
export function publicLocalProfile(profile: LocalRow) {
  const { pinHash, pinSalt, ...safe } = profile;
  return { ...safe, isConfigured: Boolean(pinHash) };
}
export async function localPinDigest(pin: string, salt: string): Promise<string> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("O PIN deve ter entre 4 e 8 algarismos.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
}
// Uma publicação Vercel é uma instalação independente. O teste do hostname
// evita que uma compilação automática do Vercel caia acidentalmente no cliente
// online e altere a base Manus através de /api/trpc.
const independentProductionHost = typeof window !== "undefined"
  && import.meta.env.PROD
  && !/((^|\.)manus(?:pre)?\.com|(^|\.)manuscomputer\.ai|(^|\.)manusvm\.computer|^localhost$|^127\.0\.0\.1$)/i.test(window.location.hostname);

export const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === "true" || independentProductionHost;
