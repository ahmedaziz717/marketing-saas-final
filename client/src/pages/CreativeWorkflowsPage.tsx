import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  GitBranch,
  Loader2,
  Plus,
  Search,
  Workflow,
  Archive,
  Play,
  AppWindow,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkflowCanvas } from "@/components/WorkflowCanvas";
import {
  WORKFLOW_TEMPLATES,
  workflowTemplate,
  workflowNodes,
  type WorkflowGraph,
} from "@shared/creativeWorkflow";
import "@/styles/workflows.css";
import {
  addWorkflowAppResults,
  workflowAppResultPlan,
} from "@shared/workflowAppResults";
import {
  businessWorkflowTemplates,
  businessWorkflowTemplate,
  workflowSections,
} from "@shared/workflowPlatform";
import type { WorkflowFamily } from "@shared/creativeWorkflow";
import { WorkflowApps, WorkflowAppRunner } from "@/components/WorkflowApps";
import { WorkflowRunReview } from "@/components/WorkflowRunReview";

export default function CreativeWorkflowsPage({
  family = "create",
}: {
  family?: WorkflowFamily;
}) {
  return (
    <WorkspaceGate>
      <WorkflowWorkspace family={family} />
    </WorkspaceGate>
  );
}
function WorkflowWorkspace({ family }: { family: WorkflowFamily }) {
  const { organizationId, membership } = useWorkspace();
  const search = useSearch(),
    [, navigate] = useLocation();
  const id = new URLSearchParams(search).get("workflow");
  const appId = new URLSearchParams(search).get("app");
  const section = workflowSections[family];
  if (!organizationId) return null;
  if (
    !["owner", "admin", "creator", "publisher"].includes(membership?.role ?? "")
  )
    return (
      <div className="surface p-8">
        A creator or publisher role is needed to work with workflows.
      </div>
    );
  if (appId)
    return (
      <WorkflowAppRunner
        key={`${organizationId}:${appId}`}
        organizationId={organizationId}
        id={appId}
        role={membership!.role}
        onBack={() => navigate(section.path)}
      />
    );
  return id ? (
    <WorkflowEditor
      key={`${organizationId}:${id}`}
      id={id}
      family={family}
      organizationId={organizationId}
      role={membership!.role}
      onBack={() => navigate(section.path)}
    />
  ) : (
    <WorkflowLibrary
      family={family}
      organizationId={organizationId}
      onOpen={id => navigate(`${section.path}?workflow=${id}`)}
    />
  );
}
function WorkflowLibrary({
  family,
  organizationId,
  onOpen,
}: {
  organizationId: number;
  onOpen: (id: string) => void;
  family: WorkflowFamily;
}) {
  const section = workflowSections[family];
  const templates =
    family === "create"
      ? WORKFLOW_TEMPLATES
      : businessWorkflowTemplates.filter(t => t.family === family);
  const [search, setSearch] = useState(""),
    [archiveId, setArchiveId] = useState<string | null>(null);
  const list = trpc.workflows.list.useQuery({ organizationId, family });
  const save = trpc.workflows.save.useMutation(),
    archive = trpc.workflows.archive.useMutation();
  const create = async (template?: string) => {
    try {
      const item = await save.mutateAsync({
        organizationId,
        name:
          templates.find(t => t.id === template)?.name ?? "Untitled workflow",
        family,
        graph:
          businessWorkflowTemplate(template ?? "") ??
          workflowTemplate(template ?? ""),
      });
      onOpen(item.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="wf-library" data-family={family}>
      <div className="wf-library-heading">
        <div>
          <span className="wf-eyebrow">
            {section.name.toUpperCase()} / WORKFLOWS & APPS
          </span>
          <h1>{section.heading}</h1>
          <p>{section.description}</p>
        </div>
        <Button disabled={save.isPending} onClick={() => create()}>
          <Plus size={17} /> New workflow
        </Button>
      </div>
      <section aria-labelledby="wf-template-heading">
        <div className="wf-section-title">
          <h2 id="wf-template-heading">Start with a workflow</h2>
          <span>Ready to make your own</span>
        </div>
        <div className="wf-templates">
          {templates.map((template, i) => (
            <button
              key={template.id}
              disabled={save.isPending}
              className="wf-template"
              data-color={template.color}
              onClick={() => create(template.id)}
            >
              <div className="wf-template-art" aria-hidden="true">
                <div className="wf-mini-step">
                  {i === 2 ? "Aa" : <Workflow size={24} />}
                </div>
                <span />
                <div className="wf-mini-step">
                  <GitBranch size={24} />
                </div>
                <span />
                <div className="wf-mini-step">
                  <Play size={23} />
                </div>
              </div>
              <h3>{template.name}</h3>
              <p>{template.description}</p>
              <div className="wf-tags">
                {template.tags.map(tag => (
                  <span key={tag}>{tag}</span>
                ))}
                <ArrowRight size={16} />
              </div>
            </button>
          ))}
        </div>
      </section>
      <WorkflowApps organizationId={organizationId} family={family} />
      <section>
        <div className="wf-section-title">
          <h2>
            Your workflows <span>{list.data?.length ?? 0}</span>
          </h2>
          <label className="wf-search">
            <Search size={16} />
            <Input
              aria-label="Search workflows"
              placeholder="Find a workflow…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
        </div>
        {list.isLoading ? (
          <p className="p-8 text-muted-foreground">Loading workflows…</p>
        ) : list.error ? (
          <p role="alert">
            {list.error.message}{" "}
            <Button variant="outline" onClick={() => list.refetch()}>
              Retry
            </Button>
          </p>
        ) : (
          <div className="wf-saved-grid">
            {list.data
              ?.filter(w => w.name.toLowerCase().includes(search.toLowerCase()))
              .map(w => (
                <div className="wf-saved" key={w.id}>
                  <button onClick={() => onOpen(w.id)}>
                    <span className="wf-saved-icon">
                      <Workflow size={23} />
                    </span>
                    <div>
                      <h3>{w.name}</h3>
                      <p>
                        Edited {new Date(w.updatedAtMs).toLocaleDateString()}
                      </p>
                    </div>
                    <ArrowRight size={17} />
                  </button>
                  <button
                    aria-label={`Archive ${w.name}`}
                    className="wf-archive"
                    onClick={() => setArchiveId(w.id)}
                  >
                    <Archive size={16} />
                  </button>
                </div>
              ))}
          </div>
        )}
        {!list.isLoading && !list.data?.length && (
          <div className="wf-empty-library">
            <Workflow size={32} />
            <h3>Your next repeatable process starts here.</h3>
            <p>Pick a template above or start with a blank canvas.</p>
          </div>
        )}
      </section>
      <Dialog
        open={!!archiveId}
        onOpenChange={open => !open && setArchiveId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this workflow?</DialogTitle>
            <DialogDescription>
              It will leave this list. Generated assets stay in your Asset
              Library.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setArchiveId(null)}>
              Keep workflow
            </Button>
            <Button
              disabled={archive.isPending}
              onClick={async () => {
                try {
                  await archive.mutateAsync({ organizationId, id: archiveId! });
                  setArchiveId(null);
                  await list.refetch();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Archive workflow
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function WorkflowEditor({
  id,
  family,
  organizationId,
  role,
  onBack,
}: {
  id: string;
  organizationId: number;
  role: string;
  family: WorkflowFamily;
  onBack: () => void;
}) {
  const detail = trpc.workflows.get.useQuery(
    { organizationId, id },
    { refetchInterval: 3000 }
  );
  const [graph, setGraph] = useState<WorkflowGraph | null>(null),
    [name, setName] = useState(""),
    [savedString, setSavedString] = useState(""),
    [saveError, setSaveError] = useState("");
  const [publishOpen, setPublishOpen] = useState(false),
    [appDescription, setAppDescription] = useState("");
  const publishApp = trpc.workflows.publishApp.useMutation();
  const connections = trpc.channels.connections.useQuery({ organizationId });
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [review, setReview] = useState<{
    target?: string;
    credits: number;
    creditsByNode: Record<string, number>;
    nodeNames: Record<string, string>;
    reused: number;
    requestId: string;
    revision: number;
  } | null>(null);
  const revision = useRef(1),
    latest = useRef({ graph, name }),
    saving = useRef<Promise<unknown> | null>(null);
  latest.current = { graph, name };
  const save = trpc.workflows.save.useMutation(),
    quote = trpc.workflows.quote.useMutation(),
    run = trpc.workflows.run.useMutation(),
    stop = trpc.workflows.stop.useMutation();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (detail.data && !graph) {
      setGraph(detail.data.graph);
      setName(detail.data.name);
      revision.current = detail.data.revision;
      setSavedString(
        JSON.stringify({ graph: detail.data.graph, name: detail.data.name })
      );
    }
  }, [detail.data, graph]);
  const currentString = JSON.stringify({ graph, name }),
    dirty = !!graph && currentString !== savedString;
  const saveNow = async () => {
    if (saving.current) await saving.current;
    const snapshot = latest.current;
    if (!snapshot.graph) return;
    if (JSON.stringify(snapshot) === savedString) return;
    const task = save
      .mutateAsync({
        organizationId,
        id,
        revision: revision.current,
        name: snapshot.name.trim() || "Untitled workflow",
        graph: snapshot.graph,
      })
      .then(result => {
        revision.current = result.revision;
        setSavedString(JSON.stringify(snapshot));
        setSaveError("");
      })
      .catch(e => {
        setSaveError((e as Error).message);
        throw e;
      });
    saving.current = task;
    try {
      await task;
    } finally {
      saving.current = null;
    }
  };
  useEffect(() => {
    if (!dirty || saveError || review) return;
    const timer = setTimeout(() => {
      void saveNow().catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [currentString, savedString, saveError, review]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const startReview = async (target?: string) => {
    try {
      await saveNow();
      const result = await quote.mutateAsync({
        organizationId,
        id,
        revision: revision.current,
        target,
      });
      setReview({
        ...result,
        target,
        requestId: crypto.randomUUID(),
        revision: revision.current,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (detail.error)
    return (
      <div role="alert" className="surface p-8">
        <p>{detail.error.message}</p>
        <Button onClick={onBack} className="mt-4">
          Back to workflows
        </Button>
      </div>
    );
  if (!graph)
    return (
      <div className="p-12">
        <Loader2 className="animate-spin" /> Opening workflow…
      </div>
    );
  const appResults = workflowAppResultPlan(graph);
  const runs = detail.data?.runs ?? [],
    active = runs.find(r => ["queued", "running"].includes(r.status)),
    shown = runs.find(r => r.id === selectedRun) ?? runs[0];
  return (
    <div className="wf-editor" data-family={family}>
      <header className="wf-editor-header">
        <button
          className="wf-icon-button"
          title="Back to workflows"
          aria-label="Back to workflows"
          onClick={async () => {
            try {
              await saveNow();
              onBack();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <ArrowLeft size={19} />
        </button>
        <Workflow size={21} className="wf-brand-icon" />
        <div className="wf-title-wrap">
          <input
            aria-label="Workflow name"
            maxLength={100}
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <span>
            <span>
              {detail.data?.latestPublishedVersion
                ? `Workflow draft · App v${detail.data.latestPublishedVersion} published ·`
                : "Workflow draft ·"}
            </span>
            {saveError ? (
              <button
                onClick={() => {
                  setSaveError("");
                  void saveNow().catch(() => {});
                }}
              >
                Could not save · Retry
              </button>
            ) : save.isPending ? (
              <>
                <Loader2 size={11} className="animate-spin" /> Saving…
              </>
            ) : dirty ? (
              "Unsaved changes"
            ) : (
              <>
                <Check size={12} /> All changes saved
              </>
            )}
          </span>
        </div>
        <div className="wf-header-actions">
          <Button
            variant="ghost"
            size="sm"
            title="Duplicate workflow"
            aria-label="Duplicate workflow"
            disabled={save.isPending}
            onClick={async () => {
              try {
                await saveNow();
                const copied = await save.mutateAsync({
                  organizationId,
                  name: `${name.slice(0, 90)} (copy)`,
                  family,
                  graph,
                });
                navigate(
                  `${workflowSections[family].path}?workflow=${copied.id}`
                );
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <Copy size={16} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={save.isPending || publishApp.isPending}
            onClick={async () => {
              try {
                await saveNow();
                toast.success("Workflow draft saved");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            {save.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            {save.isPending ? "Saving…" : "Save workflow"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={save.isPending || publishApp.isPending}
            onClick={async () => {
              try {
                await saveNow();
                setPublishOpen(true);
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <AppWindow size={15} />{" "}
            {detail.data?.latestPublishedVersion
              ? "Publish new version"
              : "Publish as App"}
          </Button>
          <Link href="/app/library" className="wf-library-link">
            Asset Library <ArrowRight size={14} />
          </Link>
          <Button
            disabled={
              !!active || quote.isPending || run.isPending || !!saveError
            }
            onClick={() => startReview()}
          >
            {quote.isPending ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Play size={15} />
            )}{" "}
            Run workflow
          </Button>
        </div>
      </header>
      {saveError && (
        <div className="wf-error" role="alert">
          {saveError}
        </div>
      )}
      <WorkflowCanvas
        graph={graph}
        family={family}
        connectedChannels={
          connections.data?.items
            .filter(c => c.status === "connected")
            .map(c => c.channel) ?? []
        }
        onChange={setGraph}
        organizationId={organizationId}
        role={role}
        run={shown}
        onRunNode={startReview}
        busy={!!active || quote.isPending || run.isPending}
      />
      <footer className="wf-runbar">
        <div className="flex items-center gap-2">
          <span className={`wf-status-dot ${active ? "is-running" : ""}`} />
          {active ? (
            <>
              <strong>
                {active.stopRequested
                  ? "Stopping after current step…"
                  : "Workflow running"}
              </strong>
              <span>
                {
                  Object.values(active.steps).filter(s =>
                    ["completed", "reused"].includes(s.status)
                  ).length
                }
                /{Object.keys(active.steps).length} steps complete
              </span>
            </>
          ) : shown ? (
            <>
              <strong>
                {shown.status === "completed"
                  ? "Run complete"
                  : shown.status === "failed"
                    ? "Run needs attention"
                    : shown.status === "stopped"
                      ? "Run stopped"
                      : shown.status}
              </strong>
              <span>
                {new Date(shown.createdAtMs).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </>
          ) : (
            <>
              <strong>Ready when you are</strong>
              <span>Connect steps, then run your workflow.</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {active && (
            <Button
              size="sm"
              variant="outline"
              disabled={active.stopRequested || stop.isPending}
              onClick={async () => {
                try {
                  await stop.mutateAsync({ organizationId, id: active.id });
                  await detail.refetch();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Stop after current step
            </Button>
          )}
          {!!runs.length && (
            <select
              aria-label="Run history"
              value={shown?.id ?? ""}
              onChange={e => setSelectedRun(e.target.value)}
            >
              {runs.map((r, i) => (
                <option value={r.id} key={r.id}>
                  {i === 0 ? "Latest run" : `Run ${runs.length - i}`} ·{" "}
                  {r.status} ·{" "}
                  {new Date(r.createdAtMs).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </option>
              ))}
            </select>
          )}
        </div>
      </footer>
      <WorkflowRunReview
        organizationId={organizationId}
        run={active}
        onRefresh={() => detail.refetch()}
        role={role}
      />
      {shown?.error && (
        <div className="wf-error" role="alert">
          {shown.error}
        </div>
      )}
      <Dialog
        open={publishOpen}
        onOpenChange={open => !publishApp.isPending && setPublishOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {detail.data?.latestPublishedVersion
                ? `Publish a new version of ${name}`
                : `Publish ${name} as an App`}
            </DialogTitle>
            <DialogDescription>
              Your team can run a simple App or reuse this version as a step in
              another workflow. Future workflow edits are drafts until you
              publish a new version.
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2">
            App description
            <Input
              value={appDescription}
              maxLength={600}
              onChange={e => setAppDescription(e.target.value)}
              placeholder="What does this App help your team do?"
            />
          </label>
          <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
            <p className="font-medium">What this App returns</p>
            {appResults.error ? (
              <p role="alert">{appResults.error}</p>
            ) : (
              <>
                <ul className="list-disc pl-5">
                  {appResults.sources.map(node => (
                    <li key={node.id}>{node.title}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground">
                  {appResults.needsOutput
                    ? "We’ll add an App results step connected to these final steps when you publish. It tells the App which results to return."
                    : "These steps are connected to your App’s Output steps."}
                </p>
                <p className="text-muted-foreground">
                  Publishing an App does not run this workflow or use AI
                  credits.
                </p>
              </>
            )}
          </div>
          <Button
            disabled={
              publishApp.isPending || save.isPending || !!appResults.error
            }
            onClick={async () => {
              try {
                const prepared = addWorkflowAppResults(graph);
                if (prepared !== graph) {
                  latest.current = { graph: prepared, name };
                  setGraph(prepared);
                }
                await saveNow();
                const app = await publishApp.mutateAsync({
                  organizationId,
                  id,
                  revision: revision.current,
                  description: appDescription,
                });
                setPublishOpen(false);
                toast.success(`App version ${app.version} published`);
                navigate(`${workflowSections[family].path}?app=${app.id}`);
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            {appResults.needsOutput
              ? "Add results & publish App"
              : "Publish App version"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!review}
        onOpenChange={open => !open && !run.isPending && setReview(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {review?.target
                ? `Run ${graph.nodes.find(n => n.id === review.target)?.title}?`
                : "Run this workflow?"}
            </DialogTitle>
            <DialogDescription>
              Generation uses AI credits. Delivery steps can queue approved
              publications. Ad activation pauses for an explicit review. Results
              and decisions stay in run history.
            </DialogDescription>
          </DialogHeader>
          <div className="wf-credit-total">
            <strong>{review?.credits}</strong>
            <span>AI credits for this run</span>
          </div>
          <div className="space-y-2">
            {Object.entries(review?.creditsByNode ?? {})
              .filter(([, credits]) => credits > 0)
              .map(([nodeId, credits]) => (
                <div className="flex justify-between text-sm" key={nodeId}>
                  <span>
                    {review?.nodeNames[nodeId] ??
                      graph.nodes.find(n => n.id === nodeId)?.title ??
                      "App step"}
                  </span>
                  <span>{credits} credits</span>
                </div>
              ))}
          </div>
          {!!review?.reused && (
            <p className="text-sm text-muted-foreground">
              Reuses {review.reused} existing upstream result
              {review.reused === 1 ? "" : "s"}. Only the selected generation
              step runs again.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Credits are charged as steps begin. A failure stops the remaining
            steps. Outputs stay available for review.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={run.isPending}
              onClick={() => setReview(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={run.isPending}
              onClick={async () => {
                if (!review) return;
                try {
                  const started = await run.mutateAsync({
                    organizationId,
                    id,
                    revision: review.revision,
                    target: review.target,
                    requestId: review.requestId,
                    quotedCredits: review.credits,
                  });
                  setSelectedRun(started.id);
                  setReview(null);
                  await detail.refetch();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {run.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Play size={16} />
              )}{" "}
              Start run
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
