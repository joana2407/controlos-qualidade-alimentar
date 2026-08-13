CREATE TABLE `areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`area_group` enum('bphf','metal','general') NOT NULL DEFAULT 'general',
	`area_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `areas_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `control_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`quality_module` enum('bphf','metal_detectors','sensory','shelf_life','monthly_checklist','suggestion_boxes','fragile_items') NOT NULL,
	`areaId` int NOT NULL,
	`plan_frequency` enum('daily','weekly','monthly','per_shift','per_lot') NOT NULL,
	`plan_critical` enum('true','false') NOT NULL DEFAULT 'false',
	`plan_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `control_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `plan_module_idx` ON `control_plans` (`quality_module`);--> statement-breakpoint
CREATE INDEX `plan_area_idx` ON `control_plans` (`areaId`);