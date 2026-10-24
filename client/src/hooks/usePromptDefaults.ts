import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
export function announcePromptChange(organizationId: number) {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("evokeloop-prompt-defaults");
    channel.postMessage({ organizationId });
    channel.close();
  } catch {
    /* Focus refetch remains available when cross-tab messaging is blocked. */
  }
}
export function usePromptDefaults(organizationId: number) {
  const utils = trpc.useUtils();
  useEffect(() => {
    try {
      if (typeof BroadcastChannel === "undefined") return;
      const channel = new BroadcastChannel("evokeloop-prompt-defaults");
      channel.onmessage = event => {
        if (event.data?.organizationId === organizationId)
          void utils.prompts.list.invalidate({ organizationId });
      };
      return () => channel.close();
    } catch {
      return;
    }
  }, [organizationId, utils]);
  return trpc.prompts.list.useQuery(
    { organizationId },
    { enabled: organizationId > 0, staleTime: 0, refetchOnWindowFocus: true }
  );
}
