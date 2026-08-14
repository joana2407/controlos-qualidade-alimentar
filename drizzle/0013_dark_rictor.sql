CREATE TABLE `occurrence_access_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`qualityProfileId` int NOT NULL,
	`occurrence_access_role` enum('user','admin','gestao') NOT NULL DEFAULT 'user',
	`occurrence_access_scope` enum('all','reclamacoes') NOT NULL DEFAULT 'all',
	`updatedBy` varchar(64) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `occurrence_access_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `occurrence_access_profiles_qualityProfileId_unique` UNIQUE(`qualityProfileId`)
);
--> statement-breakpoint
CREATE INDEX `occurrence_access_scope_idx` ON `occurrence_access_profiles` (`occurrence_access_scope`);