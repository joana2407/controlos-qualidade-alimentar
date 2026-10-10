CREATE TABLE `incidence_theme_merges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceThemeId` int NOT NULL,
	`targetThemeId` int NOT NULL,
	`sourceName` varchar(160) NOT NULL,
	`targetName` varchar(160) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`affectedEntries` int NOT NULL DEFAULT 0,
	`mergedBy` varchar(64) NOT NULL,
	`mergedByName` varchar(160),
	`mergedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incidence_theme_merges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `incidence_themes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`incidence_theme_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdByProfileId` int,
	`createdByName` varchar(160),
	`updatedBy` varchar(64),
	`updatedByProfileId` int,
	`updatedByName` varchar(160),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `incidence_themes_id` PRIMARY KEY(`id`),
	CONSTRAINT `incidence_themes_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `incidence_theme_merge_source_idx` ON `incidence_theme_merges` (`sourceThemeId`);--> statement-breakpoint
CREATE INDEX `incidence_theme_merge_target_idx` ON `incidence_theme_merges` (`targetThemeId`);--> statement-breakpoint
CREATE INDEX `incidence_theme_active_idx` ON `incidence_themes` (`incidence_theme_active`);--> statement-breakpoint
CREATE INDEX `incidence_theme_name_idx` ON `incidence_themes` (`name`);