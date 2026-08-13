ALTER TABLE `control_entries` ADD `registeredByProfileId` int;--> statement-breakpoint
ALTER TABLE `control_entries` ADD `registeredByName` varchar(160);--> statement-breakpoint
ALTER TABLE `control_entries` ADD `registeredByTitle` varchar(160);--> statement-breakpoint
ALTER TABLE `nonconformities` ADD `reportedByProfileId` int;--> statement-breakpoint
ALTER TABLE `nonconformities` ADD `reportedByName` varchar(160);--> statement-breakpoint
ALTER TABLE `nonconformities` ADD `reportedByTitle` varchar(160);--> statement-breakpoint
CREATE INDEX `entry_operator_idx` ON `control_entries` (`registeredByProfileId`);--> statement-breakpoint
CREATE INDEX `nc_reporter_idx` ON `nonconformities` (`reportedByProfileId`);