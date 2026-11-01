import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  brandKits,
  organizationMemberships,
  products,
  productImages,
} from "../../drizzle/schema";
import { workflowRoles } from "../../shared/creativeWorkflow";
import { getDb } from "../db";
import { membershipAuthorization } from "./access";
import { withOrganizationTransaction } from "./activity";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type McpWorkspaceReadTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export const workspaceReadInput = z
  .object({ organizationId: z.number().int().positive() })
  .strict();
export const catalogReadInput = workspaceReadInput
  .extend({
    limit: z.number().int().min(1).max(30).default(20),
    afterId: z.number().int().positive().optional(),
  })
  .strict();

// Only stored public media locations are disclosed, never source candidates,
// storage keys, credential-bearing URLs or expiring signed download URLs.
function publicImageUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      !host.includes(".") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      host.includes(":")
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

/** Explicit read DTOs only. All text is source data, never agent instructions. */
export function mcpWorkspaceRead(
  userId: number,
  authorize: (
    tx: McpWorkspaceReadTransaction,
    organizationId: number
  ) => Promise<void>
) {
  async function transaction<T>(
    organizationId: number,
    run: (tx: McpWorkspaceReadTransaction) => Promise<T>
  ) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return withOrganizationTransaction(db, organizationId, async tx => {
      const [membership] = await tx
        .select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.userId, userId)
          )
        )
        .for("share");
      if (
        !membershipAuthorization({
          membership,
          userId,
          organizationId,
          allowedRoles: [...workflowRoles],
        }).allowed
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Your active workspace membership does not permit this action.",
        });
      await authorize(tx, organizationId);
      return run(tx);
    });
  }
  return {
    async catalog(raw: unknown) {
      const input = catalogReadInput.parse(raw);
      return transaction(input.organizationId, async tx => {
        const rows = await tx
          .select({
            id: products.id,
            name: products.name,
            recordType: products.recordType,
            status: products.status,
            sourceId: products.sourceId,
            category: products.category,
            updatedAtMs: products.updatedAtMs,
            mediaGroups: products.mediaGroups,
          })
          .from(products)
          .where(
            and(
              eq(products.organizationId, input.organizationId),
              input.afterId ? gt(products.id, input.afterId) : undefined
            )
          )
          .orderBy(asc(products.id))
          .limit(input.limit + 1);
        const page = rows.slice(0, input.limit);
        const items = [];
        for (const row of page) {
          const images = await tx
            .select({
              id: productImages.id,
              url: productImages.url,
              isPrimary: productImages.isPrimary,
              media: productImages.media,
            })
            .from(productImages)
            .where(
              and(
                eq(productImages.organizationId, input.organizationId),
                eq(productImages.productId, row.id),
                sql`coalesce(${productImages.media}->>'retired', 'false') <> 'true'`
              )
            )
            .orderBy(desc(productImages.isPrimary), asc(productImages.id))
            .limit(9);
          const groups = row.mediaGroups ?? [];
          items.push({
            id: row.id,
            name: row.name,
            recordType: row.recordType,
            status: row.status,
            sourceId: row.sourceId,
            category: row.category,
            updatedAtMs: row.updatedAtMs,
            groups: groups
              .slice(0, 16)
              .map(g => ({
                id: g.id,
                name: g.name,
                role: g.role,
                eligible: g.eligible,
                referenceOnly: g.referenceOnly ?? false,
                declaredImages: g.declaredImages,
                component: g.component
                  ? {
                      sourceCode: g.component.sourceCode,
                      kind: g.component.kind,
                    }
                  : null,
              })),
            groupsTruncated: groups.length > 16,
            images: images
              .slice(0, 8)
              .map(i => ({
                id: i.id,
                url: publicImageUrl(i.url),
                isPrimary: i.isPrimary === 1,
                width: i.media?.width ?? null,
                height: i.media?.height ?? null,
                references: (i.media?.references ?? [])
                  .slice(0, 8)
                  .map(r => ({
                    groupId: r.groupId,
                    imageId: r.imageId,
                    position: r.position,
                  })),
                referencesTruncated: (i.media?.references.length ?? 0) > 8,
              })),
            imagesTruncated: images.length > 8,
          });
        }
        return {
          items,
          nextAfterId:
            rows.length > input.limit ? page[page.length - 1].id : null,
        };
      });
    },
    async brand(raw: unknown) {
      const input = workspaceReadInput.parse(raw);
      return transaction(input.organizationId, async tx => {
        const [brand] = await tx
          .select({
            id: brandKits.id,
            name: brandKits.name,
            voice: brandKits.voice,
            colors: brandKits.colors,
            fonts: brandKits.fonts,
            requiredClaims: brandKits.requiredClaims,
            prohibitedContent: brandKits.prohibitedContent,
            status: brandKits.status,
            updatedAtMs: brandKits.updatedAtMs,
          })
          .from(brandKits)
          .where(eq(brandKits.organizationId, input.organizationId))
          .limit(1);
        return {
          brand: brand
            ? {
                ...brand,
                voice: brand.voice?.slice(0, 12000) ?? null,
                colors: brand.colors.slice(0, 20),
                fonts: brand.fonts.slice(0, 10),
                requiredClaims: brand.requiredClaims?.slice(0, 6000) ?? null,
                prohibitedContent:
                  brand.prohibitedContent?.slice(0, 6000) ?? null,
              }
            : null,
        };
      });
    },
  };
}
