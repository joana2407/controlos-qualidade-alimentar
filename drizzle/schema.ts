import { boolean, date, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const qualityModuleValues = ["bphf", "metal_detectors", "sensory", "shelf_life", "monthly_checklist", "suggestion_boxes", "fragile_items", "dispatch_control", "internal_analysis", "temperature_controls", "food_defense", "not_applicable"] as const;
export const resultValues = ["C", "NC", "N/A"] as const;

const qualityModule = mysqlEnum("quality_module", qualityModuleValues);
const controlResult = mysqlEnum("control_result", resultValues);
const qualityProfileRole = mysqlEnum("quality_profile_role", ["technician", "manager"]);

export const qualityPinProfiles = mysqlTable("quality_pin_profiles", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 48 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull().unique(),
  title: varchar("title", { length: 160 }).notNull(),
  role: qualityProfileRole.notNull(),
  pinHash: varchar("pinHash", { length: 512 }),
  active: mysqlEnum("quality_profile_active", ["true", "false"]).default("true").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("quality_profile_role_idx").on(table.role)]);

/** Colaboradores que podem ser identificados numa inspeção BPHF de cacifos. */
export const bphfInspectionEmployees = mysqlTable("bphf_inspection_employees", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull().unique(),
  active: mysqlEnum("bphf_employee_active", ["true", "false"]).default("true").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("bphf_employee_active_idx").on(table.active)]);

export const qualityPinSessions = mysqlTable("quality_pin_sessions", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  oauthOpenId: varchar("oauthOpenId", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("quality_session_profile_idx").on(table.profileId), index("quality_session_expiry_idx").on(table.expiresAt)]);

export const areas = mysqlTable("areas", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  group: mysqlEnum("area_group", ["bphf", "metal", "general"]).default("general").notNull(),
  factoryId: int("factoryId"),
  active: mysqlEnum("area_active", ["true", "false"]).default("true").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("area_group_idx").on(table.group), index("area_factory_idx").on(table.factoryId)]);

export const factories = mysqlTable("factories", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull().unique(),
  active: mysqlEnum("factory_active", ["true", "false"]).default("true").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const controlPlans = mysqlTable("control_plans", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  module: qualityModule.notNull(),
  areaId: int("areaId").notNull(),
  factoryId: int("factoryId"),
  frequency: mysqlEnum("plan_frequency", ["daily", "weekly", "monthly", "per_shift", "per_lot"]).notNull(),
  critical: mysqlEnum("plan_critical", ["true", "false"]).default("false").notNull(),
  active: mysqlEnum("plan_active", ["true", "false"]).default("true").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("plan_module_idx").on(table.module), index("plan_area_idx").on(table.areaId), index("plan_factory_idx").on(table.factoryId)]);

export const controlTasks = mysqlTable("control_tasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description"),
  module: qualityModule.notNull(),
  area: varchar("area", { length: 120 }).notNull(),
  factoryId: int("factoryId"),
  dueAt: timestamp("dueAt").notNull(),
  responsible: varchar("responsible", { length: 120 }).notNull(),
  assigneeProfileIds: json("assigneeProfileIds").$type<number[] | null>(),
  status: mysqlEnum("task_status", ["pending", "completed", "cancelled"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  completedByProfileId: int("completedByProfileId"),
  completedByName: varchar("completedByName", { length: 160 }),
  completedByTitle: varchar("completedByTitle", { length: 160 }),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("task_due_idx").on(table.dueAt), index("task_module_idx").on(table.module), index("task_factory_idx").on(table.factoryId), index("task_operator_idx").on(table.completedByProfileId)]);

export const controlEntries = mysqlTable("control_entries", {
  id: int("id").autoincrement().primaryKey(),
  module: qualityModule.notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  area: varchar("area", { length: 120 }).notNull(),
  factoryId: int("factoryId"),
  result: controlResult,
  notes: text("notes"),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  offlineSyncId: varchar("offlineSyncId", { length: 64 }),
  registeredByProfileId: int("registeredByProfileId"),
  registeredByName: varchar("registeredByName", { length: 160 }),
  registeredByTitle: varchar("registeredByTitle", { length: 160 }),
  completedAt: timestamp("completedAt").defaultNow().notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("entry_module_idx").on(table.module), index("entry_area_idx").on(table.area), index("entry_completed_idx").on(table.completedAt), index("entry_factory_idx").on(table.factoryId), index("entry_operator_idx").on(table.registeredByProfileId), uniqueIndex("entry_offline_sync_idx").on(table.offlineSyncId)]);

