ALTER TABLE `areas` DROP INDEX `areas_name_unique`;--> statement-breakpoint
ALTER TABLE `areas` ADD `factoryId` int;--> statement-breakpoint
CREATE INDEX `area_group_idx` ON `areas` (`area_group`);--> statement-breakpoint
CREATE INDEX `area_factory_idx` ON `areas` (`factoryId`);