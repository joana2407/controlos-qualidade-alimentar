CREATE TABLE `rd_sensory_evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`evaluatedAt` timestamp NOT NULL,
	`lifeDay` int NOT NULL,
	`tasterProfileId` int,
	`tasterName` varchar(160) NOT NULL,
	`appearanceScore` int NOT NULL,
	`aftertasteScore` int NOT NULL,
	`colourScore` int NOT NULL,
	`smellScore` int NOT NULL,
	`textureScore` int NOT NULL,
	`flavourScore` int NOT NULL,
	`weightedScore` int NOT NULL,
	`observations` text,
	`suggestions` text,
	`createdByProfileId` int NOT NULL,
	`createdByName` varchar(160) NOT NULL,
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rd_sensory_evaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rd_sensory_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`title` varchar(180) NOT NULL,
	`product` varchar(180) NOT NULL,
	`productionLot` varchar(100),
	`productionDate` date,
	`intendedShelfLifeDays` int,
	`intendedExpiryDate` date,
	`rd_sensory_project_status` enum('active','closed') NOT NULL DEFAULT 'active',
	`finalScore` int,
	`finalAssessment` text,
	`closingNotes` text,
	`closedAt` timestamp,
	`closedByProfileId` int,
	`closedByName` varchar(160),
	`createdByProfileId` int NOT NULL,
	`createdByName` varchar(160) NOT NULL,
	`createdByTitle` varchar(160) NOT NULL,
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rd_sensory_projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `rd_sensory_projects_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE INDEX `rd_sensory_evaluation_project_idx` ON `rd_sensory_evaluations` (`projectId`);--> statement-breakpoint
CREATE INDEX `rd_sensory_evaluation_date_idx` ON `rd_sensory_evaluations` (`evaluatedAt`);--> statement-breakpoint
CREATE INDEX `rd_sensory_evaluation_taster_idx` ON `rd_sensory_evaluations` (`tasterProfileId`);--> statement-breakpoint
CREATE INDEX `rd_sensory_project_status_idx` ON `rd_sensory_projects` (`rd_sensory_project_status`);--> statement-breakpoint
CREATE INDEX `rd_sensory_project_product_idx` ON `rd_sensory_projects` (`product`);--> statement-breakpoint
CREATE INDEX `rd_sensory_project_created_idx` ON `rd_sensory_projects` (`createdAt`);