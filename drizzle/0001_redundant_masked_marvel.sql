CREATE TABLE `checklist_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`area` varchar(120) NOT NULL,
	`label` varchar(500) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 100,
	`checklist_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checklist_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `control_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quality_module` enum('bphf','metal_detectors','sensory','shelf_life','monthly_checklist','suggestion_boxes','fragile_items') NOT NULL,
	`title` varchar(180) NOT NULL,
	`area` varchar(120) NOT NULL,
	`control_result` enum('C','NC','N/A'),
	`notes` text,
	`payload` json NOT NULL,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `control_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `control_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`quality_module` enum('bphf','metal_detectors','sensory','shelf_life','monthly_checklist','suggestion_boxes','fragile_items') NOT NULL,
	`area` varchar(120) NOT NULL,
	`dueAt` timestamp NOT NULL,
	`responsible` varchar(120) NOT NULL,
	`task_status` enum('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `control_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `corrective_actions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nonconformityId` int NOT NULL,
	`action_type` enum('correction','corrective') NOT NULL,
	`description` text NOT NULL,
	`responsible` varchar(120) NOT NULL,
	`dueAt` timestamp,
	`action_status` enum('pending','completed','verified') NOT NULL DEFAULT 'pending',
	`completionNotes` text,
	`completedAt` timestamp,
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `corrective_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evidences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nonconformityId` int,
	`correctiveActionId` int,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`url` varchar(1024) NOT NULL,
	`uploadedBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `evidences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fragile_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`location` varchar(120) NOT NULL,
	`fragile_type` enum('Vidro','Plástico rígido','Outro') NOT NULL,
	`fragile_status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fragile_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nonconformities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quality_module` enum('bphf','metal_detectors','sensory','shelf_life','monthly_checklist','suggestion_boxes','fragile_items') NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text NOT NULL,
	`area` varchar(120) NOT NULL,
	`nc_severity` enum('critical','high','medium','low') NOT NULL DEFAULT 'medium',
	`nc_status` enum('open','in_progress','awaiting_validation','closed') NOT NULL DEFAULT 'open',
	`assignedTo` varchar(120),
	`dueAt` timestamp,
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	`validatedBy` varchar(120),
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nonconformities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `entry_module_idx` ON `control_entries` (`quality_module`);--> statement-breakpoint
CREATE INDEX `entry_area_idx` ON `control_entries` (`area`);--> statement-breakpoint
CREATE INDEX `entry_completed_idx` ON `control_entries` (`completedAt`);--> statement-breakpoint
CREATE INDEX `task_due_idx` ON `control_tasks` (`dueAt`);--> statement-breakpoint
CREATE INDEX `task_module_idx` ON `control_tasks` (`quality_module`);--> statement-breakpoint
CREATE INDEX `action_nc_idx` ON `corrective_actions` (`nonconformityId`);--> statement-breakpoint
CREATE INDEX `action_due_idx` ON `corrective_actions` (`dueAt`);--> statement-breakpoint
CREATE INDEX `evidence_nc_idx` ON `evidences` (`nonconformityId`);--> statement-breakpoint
CREATE INDEX `evidence_action_idx` ON `evidences` (`correctiveActionId`);--> statement-breakpoint
CREATE INDEX `fragile_location_idx` ON `fragile_items` (`location`);--> statement-breakpoint
CREATE INDEX `nc_status_idx` ON `nonconformities` (`nc_status`);--> statement-breakpoint
CREATE INDEX `nc_severity_idx` ON `nonconformities` (`nc_severity`);