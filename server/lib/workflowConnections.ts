import { TRPCError } from "@trpc/server";
import { getConnection } from "./channelConnections";
import { getOptimizationConnection } from "./optimizationConnections";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";
import type { WorkflowChannel } from "../../shared/workflowChannels";

export async function getWorkflowConnection(
  db: LibraryDatabase | LibraryTransaction,
  organizationId: number,
  id: string,
  channel: WorkflowChannel
) {
  const row =
    channel === "google_ads"
      ? await getOptimizationConnection(db, organizationId, id)
      : await getConnection(db, organizationId, id, channel);
  if (row.channel !== channel)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The selected account does not match this workflow channel.",
    });
  return row;
}
