CREATE TABLE `checklist_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`checklist_area_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checklist_areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `checklist_areas_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `checklist_area_active_idx` ON `checklist_areas` (`checklist_area_active`);--> statement-breakpoint
CREATE INDEX `checklist_area_name_idx` ON `checklist_areas` (`name`);