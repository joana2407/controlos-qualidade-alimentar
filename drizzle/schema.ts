import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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

export const qualityModuleValues = ["bphf", "metal_detectors", "sensory", "shelf_life", "monthly_checklist", "suggestion_boxes", "fragile_items"] as const;
export const resultValues = ["C", "NC", "N/A"] as const;

const qualityModule = mysqlEnum("quality_module", qualityModuleValues);
const controlResult = mysqlEnum("control_result", resultValues);

export const areas = mysqlTable("areas", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  group: mysqlEnum("area_group", ["bphf", "metal", "general"]).default("general").notNull(),
  active: mysqlEnum("area_active", ["true", "false"]).default("true").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

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
  module: qualityModule.notNull(),
  area: varchar("area", { length: 120 }).notNull(),
  factoryId: int("factoryId"),
  dueAt: timestamp("dueAt").notNull(),
  responsible: varchar("responsible", { length: 120 }).notNull(),
  status: mysqlEnum("task_status", ["pending", "completed", "cancelled"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("task_due_idx").on(table.dueAt), index("task_module_idx").on(table.module), index("task_factory_idx").on(table.factoryId)]);

export const controlEntries = mysqlTable("control_entries", {
  id: int("id").autoincrement().primaryKey(),
  module: qualityModule.notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  area: varchar("area", { length: 120 }).notNull(),
  factoryId: int("factoryId"),
  result: controlResult,
  notes: text("notes"),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  completedAt: timestamp("completedAt").defaultNow().notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("entry_module_idx").on(table.module), index("entry_area_idx").on(table.area), index("entry_completed_idx").on(table.completedAt), index("entry_factory_idx").on(table.factoryId)]);

export const nonconformities = mysqlTable("nonconformities", {
  id: int("id").autoincrement().primaryKey(),
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
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("nc_status_idx").on(table.status), index("nc_severity_idx").on(table.severity), index("nc_factory_idx").on(table.factoryId)]);

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
  area: varchar("area", { length: 120 }).notNull(),
  label: varchar("label", { length: 500 }).notNull(),
  sortOrder: int("sortOrder").default(100).notNull(),
  active: mysqlEnum("checklist_active", ["true", "false"]).default("true").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const fragileItems = mysqlTable("fragile_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  location: varchar("location", { length: 120 }).notNull(),
  factoryId: int("factoryId"),
  periodicity: mysqlEnum("fragile_periodicity", ["D", "S", "Q", "M"]).default("M").notNull(),
  sourceSheet: varchar("sourceSheet", { length: 160 }),
  sortOrder: int("sortOrder").default(100).notNull(),
  itemType: mysqlEnum("fragile_type", ["Vidro", "Plástico rígido", "Outro"]).notNull(),
  status: mysqlEnum("fragile_status", ["active", "inactive"]).default("active").notNull(),
  createdBy: varchar("createdBy", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("fragile_location_idx").on(table.location), index("fragile_factory_idx").on(table.factoryId), index("fragile_periodicity_idx").on(table.periodicity)]);
