ALTER TABLE `control_tasks` ADD `sourceEntryId` int;--> statement-breakpoint
CREATE INDEX `task_source_entry_idx` ON `control_tasks` (`sourceEntryId`);