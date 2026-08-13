ALTER TABLE `fragile_items` ADD `factoryId` int;--> statement-breakpoint
ALTER TABLE `fragile_items` ADD `fragile_periodicity` enum('D','S','Q','M') DEFAULT 'M' NOT NULL;--> statement-breakpoint
ALTER TABLE `fragile_items` ADD `sourceSheet` varchar(160);--> statement-breakpoint
ALTER TABLE `fragile_items` ADD `sortOrder` int DEFAULT 100 NOT NULL;--> statement-breakpoint
CREATE INDEX `fragile_factory_idx` ON `fragile_items` (`factoryId`);--> statement-breakpoint
CREATE INDEX `fragile_periodicity_idx` ON `fragile_items` (`fragile_periodicity`);