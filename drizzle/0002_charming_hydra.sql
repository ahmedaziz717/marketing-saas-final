ALTER TABLE `activity_events` ADD `previousHash` varchar(64);--> statement-breakpoint
ALTER TABLE `activity_events` ADD `eventHash` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `activity_events` ADD CONSTRAINT `activity_event_hash_unique` UNIQUE(`eventHash`);