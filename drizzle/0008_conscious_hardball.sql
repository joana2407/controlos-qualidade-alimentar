CREATE TABLE `quality_pin_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(48) NOT NULL,
	`name` varchar(160) NOT NULL,
	`title` varchar(160) NOT NULL,
	`quality_profile_role` enum('technician','manager') NOT NULL,
	`pinHash` varchar(512),
	`quality_profile_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quality_pin_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_pin_profiles_code_unique` UNIQUE(`code`),
	CONSTRAINT `quality_pin_profiles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `quality_pin_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`profileId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`oauthOpenId` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_pin_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_pin_sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `quality_profile_role_idx` ON `quality_pin_profiles` (`quality_profile_role`);--> statement-breakpoint
CREATE INDEX `quality_session_profile_idx` ON `quality_pin_sessions` (`profileId`);--> statement-breakpoint
CREATE INDEX `quality_session_expiry_idx` ON `quality_pin_sessions` (`expiresAt`);