CREATE TABLE `incidence_ai_guidance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`topic` varchar(160) NOT NULL,
	`guidance` text NOT NULL,
	`createdByProfileId` int NOT NULL,
	`createdByName` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `incidence_ai_guidance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `incidence_ai_guidance_topic_idx` ON `incidence_ai_guidance` (`topic`);--> statement-breakpoint
CREATE INDEX `incidence_ai_guidance_created_idx` ON `incidence_ai_guidance` (`createdAt`);