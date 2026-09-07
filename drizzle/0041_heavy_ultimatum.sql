ALTER TABLE `rd_sensory_evaluations` ADD `photos` json;--> statement-breakpoint
ALTER TABLE `rd_sensory_evaluations` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `rd_sensory_evaluations` ADD `deletedByProfileId` int;--> statement-breakpoint
ALTER TABLE `rd_sensory_evaluations` ADD `deletedByName` varchar(160);--> statement-breakpoint
ALTER TABLE `rd_sensory_projects` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `rd_sensory_projects` ADD `deletedByProfileId` int;--> statement-breakpoint
ALTER TABLE `rd_sensory_projects` ADD `deletedByName` varchar(160);