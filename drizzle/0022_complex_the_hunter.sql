ALTER TABLE `fragile_items` ADD `createdByProfileId` int;--> statement-breakpoint
ALTER TABLE `fragile_items` ADD `createdByName` varchar(160);--> statement-breakpoint
ALTER TABLE `fragile_items` ADD `updatedBy` varchar(64);--> statement-breakpoint
ALTER TABLE `fragile_items` ADD `updatedByProfileId` int;--> statement-breakpoint
ALTER TABLE `fragile_items` ADD `updatedByName` varchar(160);--> statement-breakpoint
ALTER TABLE `fragile_items` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;