CREATE TABLE `checklist_item_factories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checklistItemId` int NOT NULL,
	`factoryId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checklist_item_factories_id` PRIMARY KEY(`id`),
	CONSTRAINT `checklist_item_factory_unique` UNIQUE(`checklistItemId`,`factoryId`)
);
--> statement-breakpoint
CREATE INDEX `checklist_item_factory_idx` ON `checklist_item_factories` (`factoryId`);
--> statement-breakpoint
INSERT INTO `checklist_item_factories` (`checklistItemId`, `factoryId`)
SELECT `id`, `factoryId` FROM `checklist_items` WHERE `factoryId` IN (1, 2, 3);
