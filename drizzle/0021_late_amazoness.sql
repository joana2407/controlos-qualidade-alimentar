ALTER TABLE `control_entries` ADD `offlineSyncId` varchar(64);--> statement-breakpoint
ALTER TABLE `control_entries` ADD CONSTRAINT `entry_offline_sync_idx` UNIQUE(`offlineSyncId`);