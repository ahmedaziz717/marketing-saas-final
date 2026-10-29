import { useEffect } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { usePromptDefaults } from "@/hooks/usePromptDefaults";
import { PromptDefaultControls } from "./PromptDefaultControls";
/** Snapshot the active task default once; subsequent refreshes never overwrite this run. */
export function TaskPromptField({ promptId, label, value, onChange }: { promptId: string; label: string; value?: string; onChange: (value: string) => void }) {
  const { organizationId } = useWorkspace();
  const defaults = usePromptDefaults(organizationId ?? 0);
  const prompt = defaults.data?.find(row => row.id === promptId);
  useEffect(() => { if (value === undefined && prompt) onChange(prompt.value); }, [value, prompt, onChange]);
  if (!prompt && value === undefined) return <p className="text-xs text-muted-foreground">{defaults.error ? "Default instructions unavailable; retry before generating." : "Loading default instructions."}</p>;
  return <details className="min-w-0 rounded-lg border p-3">
    <summary className="cursor-pointer text-sm font-medium">{label}{prompt ? ` - workspace revision ${prompt.revision}` : ""}</summary>
    <label className="mt-3 block text-sm">Instructions for this run
      <textarea aria-label={label} className="mt-1 min-h-28 w-full rounded border bg-background p-2" value={value ?? prompt?.value ?? ""} maxLength={prompt?.maxLength ?? 12000} onChange={event => onChange(event.target.value)} />
    </label>
    <PromptDefaultControls promptId={promptId} value={value ?? prompt?.value ?? ""} onChange={onChange} />
    <p className="mt-2 text-xs text-muted-foreground">Edits and restores here affect this run only. Save as workspace default explicitly to create a shared revision. Saved Studio choices remain unchanged until you edit or reset them.</p>
  </details>;
}
