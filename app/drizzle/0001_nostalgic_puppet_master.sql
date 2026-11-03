DROP INDEX `ix_runs_created_at` ON `computation_runs`;--> statement-breakpoint
CREATE INDEX `ix_runs_created_id` ON `computation_runs` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `ix_runs_method_created` ON `computation_runs` (`method`,`created_at`,`id`);