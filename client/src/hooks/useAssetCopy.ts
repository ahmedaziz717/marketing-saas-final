import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { canGenerateAssetCopy } from "@shared/adCopy";
import type {
  AssetCopyRequest,
  CopyRegeneration,
  CopySet,
} from "@shared/adCopy";

export function useAssetCopy(
  input: Omit<AssetCopyRequest, "regeneration">,
  onGenerated: (options: CopySet[], target?: CopyRegeneration) => void
) {
  const [error, setError] = useState("");
  const current = useRef("");
  current.current = JSON.stringify(input);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const mutation = trpc.channels.draftAssetCopy.useMutation({
    onSuccess: (data, variables) => {
      if (!mounted.current) return;
      const { regeneration, ...requested } = variables;
      if (current.current !== JSON.stringify(requested)) {
        setError(
          "Your inputs changed while copy was generating. Create copy again to use your latest choices."
        );
        toast.info(
          "Your copy or image selection changed. The AI result was not applied; generate again when ready."
        );
        return;
      }
      onGenerated(data.options, regeneration);
    },
    onError: error => {
      if (mounted.current) {
        setError(error.message);
        toast.error(error.message);
      }
    },
    onSettled: () => {
      pending.current = false;
    },
  });
  return {
    error,
    isPending: mutation.isPending,
    target: mutation.variables?.regeneration,
    generate: (regeneration?: CopyRegeneration) => {
      if (pending.current || !canGenerateAssetCopy(input)) return;
      setError("");
      pending.current = true;
      mutation.mutate({ ...input, regeneration });
    },
  };
}
