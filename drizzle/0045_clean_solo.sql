ALTER TABLE `rd_sensory_projects` ADD `factoryId` int;--> statement-breakpoint
CREATE INDEX `rd_sensory_project_factory_idx` ON `rd_sensory_projects` (`factoryId`);