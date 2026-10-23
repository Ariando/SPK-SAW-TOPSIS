CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(64) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime,
	`refresh_token_expires_at` datetime,
	`scope` text,
	`password` varchar(255),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alternatives` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`title` varchar(255) NOT NULL,
	`student_name` varchar(160) NOT NULL,
	`nim` varchar(24) NOT NULL,
	`concentration` varchar(120),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `alternatives_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_alternatives_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `computation_results` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`run_id` bigint unsigned NOT NULL,
	`alternative_id` bigint unsigned NOT NULL,
	`score` decimal(20,10) NOT NULL,
	`rank_no` int NOT NULL,
	`tied` boolean NOT NULL DEFAULT false,
	CONSTRAINT `computation_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_results_run_alt` UNIQUE(`run_id`,`alternative_id`)
);
--> statement-breakpoint
CREATE TABLE `computation_runs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`method` varchar(24) NOT NULL,
	`snapshot` json NOT NULL,
	`snapshot_hash` char(64) NOT NULL,
	`note` varchar(255),
	`created_by` varchar(36) NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `computation_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `criteria` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(8) NOT NULL,
	`name` varchar(160) NOT NULL,
	`weight` decimal(10,4) NOT NULL,
	`direction` enum('benefit','cost') NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `criteria_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_criteria_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `rubrics` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`criterion_id` bigint unsigned NOT NULL,
	`label` varchar(160) NOT NULL,
	`value` decimal(12,4) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `rubrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scores` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`alternative_id` bigint unsigned NOT NULL,
	`criterion_id` bigint unsigned NOT NULL,
	`rubric_id` bigint unsigned,
	`value` decimal(12,4) NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `scores_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_scores_pair` UNIQUE(`alternative_id`,`criterion_id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires_at` datetime NOT NULL,
	`ip_address` varchar(64),
	`user_agent` text,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_session_token` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`key_name` varchar(64) NOT NULL,
	`value` text,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_settings_key` UNIQUE(`key_name`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(160) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`username` varchar(60),
	`display_username` varchar(60),
	`role` enum('admin','viewer') NOT NULL DEFAULT 'viewer',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_email` UNIQUE(`email`),
	CONSTRAINT `uq_user_username` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_account_user` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_alternatives_active` ON `alternatives` (`is_active`);--> statement-breakpoint
CREATE INDEX `ix_results_run` ON `computation_results` (`run_id`);--> statement-breakpoint
CREATE INDEX `ix_runs_method` ON `computation_runs` (`method`);--> statement-breakpoint
CREATE INDEX `ix_runs_created_at` ON `computation_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_rubrics_criterion` ON `rubrics` (`criterion_id`);--> statement-breakpoint
CREATE INDEX `ix_session_user` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_verification_identifier` ON `verification` (`identifier`);