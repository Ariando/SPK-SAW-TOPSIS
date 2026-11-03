CREATE TABLE `pairwise_comparisons` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`scenario_id` bigint unsigned NOT NULL,
	`row_criterion_id` bigint unsigned NOT NULL,
	`col_criterion_id` bigint unsigned NOT NULL,
	`value` decimal(12,8) NOT NULL,
	CONSTRAINT `pairwise_comparisons_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_pairwise_pair` UNIQUE(`scenario_id`,`row_criterion_id`,`col_criterion_id`)
);
--> statement-breakpoint
CREATE TABLE `weight_scenarios` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`method` varchar(24) NOT NULL DEFAULT 'ahp',
	`input_hash` char(64) NOT NULL,
	`weights` json NOT NULL,
	`criteria_hash` char(64) NOT NULL,
	`lambda_max` decimal(12,8),
	`consistency_index` decimal(12,8),
	`consistency_ratio` decimal(12,8),
	`consistent` boolean NOT NULL DEFAULT false,
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `weight_scenarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_pairwise_scenario` ON `pairwise_comparisons` (`scenario_id`);--> statement-breakpoint
CREATE INDEX `ix_scenarios_method` ON `weight_scenarios` (`method`);--> statement-breakpoint
CREATE INDEX `ix_scenarios_created` ON `weight_scenarios` (`created_at`,`id`);