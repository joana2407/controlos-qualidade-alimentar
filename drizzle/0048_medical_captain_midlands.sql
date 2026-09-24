ALTER TABLE `rd_sensory_tests` ADD `testDate` date;
--> statement-breakpoint
UPDATE `rd_sensory_tests` AS `test`
INNER JOIN `rd_sensory_projects` AS `project` ON `project`.`id` = `test`.`projectId`
SET `test`.`testDate` = COALESCE(`test`.`productionDate`, `project`.`productionDate`, DATE(`test`.`createdAt`))
WHERE `test`.`testDate` IS NULL;
--> statement-breakpoint
ALTER TABLE `rd_sensory_tests` MODIFY `testDate` date NOT NULL;
--> statement-breakpoint
ALTER TABLE `rd_sensory_tests` ADD `recipe` text;
