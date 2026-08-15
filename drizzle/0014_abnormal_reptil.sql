CREATE TABLE `daily_incidence_summaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referenceDate` date NOT NULL,
	`factoryId` int NOT NULL DEFAULT 0,
	`note` text NOT NULL,
	`updatedByProfileId` int,
	`updatedByName` varchar(160),
	`updatedByTitle` varchar(160),
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_incidence_summaries_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_incidence_summary_scope_idx` UNIQUE(`referenceDate`,`factoryId`)
);
--> statement-breakpoint
ALTER TABLE `nonconformities` ADD `sourceEntryId` int;--> statement-breakpoint
CREATE INDEX `daily_incidence_summary_date_idx` ON `daily_incidence_summaries` (`referenceDate`);--> statement-breakpoint
CREATE INDEX `nc_source_entry_idx` ON `nonconformities` (`sourceEntryId`);