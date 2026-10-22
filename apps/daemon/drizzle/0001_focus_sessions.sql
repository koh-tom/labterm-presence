CREATE TABLE `focus_sessions` (
	`device_id` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`sec` integer NOT NULL,
	`done` integer NOT NULL,
	`received_at` integer NOT NULL,
	PRIMARY KEY(`device_id`, `start`)
);
--> statement-breakpoint
CREATE INDEX `focus_sessions_end` ON `focus_sessions` (`end`);