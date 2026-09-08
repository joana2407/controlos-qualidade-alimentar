CREATE TABLE `bphf_employee_merges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceEmployeeId` int NOT NULL,
	`targetEmployeeId` int NOT NULL,
	`sourceName` varchar(160) NOT NULL,
	`targetName` varchar(160) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`affectedEntries` int NOT NULL DEFAULT 0,
	`mergedBy` varchar(64) NOT NULL,
	`mergedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bphf_employee_merges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `bphf_merge_source_idx` ON `bphf_employee_merges` (`sourceEmployeeId`);--> statement-breakpoint
CREATE INDEX `bphf_merge_target_idx` ON `bphf_employee_merges` (`targetEmployeeId`);