ALTER TABLE `control_tasks` ADD `completedByProfileId` int;--> statement-breakpoint
ALTER TABLE `control_tasks` ADD `completedByName` varchar(160);--> statement-breakpoint
ALTER TABLE `control_tasks` ADD `completedByTitle` varchar(160);--> statement-breakpoint
CREATE INDEX `task_operator_idx` ON `control_tasks` (`completedByProfileId`);