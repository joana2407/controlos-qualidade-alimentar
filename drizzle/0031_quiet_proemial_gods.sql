CREATE TABLE `checklist_item_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`checklistItemId` int NOT NULL,
	`checklistAreaId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checklist_item_areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `checklist_item_area_unique` UNIQUE(`checklistItemId`,`checklistAreaId`)
);
--> statement-breakpoint
CREATE INDEX `checklist_item_area_item_idx` ON `checklist_item_areas` (`checklistItemId`);--> statement-breakpoint
CREATE INDEX `checklist_item_area_area_idx` ON `checklist_item_areas` (`checklistAreaId`);
--> statement-breakpoint
INSERT IGNORE INTO `checklist_item_areas` (`checklistItemId`, `checklistAreaId`)
SELECT item.id, area.id
FROM `checklist_items` AS item
INNER JOIN `checklist_areas` AS area ON area.name = item.area
WHERE item.active = 'true' AND area.`checklist_area_active` = 'true';
