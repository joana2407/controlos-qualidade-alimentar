CREATE TABLE `daily_report_archive_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`daily_report_archive_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `daily_report_archive_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `daily_report_archives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationalDate` date NOT NULL,
	`revision` int NOT NULL,
	`daily_report_archive_kind` enum('initial','retroactive_revision') NOT NULL,
	`triggerTaskId` int,
	`triggerEntryId` int,
	`revisionReason` varchar(500),
	`snapshot` json NOT NULL,
	`createdBy` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_report_archives_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_report_archive_date_revision_idx` UNIQUE(`operationalDate`,`revision`)
);
--> statement-breakpoint
CREATE INDEX `daily_report_archive_cron_idx` ON `daily_report_archive_settings` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `daily_report_archive_date_idx` ON `daily_report_archives` (`operationalDate`);--> statement-breakpoint
CREATE INDEX `daily_report_archive_task_idx` ON `daily_report_archives` (`triggerTaskId`);