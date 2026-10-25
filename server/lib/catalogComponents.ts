import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  catalogSources,
  products,
  productImages,
  productComponents,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
import { stableHash } from "./policy";
import { appendActivity, withOrganizationTransaction } from "./activity";
import { requireOrganizationRole } from "./access";
import type { CatalogMediaGroupSummary } from "../../shared/catalogMedia";

type DB = LibraryDatabase | LibraryTransaction;
export const componentIdentity = (sourceId: number, sourceCode: string) =>
  stableHash({ sourceId, componentCode: sourceCode });
export const componentGroupHash = (group: CatalogMediaGroupSummary) =>
  stableHash(group);

/** Uses imported source metadata and original image rows only. No fetch, upload or model calls. */
async function componentPlan(
  db: DB,
  organizationId: number,
  productId: number,
  lock = false
) {
  const parentQuery = db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.organizationId, organizationId)
      )
    )
    .limit(1);
  const [parent] = await (lock ? parentQuery.for("update") : parentQuery);
  if (!parent?.sourceId || parent.provenance["component.sourceCode"])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Choose a source-owned system in this workspace.",
    });
  const [source] = await db
    .select()
    .from(catalogSources)
    .where(
      and(
        eq(catalogSources.id, parent.sourceId),
        eq(catalogSources.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!source)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Source unavailable in this workspace.",
    });
  const chosen = (parent.mediaGroups ?? []).filter(
    g => g.role !== "system" && g.eligible
  );
  if (!chosen.length)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This product has no eligible imported component galleries.",
    });
  if (chosen.some(g => !g.component))
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Refresh this source's galleries to capture exact component identities before creating separate cards. Existing images are preserved.",
    });
  const codes = new Set(chosen.map(g => g.component!.sourceCode));
  const parentsQuery = db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.sourceId, parent.sourceId),
        sql`${products.provenance}->>'component.sourceCode' is null`
      )
    )
    .orderBy(products.id)
    .limit(501);
  const parents = await (lock ? parentsQuery.for("update") : parentsQuery);
  if (parents.length > 500)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Component review is limited to 500 source products. Split this source before converting components.",
    });
  const relationships = parents
    .filter(p => !p.provenance["component.sourceCode"])
    .flatMap(p =>
      (p.mediaGroups ?? [])
        .filter(
          g =>
            g.role !== "system" &&
            g.eligible &&
            g.component &&
            codes.has(g.component.sourceCode)
        )
        .map(group => ({ parent: p, group }))
    );
  const parentIds = Array.from(new Set(relationships.map(r => r.parent.id)));
  const imagesQuery = db
    .select()
    .from(productImages)
    .where(
      and(
        eq(productImages.organizationId, organizationId),
        inArray(productImages.productId, parentIds)
      )
    );
  const images = await (lock ? imagesQuery.for("update") : imagesQuery);
  const components = Array.from(codes).map(code => {
    const links = relationships.filter(
      r => r.group.component!.sourceCode === code
    );
    const kinds = new Set(links.map(r => r.group.component!.kind));
    if (kinds.size !== 1)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Source component ${code} has conflicting types; correct the source mapping first.`,
      });
    const views = links.flatMap(link =>
      images
        .filter(
          i =>
            i.productId === link.parent.id &&
            !i.media?.retired &&
            i.media?.references.some(
              ref =>
                ref.groupId === link.group.id &&
                (!link.group.imageIds ||
                  link.group.imageIds.includes(ref.imageId))
            )
        )
        .map(image => ({ image, link }))
    );
    if (!views.length)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Component ${code} needs verified original images of at least 600 × 600; refresh its gallery first.`,
      });
    // Same source view identity may occur under multiple parent systems. Retain highest resolution.
    const unique = new Map<string, (typeof views)[number]>();
    for (const view of views) {
      const ref = view.image.media!.references.find(
        r => r.groupId === view.link.group.id
      )!;
      const old = unique.get(ref.imageId);
      if (
        !old ||
        old.image.media!.width * old.image.media!.height <
          view.image.media!.width * view.image.media!.height
      )
        unique.set(ref.imageId, view);
    }
    const declared = Math.max(
      ...links.map(l =>
        Math.max(l.group.declaredImages, l.group.expectedCount ?? 0)
      )
    );
    if (unique.size < declared)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Component ${code} gallery is incomplete. Refresh its original views first.`,
      });
    if (
      Array.from(unique.values()).some(
        v => Math.min(v.image.media!.width, v.image.media!.height) < 600
      )
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Component ${code} needs verified originals of at least 600 � 600; refresh its gallery first.`,
      });
    return {
      code,
      kind: links[0].group.component!.kind,
      name: links[0].group.name,
      links,
      views: Array.from(unique.entries()).map(([viewId, value]) => ({
        viewId,
        ...value,
      })),
      key: componentIdentity(parent.sourceId!, code),
    };
  });
  return {
    sourceId: parent.sourceId,
    components,
    hash: stableHash({
      parentId: productId,
      components: components.map(c => ({
        code: c.code,
        kind: c.kind,
        links: c.links.map(l => ({
          parentId: l.parent.id,
          revision: l.parent.updatedAtMs,
          group: l.group,
        })),
        views: c.views.map(v => ({
          id: v.image.id,
          url: v.image.url,
          media: v.image.media,
        })),
      })),
    }),
  };
}
export async function previewCatalogComponents(
  db: DB,
  organizationId: number,
  productId: number
) {
  const plan = await componentPlan(db, organizationId, productId);
  return {
    hash: plan.hash,
    components: plan.components.map(c => ({
      code: c.code,
      kind: c.kind,
      name: c.name,
      imageCount: c.views.length,
      previewUrl: c.views[0].image.url,
      minimumWidth: Math.min(...c.views.map(v => v.image.media!.width)),
      minimumHeight: Math.min(...c.views.map(v => v.image.media!.height)),
      parents: c.links.map(l => ({
        id: l.parent.id,
        name: l.parent.name,
        role: l.group.role,
        amount: l.group.component!.optionAmount ?? null,
        meaning: l.group.component!.amountMeaning,
      })),
    })),
  };
}
export async function createCatalogComponents(
  organizationId: number,
  productId: number,
  reviewedHash: string,
  userId: number
) {
  await requireOrganizationRole(userId, organizationId, [
    "owner",
    "admin",
    "creator",
  ]);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return withOrganizationTransaction(db, organizationId, async tx => {
    const plan = await componentPlan(tx, organizationId, productId, true);
    if (plan.hash !== reviewedHash)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Source products or images changed. Review the component cards again.",
      });
    const ids: number[] = [];
    for (const c of plan.components) {
      const existing = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.organizationId, organizationId),
            eq(products.dedupeKey, c.key)
          )
        )
        .limit(1);
      let component = existing[0];
      if (
        component &&
        (component.sourceId !== plan.sourceId ||
          component.provenance["component.sourceCode"] !== c.code)
      )
        throw new Error("Component identity conflict");
      if (!component)
        [component] = await tx
          .insert(products)
          .values({
            organizationId,
            dedupeKey: c.key,
            sourceId: plan.sourceId,
            externalId: `component:${c.key}`,
            sku: c.code,
            name: `${c.kind}: ${c.name}`.slice(0, 300),
            recordType: "accessory",
            description: `${c.kind} component only. Not a complete system. Compatible system relationships do not imply included hardware or a standalone sale price.`,
            productUrl: "",
            price: null,
            currency: null,
            specifications: {
              "Component type": c.kind,
              "Source component code": c.code,
            },
            features: [],
            provenance: {
              "component.sourceCode": c.code,
              "component.kind": c.kind,
              source: "component_gallery",
            },
            mediaGroups: [],
            status: "pending",
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          })
          .returning();
      const sourceIdentity = {
        name: component.provenance.name?.startsWith("user:")
          ? component.name
          : `${c.kind}: ${c.name}`.slice(0, 300),
        description: component.provenance.description?.startsWith("user:")
          ? component.description
          : `${c.kind} component only. Not a complete system. Compatible system relationships do not imply included hardware or a standalone sale price.`,
        specifications: {
          ...component.specifications,
          "Component type": c.kind,
          "Source component code": c.code,
        },
        provenance: {
          ...component.provenance,
          "component.sourceCode": c.code,
          "component.kind": c.kind,
        },
      };
      const identityChanged = Object.entries(sourceIdentity).some(
        ([key, value]) =>
          stableHash(value) !==
          stableHash(component[key as keyof typeof component])
      );
      ids.push(component.id);
      const current = await tx
        .select()
        .from(productImages)
        .where(
          and(
            eq(productImages.organizationId, organizationId),
            eq(productImages.productId, component.id)
          )
        );
      const active: typeof current = [];
      let imagesChanged = false;
      for (const [position, view] of c.views.map(
        (view, position) => [position, view] as const
      )) {
        const existing = current.find(i =>
          i.media?.references.some(
            r => r.groupId === "component" && r.imageId === view.viewId
          )
        );
        const image = view.image;
        const values = {
          sourceUrl: image.sourceUrl,
          storageKey: image.storageKey,
          url: image.url,
          altText: image.altText,
          media: {
            ...image.media!,
            retired: false,
            references: [
              { groupId: "component", imageId: view.viewId, position },
            ],
          },
        };
        if (existing) {
          // Stable catalog row IDs preserve saved image selections across same-view source repairs.
          if (
            stableHash({
              sourceUrl: existing.sourceUrl,
              storageKey: existing.storageKey,
              url: existing.url,
              altText: existing.altText,
              media: existing.media,
            }) !== stableHash(values)
          ) {
            await tx
              .update(productImages)
              .set(values)
              .where(
                and(
                  eq(productImages.organizationId, organizationId),
                  eq(productImages.id, existing.id)
                )
              );
            imagesChanged = true;
          }
          active.push({ ...existing, ...values });
        } else {
          const [saved] = await tx
            .insert(productImages)
            .values({
              ...values,
              organizationId,
              productId: component.id,
              isPrimary: 0,
              createdAtMs: Date.now(),
            })
            .returning();
          active.push(saved);
          imagesChanged = true;
        }
      }
      const activeIds = new Set(active.map(i => i.id));
      for (const old of current) {
        if (
          !old.media?.references.some(r => r.groupId === "component") ||
          activeIds.has(old.id)
        )
          continue;
        if (!old.media.retired || old.isPrimary) {
          await tx
            .update(productImages)
            .set({ media: { ...old.media, retired: true }, isPrimary: 0 })
            .where(
              and(
                eq(productImages.organizationId, organizationId),
                eq(productImages.id, old.id)
              )
            );
          imagesChanged = true;
        }
      }
      // Preserve an existing active/manual primary. If its view was removed, choose a current original.
      const primary = current.find(
        i =>
          i.isPrimary &&
          !i.media?.retired &&
          (!i.media?.references.some(r => r.groupId === "component") ||
            activeIds.has(i.id))
      );
      if (!primary && active.length) {
        await tx
          .update(productImages)
          .set({ isPrimary: 1 })
          .where(
            and(
              eq(productImages.organizationId, organizationId),
              eq(productImages.id, active[0].id)
            )
          );
        imagesChanged = true;
      }
      const mediaGroups = [
        ...(component.mediaGroups ?? []).filter(g => g.id !== "component"),
        {
          id: "component",
          name: `${c.kind} original views`,
          role: "system" as const,
          eligible: true,
          declaredImages: c.views.length,
          imageIds: c.views.map(v => v.viewId),
        },
      ];
      if (
        identityChanged ||
        imagesChanged ||
        stableHash(mediaGroups) !== stableHash(component.mediaGroups)
      ) {
        await tx
          .update(products)
          .set({
            ...sourceIdentity,
            mediaGroups,
            updatedAtMs: Math.max(Date.now(), component.updatedAtMs + 1),
          })
          .where(
            and(
              eq(products.organizationId, organizationId),
              eq(products.id, component.id)
            )
          );
      }
      for (const link of c.links)
        await tx
          .insert(productComponents)
          .values({
            organizationId,
            parentProductId: link.parent.id,
            componentProductId: component.id,
            groupId: link.group.id,
            sourceCode: c.code,
            kind: c.kind,
            role: link.group.role,
            optionAmount: link.group.component!.optionAmount ?? null,
            amountMeaning: link.group.component!.amountMeaning,
            sourceHash: componentGroupHash(link.group),
            createdAtMs: Date.now(),
          })
          .onConflictDoUpdate({
            target: [
              productComponents.organizationId,
              productComponents.parentProductId,
              productComponents.groupId,
            ],
            set: {
              componentProductId: component.id,
              sourceCode: c.code,
              kind: c.kind,
              role: link.group.role,
              optionAmount: link.group.component!.optionAmount ?? null,
              amountMeaning: link.group.component!.amountMeaning,
              sourceHash: componentGroupHash(link.group),
            },
          });
    }
    await appendActivity(
      {
        organizationId,
        actorUserId: userId,
        action: "catalog.components.created",
        entityType: "product",
        entityId: productId,
        payload: { reviewedHash, componentIds: ids },
      },
      tx
    );
    return { componentIds: ids };
  });
}
