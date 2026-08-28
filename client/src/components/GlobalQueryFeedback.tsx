import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function GlobalQueryFeedback() {
  const fetching = useIsFetching();
  const queryClient = useQueryClient();
  const seen = useRef(new Set<string>());

  useEffect(() => queryClient.getQueryCache().subscribe(event => {
    if (event.type !== "updated" || event.query.state.status !== "error") return;
    const error = event.query.state.error;
    const message = error instanceof Error ? error.message : "Workspace data could not be loaded";
    const key = `${event.query.queryHash}:${message}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    toast.error(message);
  }), [queryClient]);

  if (!fetching) return null;
  return <div className="fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/15" role="status" aria-label="Loading workspace data"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>;
}
