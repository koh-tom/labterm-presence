CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `device_sync` (
	`device_id` text NOT NULL,
	`gen` integer NOT NULL,
	`last_seq` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`fw` text,
	PRIMARY KEY(`device_id`, `gen`)
);
--> statement-breakpoint
CREATE TABLE `presence_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`state` text,
	`voids` text,
	`device_id` text NOT NULL,
	`gen` integer NOT NULL,
	`seq` integer NOT NULL,
	`device_epoch` integer NOT NULL,
	`received_at` integer NOT NULL,
	`effective_at` integer NOT NULL,
	`source` text NOT NULL,
	`flags` text DEFAULT '[]' NOT NULL,
	`raw` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presence_events_device_seq` ON `presence_events` (`device_id`,`gen`,`seq`);--> statement-breakpoint
CREATE INDEX `presence_events_effective_at` ON `presence_events` (`effective_at`);