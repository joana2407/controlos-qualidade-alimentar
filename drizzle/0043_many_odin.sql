ALTER TABLE `control_tasks` ADD `parentTaskId` int;--> statement-breakpoint
ALTER TABLE `control_tasks` ADD `planRevision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `task_parent_idx` ON `control_tasks` (`parentTaskId`);