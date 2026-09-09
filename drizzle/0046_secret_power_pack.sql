ALTER TABLE `rd_sensory_evaluations` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `rd_sensory_evaluations` ADD `updatedByProfileId` int;--> statement-breakpoint
ALTER TABLE `rd_sensory_evaluations` ADD `updatedByName` varchar(160);