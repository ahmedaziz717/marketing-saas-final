import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { SettingsLayout } from "@/components/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  announcePromptChange,
  usePromptDefaults,
} from "@/hooks/usePromptDefaults";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { ResolvedPrompt } from "../../../shared/promptRegistry";
import { promptGroup, type PromptGroup } from "@shared/promptPresentation";
import { BrandPromptContext } from "@/components/BrandPromptContext";

function PromptEditor({
  prompt,
  organizationId,
  canEdit,
  onDirty,
}: {
  prompt: ResolvedPrompt;
  organizationId: number;
  canEdit: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(prompt.value);
  const [base, setBase] = useState({
    value: prompt.value,
    revision: prompt.revision,
  });
  const [reason, setReason] = useState("");
  const brand = trpc.brand.promptContext.useQuery(
    { organizationId },
    {
      enabled: prompt.id === "creative.base",
      staleTime: 0,
      refetchOnMount: "always",
    }
  );
  const utils = trpc.useUtils();
  const history = trpc.prompts.history.useQuery({
    organizationId,
    promptId: prompt.id,
  });
  const dirty = draft !== base.value;
  const stale = base.revision !== prompt.revision;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const change = trpc.prompts.change.useMutation({
    onSuccess: async () => {
      announcePromptChange(organizationId);
      await utils.prompts.list.invalidate({ organizationId });
      await history.refetch();
      const items = await utils.prompts.list.fetch({ organizationId });
      const next = items.find(item => item.id === prompt.id)!;
      setDraft(next.value);
      setBase({ value: next.value, revision: next.revision });
      setReason("");
      toast.success("Workspace prompt default updated");
    },
    onError: error => toast.error(error.message),
  });
  function restore(
    action: "restore_system" | "restore_revision",
    restoreRevision?: number
  ) {
    change.mutate({
      organizationId,
      promptId: prompt.id,
      expectedRevision: base.revision,
      action,
      restoreRevision,
      reason:
        reason.trim() ||
        (action === "restore_system"
          ? "Restore system baseline"
          : "Restore workspace revision"),
    });
  }
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="text-xl font-semibold">{prompt.name}</h2>
        <p className="text-sm text-muted-foreground">{prompt.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {prompt.source === "system"
            ? "System baseline"
            : "Workspace override"}{" "}
          · Revision {prompt.revision} · System version {prompt.version}
        </p>
      </div>
      {stale && (
        <p role="alert" className="rounded-lg border p-3 text-sm">
          This default changed elsewhere. Your unsaved text is preserved. Reload
          the latest value before making another change.
        </p>
      )}
      {prompt.id === "creative.base" && (
        <BrandPromptContext
          brand={brand.data}
          loading={brand.isLoading}
          error={!!brand.error}
        />
      )}
      <label className="block text-sm font-medium">
        Resolved workspace default
        <Textarea
          aria-label="Resolved workspace default"
          className="mt-2 min-h-60"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          disabled={!canEdit || !prompt.editable || change.isPending}
          maxLength={prompt.maxLength}
        />
      </label>
      {canEdit && prompt.editable && (
        <>
          <label className="block text-sm">
            Change note
            <Input
              aria-label="Change note"
              className="mt-2"
              value={reason}
              onChange={e => setReason(e.target.value)}
              maxLength={500}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!dirty || stale || !reason.trim() || change.isPending}
              onClick={() =>
                change.mutate({
                  organizationId,
                  promptId: prompt.id,
                  expectedRevision: base.revision,
                  action: "save",
                  value: draft,
                  reason,
                })
              }
            >
              Save workspace default
            </Button>
            <Button
              variant="outline"
              disabled={
                dirty || stale || change.isPending || prompt.source === "system"
              }
              onClick={() => restore("restore_system")}
            >
              Restore system default
            </Button>
            <Button
              variant="ghost"
              disabled={change.isPending}
              onClick={() => {
                setDraft(prompt.value);
                setBase({ value: prompt.value, revision: prompt.revision });
              }}
            >
              Discard local edits / reload
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Restoring creates a new history entry. It does not rewrite existing
            drafts, workflow versions or past runs.
          </p>
        </>
      )}
      {!canEdit && (
        <p className="text-sm text-muted-foreground">
          Only workspace owners and admins can change defaults.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Immutable system baseline
        </summary>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">
          {prompt.baseline}
        </pre>
      </details>
      <div>
        <h3 className="font-medium">Change history</h3>
        <p className="text-xs text-muted-foreground">
          Latest 100 revisions. Restoring creates a new revision.
        </p>
        {history.isLoading ? (
          <p>Loading history…</p>
        ) : history.error ? (
          <p role="alert">History unavailable: {history.error.message}</p>
        ) : !history.data?.length ? (
          <p className="text-sm text-muted-foreground">
            No workspace overrides yet.
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {history.data.map(row => (
              <li key={row.id} className="rounded-lg border p-3 text-sm">
                <div>
                  Revision {row.revision} · {row.action.replaceAll("_", " ")} ·{" "}
                  {new Date(row.createdAtMs).toLocaleString()}
                </div>
                <p className="text-muted-foreground">
                  User {row.actorUserId} · {row.reason}
                </p>
                <details>
                  <summary>View revision</summary>
                  <pre className="whitespace-pre-wrap">
                    {row.value ?? row.baselineValue}
                  </pre>
                </details>
                {canEdit && prompt.editable && (
                  <Button
                    className="mt-2"
                    variant="outline"
                    size="sm"
                    disabled={
                      dirty ||
                      stale ||
                      change.isPending ||
                      row.revision === prompt.revision
                    }
                    onClick={() => restore("restore_revision", row.revision)}
                  >
                    Restore this workspace revision
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
function Prompts() {
  const { organizationId, membership } = useWorkspace();
  const query = usePromptDefaults(organizationId ?? 0);
  const search = useSearch();
  const requested =
    new URLSearchParams(search).get("prompt") ?? "creative.base";
  const [selected, setSelected] = useState(
    promptGroup(requested) === "technical" ? "creative.base" : requested
  );
  const [group, setGroup] = useState<PromptGroup>(
    promptGroup(requested) === "technical" ? "creative" : promptGroup(requested)
  );
  const [filter, setFilter] = useState("");
  const [dirty, setDirty] = useState(false);
  const prompt = query.data?.find(item => item.id === selected);
  return (
    <SettingsLayout>
      <div>
        <h1 className="text-2xl font-semibold">Prompt defaults</h1>
        <p className="text-muted-foreground">
          Shape your creative direction, copy and visual styles. Your Brand Kit
          supplies the brand voice automatically; your saved instructions stay
          yours.
        </p>
      </div>
      {query.isLoading ? (
        <p>Loading prompt defaults…</p>
      ) : query.error ? (
        <div role="alert">
          {query.error.message}
          <Button onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label="Prompt catalog" className="space-y-2">
            <label className="block text-sm font-medium">
              Defaults to manage
              <select
                aria-label="Defaults to manage"
                className="mt-2 w-full rounded-lg border bg-background p-2"
                value={group}
                onChange={event => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Discard unsaved prompt edits and open another group?"
                    )
                  )
                    return;
                  const next = event.target.value as PromptGroup;
                  setGroup(next);
                  setFilter("");
                  setSelected(
                    query.data?.find(item => promptGroup(item.id) === next)
                      ?.id ?? "creative.base"
                  );
                }}
              >
                <option value="creative">Creative essentials</option>
                <option value="visual">Themes &amp; visual styles</option>
                {["owner", "admin"].includes(membership?.role ?? "") && (
                  <option value="technical">
                    Advanced technical templates
                  </option>
                )}
              </select>
            </label>
            {group === "technical" && (
              <p className="text-xs text-muted-foreground">
                Advanced application behavior. These templates are not your
                brand voice or campaign brief. Protected instructions remain
                read-only.
              </p>
            )}
            <Input
              aria-label="Search prompts"
              placeholder="Search prompts"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <div className="max-h-48 lg:max-h-[65vh] space-y-1 overflow-y-auto">
              {query.data
                ?.slice()
                .filter(item => promptGroup(item.id) === group)
                .sort((a, b) => Number(b.editable) - Number(a.editable))
                .filter(item =>
                  `${item.name} ${item.area}`
                    .toLowerCase()
                    .includes(filter.toLowerCase())
                )
                .map(item => (
                  <button
                    key={item.id}
                    className={`block w-full rounded-lg p-3 text-left text-sm ${item.id === selected ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                    onClick={() => {
                      if (
                        item.id !== selected &&
                        dirty &&
                        !window.confirm(
                          "Discard unsaved prompt edits and open another default?"
                        )
                      )
                        return;
                      setSelected(item.id);
                    }}
                  >
                    <span className="block font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.area}
                    </span>
                  </button>
                ))}
            </div>
          </nav>
          {prompt && (
            <PromptEditor
              key={`${organizationId}:${prompt.id}`}
              prompt={prompt}
              onDirty={setDirty}
              organizationId={organizationId!}
              canEdit={
                membership?.role === "owner" || membership?.role === "admin"
              }
            />
          )}
        </div>
      )}
    </SettingsLayout>
  );
}
export default function PromptsPage() {
  return (
    <WorkspaceGate>
      <Prompts />
    </WorkspaceGate>
  );
}
