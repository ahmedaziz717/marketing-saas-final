import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { channelConnections } from "../../drizzle/channelSchema";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
/** Analytics-only account lookup. Social publishing keeps its stricter channel guard. */
export async function getOptimizationConnection(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  id: string
) {
  const row = (
    await db
      .select()
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.organizationId, organizationId),
          eq(channelConnections.id, id),
          inArray(channelConnections.channel, ["meta_ads", "google_ads"])
        )
      )
      .limit(1)
  )[0];
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Advertising account not found in this workspace.",
    });
  return row;
}
