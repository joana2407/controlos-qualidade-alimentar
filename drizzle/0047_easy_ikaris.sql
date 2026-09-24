CREATE TABLE `rd_sensory_tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`code` varchar(80) NOT NULL,
	`title` varchar(180) NOT NULL,
	`formulation` varchar(180),
	`productionLot` varchar(100),
	`productionDate` date,
	`intendedShelfLifeDays` int,
	`intendedExpiryDate` date,
	`rd_sensory_test_status` enum('active','closed') NOT NULL DEFAULT 'active',
	`finalScore` int,
	`finalAssessment` text,
	`closingNotes` text,
	`closedAt` timestamp,
	`closedByProfileId` int,
	`closedByName` varchar(160),
	`createdByProfileId` int NOT NULL,
	`createdByName` varchar(160) NOT NULL,
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deletedAt` timestamp,
	`deletedByProfileId` int,
	`deletedByName` varchar(160),
	CONSTRAINT `rd_sensory_tests_id` PRIMARY KEY(`id`),
	CONSTRAINT `rd_sensory_tests_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `rd_sensory_evaluations` ADD `testId` int;--> statement-breakpoint
CREATE INDEX `rd_sensory_test_project_idx` ON `rd_sensory_tests` (`projectId`);--> statement-breakpoint
CREATE INDEX `rd_sensory_test_status_idx` ON `rd_sensory_tests` (`rd_sensory_test_status`);--> statement-breakpoint
CREATE INDEX `rd_sensory_test_created_idx` ON `rd_sensory_tests` (`createdAt`);--> statement-breakpoint
CREATE INDEX `rd_sensory_evaluation_test_idx` ON `rd_sensory_evaluations` (`testId`);