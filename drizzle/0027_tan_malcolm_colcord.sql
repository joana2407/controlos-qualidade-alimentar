CREATE TABLE `daily_report_archive_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`archiveId` int NOT NULL,
	`profileId` int NOT NULL,
	`viewedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_report_archive_views_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_report_archive_view_unique` UNIQUE(`archiveId`,`profileId`)
);
--> statement-breakpoint
CREATE INDEX `daily_report_archive_view_profile_idx` ON `daily_report_archive_views` (`profileId`);