CREATE TABLE `activity_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`action` varchar(120) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` varchar(120) NOT NULL,
	`outcome` enum('success','failure') NOT NULL DEFAULT 'success',
	`payload` json,
	`correlationId` varchar(96) NOT NULL,
	`createdAtMs` bigint NOT NULL,
	CONSTRAINT `activity_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `brand_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`brandKitId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`type` enum('logo','font','product','reference','other') NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`url` text NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`metadata` json,
	`uploadedByUserId` int NOT NULL,
	`reviewedByUserId` int,
	`reviewedAtMs` bigint,
	`createdAtMs` bigint NOT NULL,
	CONSTRAINT `brand_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `brand_kits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`voice` text,
	`colors` json NOT NULL,
	`fonts` json NOT NULL,
	`requiredClaims` text,
	`prohibitedContent` text,
	`status` enum('draft','active') NOT NULL DEFAULT 'draft',
	`updatedByUserId` int NOT NULL,
	`updatedAtMs` bigint NOT NULL,
	CONSTRAINT `brand_kits_id` PRIMARY KEY(`id`),
	CONSTRAINT `brand_kit_organization_unique` UNIQUE(`organizationId`)
);
--> statement-breakpoint
CREATE TABLE `campaign_briefs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`audience` text NOT NULL,
	`offer` text NOT NULL,
	`channel` enum('meta') NOT NULL DEFAULT 'meta',
	`placements` json NOT NULL,
	`formats` json NOT NULL,
	`creativeDirection` text NOT NULL,
	`destinationUrl` text,
	`requiredClaims` text,
	`assetIds` json NOT NULL,
	`status` enum('draft','in_review','approved','rejected') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`approvedByUserId` int,
	`approvedAtMs` bigint,
	`createdAtMs` bigint NOT NULL,
	`updatedAtMs` bigint NOT NULL,
	CONSTRAINT `campaign_briefs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `creative_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`briefId` int NOT NULL,
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`inputHash` varchar(64) NOT NULL,
	`briefSnapshot` json NOT NULL,
	`assetSnapshot` json NOT NULL,
	`requestedByUserId` int NOT NULL,
	`errorMessage` text,
	`createdAtMs` bigint NOT NULL,
	`completedAtMs` bigint,
	CONSTRAINT `creative_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `creative_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`jobId` int NOT NULL,
	`briefId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`concept` text NOT NULL,
	`primaryText` text NOT NULL,
	`headline` varchar(255) NOT NULL,
	`description` text,
	`callToAction` varchar(64) NOT NULL,
	`format` varchar(64) NOT NULL,
	`imageUrl` text NOT NULL,
	`imageStorageKey` varchar(500),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedByUserId` int,
	`reviewedAtMs` bigint,
	`createdAtMs` bigint NOT NULL,
	CONSTRAINT `creative_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meta_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`adAccountId` varchar(100) NOT NULL,
	`pageId` varchar(100),
	`instagramActorId` varchar(100),
	`accessTokenCiphertext` text,
	`tokenIv` varchar(64),
	`tokenTag` varchar(64),
	`status` enum('disconnected','connected','error') NOT NULL DEFAULT 'disconnected',
	`connectedByUserId` int NOT NULL,
	`connectedAtMs` bigint,
	`updatedAtMs` bigint NOT NULL,
	CONSTRAINT `meta_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `meta_connection_organization_unique` UNIQUE(`organizationId`)
);
--> statement-breakpoint
CREATE TABLE `organization_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('admin','creator','reviewer','publisher') NOT NULL,
	`token` varchar(96) NOT NULL,
	`status` enum('pending','accepted','revoked') NOT NULL DEFAULT 'pending',
	`invitedByUserId` int NOT NULL,
	`expiresAtMs` bigint NOT NULL,
	`createdAtMs` bigint NOT NULL,
	CONSTRAINT `organization_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_invite_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `organization_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','creator','reviewer','publisher') NOT NULL,
	`status` enum('invited','active','suspended') NOT NULL DEFAULT 'active',
	`createdAtMs` bigint NOT NULL,
	CONSTRAINT `organization_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_member_unique` UNIQUE(`organizationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(180) NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAtMs` bigint NOT NULL,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `publish_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`variantId` int NOT NULL,
	`connectionId` int NOT NULL,
	`action` enum('create','update') NOT NULL,
	`payload` json NOT NULL,
	`payloadHash` varchar(64) NOT NULL,
	`approvedHash` varchar(64),
	`status` enum('draft','awaiting_approval','approved','publishing','published','failed','cancelled') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`approvedByUserId` int,
	`publishedByUserId` int,
	`metaObjectId` varchar(150),
	`result` json,
	`approvedAtMs` bigint,
	`createdAtMs` bigint NOT NULL,
	`updatedAtMs` bigint NOT NULL,
	CONSTRAINT `publish_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `review_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`briefId` int,
	`variantId` int,
	`body` text NOT NULL,
	`status` enum('open','resolved') NOT NULL DEFAULT 'open',
	`authorUserId` int NOT NULL,
	`createdAtMs` bigint NOT NULL,
	CONSTRAINT `review_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activity_events` ADD CONSTRAINT `activity_events_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_events` ADD CONSTRAINT `activity_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `brand_assets` ADD CONSTRAINT `brand_assets_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `brand_assets` ADD CONSTRAINT `brand_assets_brandKitId_brand_kits_id_fk` FOREIGN KEY (`brandKitId`) REFERENCES `brand_kits`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `brand_assets` ADD CONSTRAINT `brand_assets_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `brand_assets` ADD CONSTRAINT `brand_assets_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `brand_kits` ADD CONSTRAINT `brand_kits_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `brand_kits` ADD CONSTRAINT `brand_kits_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_briefs` ADD CONSTRAINT `campaign_briefs_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_briefs` ADD CONSTRAINT `campaign_briefs_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `campaign_briefs` ADD CONSTRAINT `campaign_briefs_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_jobs` ADD CONSTRAINT `creative_jobs_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_jobs` ADD CONSTRAINT `creative_jobs_briefId_campaign_briefs_id_fk` FOREIGN KEY (`briefId`) REFERENCES `campaign_briefs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_jobs` ADD CONSTRAINT `creative_jobs_requestedByUserId_users_id_fk` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_variants` ADD CONSTRAINT `creative_variants_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_variants` ADD CONSTRAINT `creative_variants_jobId_creative_jobs_id_fk` FOREIGN KEY (`jobId`) REFERENCES `creative_jobs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_variants` ADD CONSTRAINT `creative_variants_briefId_campaign_briefs_id_fk` FOREIGN KEY (`briefId`) REFERENCES `campaign_briefs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `creative_variants` ADD CONSTRAINT `creative_variants_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meta_connections` ADD CONSTRAINT `meta_connections_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `meta_connections` ADD CONSTRAINT `meta_connections_connectedByUserId_users_id_fk` FOREIGN KEY (`connectedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_invites` ADD CONSTRAINT `organization_invites_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_invites` ADD CONSTRAINT `organization_invites_invitedByUserId_users_id_fk` FOREIGN KEY (`invitedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publish_requests` ADD CONSTRAINT `publish_requests_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publish_requests` ADD CONSTRAINT `publish_requests_variantId_creative_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `creative_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publish_requests` ADD CONSTRAINT `publish_requests_connectionId_meta_connections_id_fk` FOREIGN KEY (`connectionId`) REFERENCES `meta_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publish_requests` ADD CONSTRAINT `publish_requests_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publish_requests` ADD CONSTRAINT `publish_requests_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publish_requests` ADD CONSTRAINT `publish_requests_publishedByUserId_users_id_fk` FOREIGN KEY (`publishedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_comments` ADD CONSTRAINT `review_comments_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_comments` ADD CONSTRAINT `review_comments_briefId_campaign_briefs_id_fk` FOREIGN KEY (`briefId`) REFERENCES `campaign_briefs`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_comments` ADD CONSTRAINT `review_comments_variantId_creative_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `creative_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `review_comments` ADD CONSTRAINT `review_comments_authorUserId_users_id_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;