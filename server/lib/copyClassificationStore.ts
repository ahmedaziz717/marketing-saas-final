import { sql, and, eq, inArray } from "drizzle-orm";
import { publications } from "../../drizzle/channelSchema";
import type { CopyEvidence } from "../../shared/copyEvidence";
import { optimizationRecords } from "../../drizzle/optimizationSchema";
import {
  classifyCopy,
  COPY_TAXONOMY_VERSION,
  type CopyTextInput,
} from "../../shared/copyTaxonomy";
import type { LibraryDatabase } from "./assetLibrary";
import { getConnection } from "./channelConnections";
import { stableHash } from "./policy";
import { withOrganizationTransaction } from "./activity";

export async function tagLiveCopyEvidence(
  db: LibraryDatabase,
  organizationId: number,
  evidence: CopyEvidence
) {
  const connection = await getConnection(
    db,
    organizationId,
    evidence.connectionId,
    "meta_ads"
  );
  if (connection.accountId.replace(/^act_/, "") !== evidence.accountId)
    throw new Error("Copy evidence does not match this account.");
  const authored = evidence.ads.length
    ? await db
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.organizationId, organizationId),
            eq(publications.connectionId, evidence.connectionId),
            inArray(
              publications.externalId,
              evidence.ads.map(ad => ad.id)
            )
          )
        )
    : [];
  const result = {
    ...evidence,
    ads: evidence.ads.map(ad => {
      const publication = authored.find(
        p => p.externalId === ad.id && p.result?.creativeId === ad.creativeId
      );
      const known =
        publication?.content.copyTags?.fields.subheadline.map(t => t.text) ??
        [];
      return { ...ad, copy: { ...ad.copy, subheadline: known } };
    }),
  };
  await saveCopySnapshots(
    db,
    organizationId,
    evidence.connectionId,
    result.ads,
    "live_meta",
    evidence.fetchedAtMs
  );
  return result;
}

/** Current text snapshot, separate from human-reviewed ad-level assertions. No paid calls. */
export async function saveCopySnapshots(
  db: LibraryDatabase,
  organizationId: number,
  connectionId: string,
  ads: Array<{
    id: string;
    name: string;
    copy: CopyTextInput;
    observedAtMs?: number;
  }>,
  source: "live_meta" | "imported_meta",
  observedAtMs: number
) {
  await getConnection(db, organizationId, connectionId, "meta_ads");
  if (!ads.length) return;
  const rows = Array.from(new Map(ads.map(ad => [ad.id, ad])).values()).map(
    ad => ({
      id: stableHash({
        organizationId,
        connectionId,
        kind: "copy_tags",
        adId: ad.id,
      }),
      organizationId,
      connectionId,
      kind: "copy_tags",
      remoteId: ad.id,
      grain: "snapshot",
      data: {
        name: ad.name,
        fingerprint: stableHash({
          copy: ad.copy,
          version: COPY_TAXONOMY_VERSION,
        }),
        source,
        tags: classifyCopy(ad.copy),
      },
      provenance: {
        apiVersion: "copy-taxonomy-v2",
        path: source,
        fetchedAtMs: ad.observedAtMs ?? observedAtMs,
        requestedFields: Object.keys(ad.copy),
        missingFields: [],
        fields: {},
        attribution:
          "Current copy snapshot; no asset-level performance attribution.",
        timezone: null,
        currency: null,
        granularity: "ad_copy_field_variant",
        snapshotOnly: true,
      },
      updatedAtMs: ad.observedAtMs ?? observedAtMs,
    })
  );
  await withOrganizationTransaction(db, organizationId, async tx => {
    await tx
      .insert(optimizationRecords)
      .values(rows)
      .onConflictDoUpdate({
        target: optimizationRecords.id,
        set: {
          data: sql`excluded.data`,
          provenance: sql`excluded.provenance`,
          updatedAtMs: sql`excluded."updatedAtMs"`,
        },
        setWhere: sql`${optimizationRecords.updatedAtMs} <= excluded."updatedAtMs"`,
      });
  });
}
