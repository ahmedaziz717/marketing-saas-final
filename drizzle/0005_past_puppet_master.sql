CREATE TABLE `product_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`productId` int NOT NULL,
	`sourceKey` varchar(64) NOT NULL,
	`name` varchar(500) NOT NULL,
	`sku` varchar(180),
	`price` varchar(80),
	`currency` varchar(16),
	`availability` varchar(120),
	`imageSourceUrl` text,
	`productUrl` text,
	`metadata` json,
	`createdAtMs` bigint NOT NULL,
	`updatedAtMs` bigint NOT NULL,
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_variant_source_unique` UNIQUE(`organizationId`,`productId`,`sourceKey`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `recordType` enum('family','standalone','accessory','material','software','service','bundle') DEFAULT 'standalone' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `variantCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;