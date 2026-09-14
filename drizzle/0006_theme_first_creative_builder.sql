ALTER TABLE `campaign_briefs` MODIFY COLUMN `channel` enum('meta','google_display','microsoft','multi_channel') NOT NULL DEFAULT 'meta';--> statement-breakpoint
ALTER TABLE `campaign_briefs` ADD `creativeSetup` json;--> statement-breakpoint
ALTER TABLE `creative_jobs` ADD `leaseExpiresAtMs` bigint;--> statement-breakpoint
ALTER TABLE `creative_variants` ADD `channel` enum('meta','google_display','microsoft') DEFAULT 'meta' NOT NULL;--> statement-breakpoint
ALTER TABLE `creative_variants` ADD `renderMetadata` json;