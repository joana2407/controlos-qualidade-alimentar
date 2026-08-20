CREATE TABLE `bphf_inspection_employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`bphf_employee_active` enum('true','false') NOT NULL DEFAULT 'true',
	`createdBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bphf_inspection_employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `bphf_inspection_employees_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `bphf_employee_active_idx` ON `bphf_inspection_employees` (`bphf_employee_active`);