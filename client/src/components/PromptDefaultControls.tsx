import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  usePromptDefaults,
  announcePromptChange,
} from "@/hooks/usePromptDefaults";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
/** Defaults never replace unsaved draft text during a query refresh. */
export function PromptDefaultControls({
  promptId,
  value,
  onChange,
}: {
  promptId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { organizationId, membership } = useWorkspace();
  const defaults = usePromptDefaults(organizationId ?? 0);
  const prompt = defaults.data?.find(item => item.id === promptId);
  const utils = trpc.useUtils();
  const save = trpc.prompts.change.useMutation({
    onSuccess: async () => {
      announcePromptChange(organizationId!);
      await utils.prompts.list.invalidate({ organizationId: organizationId! });
      toast.success("Workspace default saved");
    },
    onError: error => toast.error(error.message),
  });
  if (!prompt)
    return (
      <Link
        className="text-xs underline"
        href={`~/app/settings/prompts?prompt=${encodeURIComponent(promptId)}`}
      >
        Manage prompt defaults
      </Link>
    );
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange(prompt.value)}
      >
        Restore workspace default
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => onChange(prompt.baseline)}
      >
        Restore system default
      </Button>
      {["owner", "admin"].includes(membership?.role ?? "") && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={save.isPending || !value.trim() || value === prompt.value}
          onClick={() =>
            save.mutate({
              organizationId: organizationId!,
              promptId,
              expectedRevision: prompt.revision,
              action: "save",
              value,
              reason: "Saved explicitly from a prompt form",
            })
          }
        >
          Save as workspace default
        </Button>
      )}
      <Link
        className="underline"
        href={`~/app/settings/prompts?prompt=${encodeURIComponent(promptId)}`}
      >
        Manage defaults & history
      </Link>
      <span className="text-muted-foreground">
        Workspace revision {prompt.revision}
      </span>
    </div>
  );
}
