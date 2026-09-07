CREATE TABLE `quality_panel_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`allowedPanels` json NOT NULL,
	`updatedBy` varchar(64) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quality_panel_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_panel_access_profileId_unique` UNIQUE(`profileId`)
);
--> statement-breakpoint
CREATE INDEX `quality_panel_access_profile_idx` ON `quality_panel_access` (`profileId`);