export const nonconformities = mysqlTable("nonconformities", {
  id: int("id").autoincrement().primaryKey(),
  sourceEntryId: int("sourceEntryId"),
  module: qualityModule.notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").notNull(),
  area: varchar("area", { length: 120 }).notNull(),
  factoryId: int("factoryId"),
  severity: mysqlEnum("nc_severity", ["critical", "high", "medium", "low"]).default("medium").notNull(),
  status: mysqlEnum("nc_status", ["open", "in_progress", "awaiting_validation", "closed"]).default("open").notNull(),
  assignedTo: varchar("assignedTo", { length: 120 }),
  dueAt: timestamp("dueAt"),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  validatedBy: varchar("validatedBy", { length: 120 }),
  validatedByOpenId: varchar("validatedByOpenId", { length: 64 }),
  reportedByProfileId: int("reportedByProfileId"),
  reportedByName: varchar("reportedByName", { length: 160 }),
  reportedByTitle: varchar("reportedByTitle", { length: 160 }),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("nc_status_idx").on(table.status), index("nc_severity_idx").on(table.severity), index("nc_factory_idx").on(table.factoryId), index("nc_reporter_idx").on(table.reportedByProfileId), index("nc_source_entry_idx").on(table.sourceEntryId)]);

/** Nota de turno diária por fábrica/linha; a fábrica 0 representa a visão consolidada. */
export const dailyIncidenceSummaries = mysqlTable("daily_incidence_summaries", {
  id: int("id").autoincrement().primaryKey(),
  referenceDate: date("referenceDate").notNull(),
  factoryId: int("factoryId").notNull().default(0),
  note: text("note").notNull(),
  updatedByProfileId: int("updatedByProfileId"),
  updatedByName: varchar("updatedByName", { length: 160 }),
  updatedByTitle: varchar("updatedByTitle", { length: 160 }),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("daily_incidence_summary_scope_idx").on(table.referenceDate, table.factoryId), index("daily_incidence_summary_date_idx").on(table.referenceDate)]);

const occurrenceType = mysqlEnum("occurrence_type", ["NC", "Nnc"]);
const occurrenceOrigin = mysqlEnum("occurrence_origin", ["I", "R", "F", "AI", "AE"]);
const occurrenceStatus = mysqlEnum("occurrence_status", ["ABERTO", "FECHADO"]);
const occurrenceEffectiveness = mysqlEnum("occurrence_effectiveness", ["Satisfatória", "Não Satisfatória", ""]);
const occurrenceAccessRole = mysqlEnum("occurrence_access_role", ["user", "admin", "gestao"]);
const occurrenceAccessScope = mysqlEnum("occurrence_access_scope", ["all", "reclamacoes"]);

