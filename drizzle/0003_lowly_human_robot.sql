CREATE TABLE `product_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`productId` int NOT NULL,
	`sourceUrl` text NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`url` text NOT NULL,
	`altText` varchar(500),
	`isPrimary` int NOT NULL DEFAULT 0,
	`createdAtMs` bigint NOT NULL,
	CONSTRAINT `product_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`crawlJobId` int,
	`sourcePageId` int,
	`name` varchar(300) NOT NULL,
	`dedupeKey` varchar(64) NOT NULL,
	`sku` varchar(180),
	`category` varchar(240),
	`description` text,
	`productUrl` text NOT NULL,
	`price` varchar(80),
	`currency` varchar(16),
	`specifications` json NOT NULL,
	`provenance` json NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedByUserId` int,
	`reviewedAtMs` bigint,
	`createdAtMs` bigint NOT NULL,
	`updatedAtMs` bigint NOT NULL,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_organization_dedupe_unique` UNIQUE(`organizationId`,`dedupeKey`)
);
--> statement-breakpoint
CREATE TABLE `website_crawl_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`sourceUrl` text NOT NULL,
	`sourceOrigin` varchar(500) NOT NULL,
	`status` enum('queued','discovering','crawling','analyzing','review_ready','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`discoveredUrls` json NOT NULL,
	`cursor` int NOT NULL DEFAULT 0,
	`pagesDiscovered` int NOT NULL DEFAULT 0,
	`pagesProcessed` int NOT NULL DEFAULT 0,
	`maxPages` int NOT NULL DEFAULT 100,
	`brandDraft` json,
	`errorMessage` text,
	`createdByUserId` int NOT NULL,
	`createdAtMs` bigint NOT NULL,
	`updatedAtMs` bigint NOT NULL,
	`completedAtMs` bigint,
	CONSTRAINT `website_crawl_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `website_crawl_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`jobId` int NOT NULL,
	`url` text NOT NULL,
	`urlHash` varchar(64) NOT NULL,
	`canonicalUrl` text,
	`title` varchar(500),
	`pageType` enum('home','product','collection','about','contact','other') NOT NULL DEFAULT 'other',
	`textContent` text,
	`metadata` json,
	`colors` json NOT NULL,
	`fonts` json NOT NULL,
	`imageUrls` json NOT NULL,
	`contentHash` varchar(64),
	`status` enum('fetched','analyzed','failed') NOT NULL DEFAULT 'fetched',
	`errorMessage` text,
	`fetchedAtMs` bigint NOT NULL,
	CONSTRAINT `website_crawl_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `website_crawl_page_unique` UNIQUE(`jobId`,`urlHash`)
);
--> statement-breakpoint
ALTER TABLE `campaign_briefs` ADD `productIds` json;--> statement-breakpoint
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_crawlJobId_website_crawl_jobs_id_fk` FOREIGN KEY (`crawlJobId`) REFERENCES `website_crawl_jobs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_sourcePageId_website_crawl_pages_id_fk` FOREIGN KEY (`sourcePageId`) REFERENCES `website_crawl_pages`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `website_crawl_jobs` ADD CONSTRAINT `website_crawl_jobs_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `website_crawl_jobs` ADD CONSTRAINT `website_crawl_jobs_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `website_crawl_pages` ADD CONSTRAINT `website_crawl_pages_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `website_crawl_pages` ADD CONSTRAINT `website_crawl_pages_jobId_website_crawl_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `website_crawl_jobs`(`id`) ON DELETE no action ON UPDATE no action;