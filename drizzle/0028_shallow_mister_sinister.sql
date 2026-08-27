ALTER TABLE `daily_report_archives` ADD `backupFileKey` varchar(512);--> statement-breakpoint
ALTER TABLE `daily_report_archives` ADD `backupFileUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `daily_report_archives` ADD `backupGeneratedAt` timestamp;--> statement-breakpoint
ALTER TABLE `daily_report_archives` ADD `backupSizeBytes` int;--> statement-breakpoint
CREATE INDEX `daily_report_archive_backup_idx` ON `daily_report_archives` (`backupGeneratedAt`);