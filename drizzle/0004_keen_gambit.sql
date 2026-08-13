CREATE TABLE `factories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(160) NOT NULL,
	`factory_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `factories_id` PRIMARY KEY(`id`),
	CONSTRAINT `factories_code_unique` UNIQUE(`code`),
	CONSTRAINT `factories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `control_entries` ADD `factoryId` int;--> statement-breakpoint
ALTER TABLE `control_plans` ADD `factoryId` int;--> statement-breakpoint
ALTER TABLE `control_tasks` ADD `factoryId` int;--> statement-breakpoint
ALTER TABLE `corrective_actions` ADD `factoryId` int;--> statement-breakpoint
ALTER TABLE `nonconformities` ADD `factoryId` int;--> statement-breakpoint
CREATE INDEX `entry_factory_idx` ON `control_entries` (`factoryId`);--> statement-breakpoint
CREATE INDEX `plan_factory_idx` ON `control_plans` (`factoryId`);--> statement-breakpoint
CREATE INDEX `task_factory_idx` ON `control_tasks` (`factoryId`);--> statement-breakpoint
CREATE INDEX `action_factory_idx` ON `corrective_actions` (`factoryId`);--> statement-breakpoint
CREATE INDEX `nc_factory_idx` ON `nonconformities` (`factoryId`);