/** Autorizações migradas do Registo de Ocorrências: papel e âmbito por perfil PIN. */
export const occurrenceAccessProfiles = mysqlTable("occurrence_access_profiles", {
  id: int("id").autoincrement().primaryKey(),
  qualityProfileId: int("qualityProfileId").notNull().unique(),
  role: occurrenceAccessRole.default("user").notNull(),
  scope: occurrenceAccessScope.default("all").notNull(),
  updatedBy: varchar("updatedBy", { length: 64 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("occurrence_access_scope_idx").on(table.scope)]);

/**
 * Registo de ocorrências BRC Food V9 migrado do projeto «Ocorrências A&S».
 * Os valores de fábrica são guardados como código para preservar o histórico
 * da origem e permitir o mapeamento às fábricas/linhas atuais.
 */
export const occurrences = mysqlTable("occurrences", {
  id: int("id").autoincrement().primaryKey(),
  number: int("number").notNull(),
  factoryCode: varchar("factoryCode", { length: 48 }).default(""),
  occurredOn: date("occurredOn").notNull(),
  type: occurrenceType.notNull(),
  origin: occurrenceOrigin.notNull(),
  clientSupplierAuditor: varchar("clientSupplierAuditor", { length: 255 }),
  brcRequirement: varchar("brcRequirement", { length: 100 }),
  sgsqaScope: varchar("sgsqaScope", { length: 255 }),
  affectedProduct: varchar("affectedProduct", { length: 255 }),
  lot: varchar("lot", { length: 100 }),
  expiry: varchar("expiry", { length: 50 }),
  rawMaterialLot: varchar("rawMaterialLot", { length: 100 }),
  quantity: varchar("quantity", { length: 100 }),
  nonconformingProductClass: mysqlEnum("occurrence_pnc_class", ["PNC C1", "PNC C2", ""]).default(""),
  description: text("description").notNull(),
  descriptionImages: text("descriptionImages"),
  hazardType: varchar("hazardType", { length: 255 }).default("NA"),
  hazardDescription: text("hazardDescription"),
  justification: text("justification"),
  rootCauseAnalysis: text("rootCauseAnalysis"),
  correction: text("correction"),
  correctionResponsible: varchar("correctionResponsible", { length: 255 }),
  correctionImplementedOn: date("correctionImplementedOn"),
  correctionEvidence: text("correctionEvidence"),
  correctionEvidenceImages: text("correctionEvidenceImages"),
  correctiveAction: text("correctiveAction"),
  correctiveActionResponsible: varchar("correctiveActionResponsible", { length: 255 }),
  correctiveActionDueOn: date("correctiveActionDueOn"),
  correctiveActionClosedOn: date("correctiveActionClosedOn"),
  correctiveActionEvidence: text("correctiveActionEvidence"),
  correctiveActionEvidenceImages: text("correctiveActionEvidenceImages"),
  implementationDueOn: date("implementationDueOn"),
  responsible: varchar("responsible", { length: 255 }),
  status: occurrenceStatus.default("ABERTO").notNull(),
  closedOn: date("closedOn"),
  closingResponsible: varchar("closingResponsible", { length: 255 }),
  effectivenessResponsible: varchar("effectivenessResponsible", { length: 255 }),
  effectivenessEvidence: text("effectivenessEvidence"),
  assessmentMethod: text("assessmentMethod"),
  effectiveness: occurrenceEffectiveness.default("").notNull(),
  recurrent: boolean("recurrent").default(false).notNull(),
  recurrenceOfId: int("recurrenceOfId"),
  impactsObjectives: mysqlEnum("occurrence_impacts_objectives", ["Sim", "Não", ""]).default(""),
  effect: text("effect"),
  observations: text("observations"),
  openedByProfileId: int("openedByProfileId"),
  treatmentByProfileId: int("treatmentByProfileId"),
  effectivenessByProfileId: int("effectivenessByProfileId"),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  updatedBy: varchar("updatedBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("occurrence_number_idx").on(table.number),
  index("occurrence_factory_idx").on(table.factoryCode),
  index("occurrence_status_idx").on(table.status),
  index("occurrence_origin_idx").on(table.origin),
  index("occurrence_brc_idx").on(table.brcRequirement),
  index("occurrence_date_idx").on(table.occurredOn),
]);

/** Reclamações a fornecedores preservadas do projeto «Ocorrências A&S». */
export const supplierComplaints = mysqlTable("supplier_complaints", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 50 }).unique(),
  complaintOn: date("complaintOn").notNull(),
  supplier: varchar("supplier", { length: 255 }).notNull(),
  sector: varchar("sector", { length: 255 }),
  affectedProducts: text("affectedProducts"),
  lots: text("lots"),
  expiry: varchar("expiry", { length: 100 }),
  quantity: varchar("quantity", { length: 100 }),
  category: mysqlEnum("supplier_complaint_category", ["PRODUTO", "SERVICO"]),
  description: text("description"),
  descriptionImages: text("descriptionImages"),
  hazardType: varchar("hazardType", { length: 100 }),
  correction: text("correction"),
  correctionResponsible: varchar("correctionResponsible", { length: 255 }),
  correctionImplementedOn: date("correctionImplementedOn"),
  correctionEvidence: text("correctionEvidence"),
  correctionEvidenceImages: text("correctionEvidenceImages"),
  correctiveAction: text("correctiveAction"),
  correctiveActionResponsible: varchar("correctiveActionResponsible", { length: 255 }),
  correctiveActionDueOn: date("correctiveActionDueOn"),
  correctiveActionClosedOn: date("correctiveActionClosedOn"),
  correctiveActionEvidence: text("correctiveActionEvidence"),
  correctiveActionEvidenceImages: text("correctiveActionEvidenceImages"),
  preventiveAction: text("preventiveAction"),
  implementationDueOn: varchar("implementationDueOn", { length: 100 }),
  responsible: varchar("responsible", { length: 255 }),
  recurrent: boolean("recurrent").default(false).notNull(),
  recurrenceOfId: int("recurrenceOfId"),
  status: occurrenceStatus.default("ABERTO").notNull(),
  closedOn: date("closedOn"),
  closingResponsible: varchar("closingResponsible", { length: 255 }),
  closingObservations: text("closingObservations"),
  observations: text("observations"),
  evidence: text("evidence"),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  updatedBy: varchar("updatedBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("supplier_complaint_status_idx").on(table.status), index("supplier_complaint_supplier_idx").on(table.supplier), index("supplier_complaint_date_idx").on(table.complaintOn)]);

export const correctiveActions = mysqlTable("corrective_actions", {
  id: int("id").autoincrement().primaryKey(),
  nonconformityId: int("nonconformityId").notNull(),
  factoryId: int("factoryId"),
  actionType: mysqlEnum("action_type", ["correction", "corrective"]).notNull(),
  description: text("description").notNull(),
  responsible: varchar("responsible", { length: 120 }).notNull(),
  dueAt: timestamp("dueAt"),
  status: mysqlEnum("action_status", ["pending", "completed", "verified"]).default("pending").notNull(),
  completionNotes: text("completionNotes"),
  completedAt: timestamp("completedAt"),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("action_nc_idx").on(table.nonconformityId), index("action_due_idx").on(table.dueAt), index("action_factory_idx").on(table.factoryId)]);

export const evidences = mysqlTable("evidences", {
  id: int("id").autoincrement().primaryKey(),
  nonconformityId: int("nonconformityId"),
  correctiveActionId: int("correctiveActionId"),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  uploadedBy: varchar("uploadedBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("evidence_nc_idx").on(table.nonconformityId), index("evidence_action_idx").on(table.correctiveActionId)]);

export const checklistItems = mysqlTable("checklist_items", {
  id: int("id").autoincrement().primaryKey(),
  factoryId: int("factoryId"),
  area: varchar("area", { length: 120 }).notNull(),
  label: varchar("label", { length: 500 }).notNull(),
  sortOrder: int("sortOrder").default(100).notNull(),
  active: mysqlEnum("checklist_active", ["true", "false"]).default("true").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const checklistItemFactories = mysqlTable("checklist_item_factories", {
  id: int("id").autoincrement().primaryKey(),
  checklistItemId: int("checklistItemId").notNull(),
  factoryId: int("factoryId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("checklist_item_factory_unique").on(table.checklistItemId, table.factoryId), index("checklist_item_factory_idx").on(table.factoryId)]);

export const fragileItems = mysqlTable("fragile_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  location: varchar("location", { length: 120 }).notNull(),
  factoryId: int("factoryId"),
  periodicity: mysqlEnum("fragile_periodicity", ["D", "S", "Q", "M"]).default("M").notNull(),
  sourceSheet: varchar("sourceSheet", { length: 160 }),
  sortOrder: int("sortOrder").default(100).notNull(),
  referenceImageKey: varchar("referenceImageKey", { length: 512 }),
  referenceImageUrl: varchar("referenceImageUrl", { length: 1024 }),
  referenceImageName: varchar("referenceImageName", { length: 255 }),
  itemType: mysqlEnum("fragile_type", ["Vidro", "Plástico rígido", "Outro"]).notNull(),
  status: mysqlEnum("fragile_status", ["active", "inactive"]).default("active").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdByProfileId: int("createdByProfileId"),
  createdByName: varchar("createdByName", { length: 160 }),
  updatedBy: varchar("updatedBy", { length: 64 }),
  updatedByProfileId: int("updatedByProfileId"),
  updatedByName: varchar("updatedByName", { length: 160 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("fragile_location_idx").on(table.location), index("fragile_factory_idx").on(table.factoryId), index("fragile_periodicity_idx").on(table.periodicity)]);
