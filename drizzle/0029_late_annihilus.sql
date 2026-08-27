CREATE TABLE `fragile_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`factoryId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`fragile_area_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdByProfileId` int,
	`createdByName` varchar(160),
	`updatedBy` varchar(64),
	`updatedByProfileId` int,
	`updatedByName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fragile_areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `fragile_area_factory_name_unique` UNIQUE(`factoryId`,`name`)
);
--> statement-breakpoint
CREATE INDEX `fragile_area_factory_idx` ON `fragile_areas` (`factoryId`);--> statement-breakpoint
CREATE INDEX `fragile_area_active_idx` ON `fragile_areas` (`fragile_area_active`);