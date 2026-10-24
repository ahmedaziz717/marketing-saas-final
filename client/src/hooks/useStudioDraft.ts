import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import {
  readStudioDraft,
  writeStudioDraft,
  removeStudioDraft,
} from "@/lib/studioDrafts";

/** Restore once after an entity loads. A different server revision wins over a
 * stale local edit. Polling/refetching never overwrites a live edit session. */
export function useStudioDraft<T>({
  key,
  value,
  restore,
  schema,
  ready = true,
  revision,
}: {
  key: string | null;
  value: T;
  restore: (value: T) => void;
  schema: z.ZodType<T>;
  ready?: boolean;
  revision?: number;
}) {
  const hydrated = useRef<string | null>(null);
  const baseRevision = useRef(revision);
  const latest = useRef({ value, restore });
  latest.current = { value, restore };
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!key || !ready) return;
    if (hydrated.current !== key) {
      hydrated.current = key;
      baseRevision.current = revision;
      setStale(false);
      const cached = readStudioDraft(key, raw => {
        try {
          const entry = JSON.parse(raw);
          if (entry.version !== 1) return null;
          const parsed = schema.safeParse(entry.value);
          return parsed.success
            ? { value: parsed.data, revision: entry.revision }
            : null;
        } catch {
          return null;
        }
      });
      if (cached && cached.revision === revision) {
        latest.current.restore(cached.value);
        return;
      }
      if (cached) setStale(true);
    }
    writeStudioDraft(key, {
      version: 1,
      revision: baseRevision.current,
      value,
    });
  }, [key, ready, value, revision, schema]);
  return {
    stale,
    clear: () => {
      removeStudioDraft(key);
      setStale(false);
    },
  };
}
