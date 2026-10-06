CREATE TABLE `dispatch_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`operationalDate` date NOT NULL,
	`dispatch_order_profile` enum('ambiente','congelado') NOT NULL,
	`orderNumber` varchar(80) NOT NULL,
	`customer` varchar(160) NOT NULL,
	`deliveryNote` varchar(120),
	`orderItems` json NOT NULL,
	`sourceDocument` json,
	`dispatch_order_status` enum('pending','verified','cancelled') NOT NULL DEFAULT 'pending',
	`verifiedAt` timestamp,
	`verifiedByProfileId` int,
	`verifiedByName` varchar(160),
	`createdByProfileId` int NOT NULL,
	`createdByName` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dispatch_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `dispatch_order_date_number_idx` UNIQUE(`operationalDate`,`orderNumber`)
);
--> statement-breakpoint
CREATE INDEX `dispatch_order_date_idx` ON `dispatch_orders` (`operationalDate`);--> statement-breakpoint
CREATE INDEX `dispatch_order_status_idx` ON `dispatch_orders` (`dispatch_order_status`);