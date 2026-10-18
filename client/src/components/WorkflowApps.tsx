import { VisualSelect, ChoiceField } from "@/components/choices/VisualSelect";
import { PartnerLogo } from "./PartnerLogo";
import { WorkflowDataResult } from "./WorkflowDataResult";
import { StudioImagePreview } from "./configurator/StudioImagePreview";
import { activationHref } from "@shared/contentWorkflow";
import { availableWorkflowResults } from "@shared/workflowResults";
import { WorkflowAutomationControls } from "./WorkflowAutomationControls";
import { WorkflowAppStudio } from "./WorkflowAppStudio";
import {
  workflowAppFields,
  workflowFieldValue,
  workflowFieldPlacement,
  workflowVisibleFields,
} from "@shared/workflowStudio";
import { fieldValueProblem } from "@shared/workflowInputs";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { AppWindow, ArrowRight, Workflow } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { workflowSections, workflowValueText } from "@shared/workflowPlatform";
import { workflowNodes, type WorkflowFamily } from "@shared/creativeWorkflow";
import { Button } from "./ui/button";
import { WorkflowRunReview } from "./WorkflowRunReview";
import { workflowRunStatusLabel } from "@shared/workflowRunActivity";

export function WorkflowApps({
  organizationId,
  family,
}: {
  organizationId: number;
  family: WorkflowFamily;
}) {
  const query = trpc.workflows.listApps.useQuery({ organizationId, family });
  const seen = new Set<string>();
  const published =
    query.data?.filter(app => {
      if (seen.has(app.workflowId)) return false;
      seen.add(app.workflowId);
      return true;
    }) ?? [];
  const components = published.filter(app =>
    app.graph.nodes.some(
      n =>
        n.type === "app_input" &&
        !n.config.field &&
        n.config.inputType &&
        n.config.inputType !== "any"
    )
  );
  const apps = published.filter(app => !components.includes(app));
  return (
    <section className="wf-apps-section">
      <div className="wf-section-title">
        <h2>
          {family === "measure" ? "Published workflow apps" : "Your Apps"}{" "}
          <span>{apps.length}</span>
        </h2>
        <span>Published from your workflows</span>
      </div>
      {query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : query.isLoading ? (
        <p>Loading Apps…</p>
      ) : apps.length ? (
        <div className="wf-app-grid">
          {apps.map(app => (
            <article className="wf-app-card" key={app.id}>
              <span className="wf-app-icon">
                <AppWindow size={24} />
              </span>
              <span className="wf-version">v{app.version}</span>
              <div className="flex gap-2">
                {Array.from(
                  new Set(
                    app.graph.nodes.flatMap(node => {
                      const channel =
                        workflowNodes[node.type]?.channel ??
                        node.config.field?.connectionChannel;
                      return channel === "meta_ads"
                        ? ["meta"]
                        : channel === "facebook"
                          ? ["facebook"]
                          : [];
                    })
                  )
                ).map(slug => (
                  <PartnerLogo
                    key={slug}
                    slug={slug}
                    name={slug === "meta" ? "Meta" : "Facebook"}
                    size={36}
                  />
                ))}
              </div>
              <h3>{app.name}</h3>
              <p>
                {app.description ||
                  `${workflowSections[app.family].name} App · ${app.graph.nodes.length} steps`}
              </p>
              <div>
                <Link
                  href={`${workflowSections[family].appsPath}?app=${app.id}`}
                >
                  Open App <ArrowRight size={14} />
                </Link>
                <Link
                  href={`${workflowSections[family].path}?workflow=${app.workflowId}`}
                >
                  Edit workflow
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="wf-app-empty">
          <AppWindow size={22} />
          <p>
            Publish a workflow as an App to give your team a simple way to run
            it and reuse it in other workflows.
          </p>
          <Link
            href={workflowSections[family].path}
            className="text-primary underline"
          >
            Explore {workflowSections[family].name} workflows
          </Link>
        </div>
      )}
      {!!components.length && (
        <details className="mt-6 rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">
            Reusable workflow components ({components.length})
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            These typed components receive evidence from a parent workflow.
            Choose them in a Run workflow node.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {components.map(app => (
              <Link
                key={app.id}
                className="rounded-lg border p-3 text-sm"
                href={`${workflowSections[family].path}?workflow=${app.workflowId}`}
              >
                {app.name} · v{app.version}
              </Link>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

export function WorkflowAppRunner(props: {
  organizationId: number;
  id: string;
  role: string;
  onBack: () => void;
}) {
  // A new published version has a different input contract and run history.
  return (
    <WorkflowAppRunnerSession
      key={`${props.organizationId}:${props.id}`}
      {...props}
    />
  );
}

function WorkflowAppRunnerSession({
  organizationId,
  id,
  role,
  onBack,
}: {
  organizationId: number;
  id: string;
  role: string;
  onBack: () => void;
}) {
  const app = trpc.workflows.getApp.useQuery({ organizationId, id });
  const detail = trpc.workflows.get.useQuery(
    { organizationId, id: app.data?.workflowId ?? "" },
    { enabled: !!app.data, refetchInterval: 3000 }
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState("");
  const [selectedRun, setSelectedRun] = useState("");
  const [problem, setProblem] = useState("");
  const inputRevision = useRef(0);
  const submitting = useRef(false);
  const [review, setReview] = useState<{
    credits: number;
    requestId: string;
    inputs: Array<{
      id: string;
      text?: string;
      imageKey?: string;
      value?: string;
    }>;
  } | null>(null);
  const quote = trpc.workflows.quote.useMutation(),
    run = trpc.workflows.run.useMutation(),
    stop = trpc.workflows.stop.useMutation();
  if (app.error)
    return (
      <div role="alert">
        {app.error.message}
        <Button onClick={onBack}>Back</Button>
      </div>
    );
  if (!app.data) return <p>Opening App…</p>;
  const item = app.data,
    section = workflowSections[item.family];
  const fields = workflowAppFields(item.graph);
  const runs = detail.data?.runs.filter(r => r.appVersionId === id) ?? [];
  const active = runs.find(r => ["queued", "running"].includes(r.status));
  const latest = runs.find(r => r.id === selectedRun) ?? active ?? runs[0];
  const output = availableWorkflowResults(latest);
  const changeValue = (fieldId: string, value: string) => {
    inputRevision.current++;
    setValues(v => ({ ...v, [fieldId]: value }));
    setReview(null);
    setProblem("");
  };
  const estimate = async () => {
    if (submitting.current || active) return;
    setProblem("");
    for (const n of workflowVisibleFields(item.graph, values)) {
      const error =
        n.config.field &&
        fieldValueProblem(n.config.field, workflowFieldValue(n, values));
      if (error) {
        setProblem(`${n.title}: ${error}`);
        setPage(workflowFieldPlacement(n).page);
        return;
      }
    }
    submitting.current = true;
    const revision = inputRevision.current;
    const inputs = fields.map(n => ({
      id: n.id,
      ...(n.config.field
        ? { value: workflowFieldValue(n, values) }
        : n.type === "image"
          ? { imageKey: workflowFieldValue(n, values) || undefined }
          : { text: workflowFieldValue(n, values) }),
    }));
    try {
      const q = await quote.mutateAsync({
        organizationId,
        id: item.workflowId,
        revision: item.workflowRevision,
        appVersionId: id,
        inputs,
      });
      if (revision !== inputRevision.current) return;
      setReview({ credits: q.credits, requestId: crypto.randomUUID(), inputs });
      setPage("review");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      submitting.current = false;
    }
  };
  const confirm = async () => {
    if (!review || submitting.current || active) return;
    submitting.current = true;
    setProblem("");
    try {
      await run.mutateAsync({
        organizationId,
        id: item.workflowId,
        revision: item.workflowRevision,
        appVersionId: id,
        inputs: review.inputs,
        requestId: review.requestId,
        quotedCredits: review.credits,
      });
      setReview(null);
      setSelectedRun("");
      setPage("results");
      toast.success("App run started");
      await detail.refetch();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      submitting.current = false;
    }
  };
  return (
    <WorkflowAppStudio
      graph={item.graph}
      organizationId={organizationId}
      title={item.name}
      description={item.description}
      header={
        <div className="cfg-back">
          <button type="button" onClick={onBack}>
            ← {section.name} Apps
          </button>
          <span>· v{item.version}</span>
          <Link href={`${section.path}?workflow=${item.workflowId}`}>
            <Workflow size={13} /> Open workflow
          </Link>
        </div>
      }
      values={values}
      onChange={changeValue}
      page={page}
      onPageChange={setPage}
      busy={quote.isPending || run.isPending}
      status={
        latest ? `${workflowRunStatusLabel(latest)} · View results` : undefined
      }
      error={problem}
      review={
        <>
          <div className="wf-studio-run" aria-live="polite">
            <p>
              {item.graph.nodes.some(
                n =>
                  n.type === "deliver_publication" || n.type === "meta_activate"
              )
                ? "Uses this published version and your inputs. Delivery waits for approval of the exact publication; ad activation requires a separate review."
                : item.graph.nodes.some(n =>
                      ["facebook_post", "meta_ad"].includes(n.type)
                    )
                  ? "Creates your copy and post draft. Review finished assets when prompted, then open the result in Activation Studio to edit, approve and publish or schedule."
                  : "Runs this published version with your chosen inputs. Your outputs appear in Results as each branch completes."}
            </p>
            {active ? (
              <>
                <p>A run is already in progress.</p>
                <button
                  type="button"
                  className="cfg-primary"
                  onClick={() => setPage("results")}
                >
                  View run progress
                </button>
              </>
            ) : review ? (
              <>
                <div className="wf-studio-credit">
                  <strong>{review.credits}</strong>
                  <span>estimated AI credits</span>
                </div>
                <p>
                  Changing any input clears this estimate so you can review the
                  updated cost.
                </p>
                <button
                  type="button"
                  className="cfg-primary"
                  disabled={run.isPending}
                  onClick={confirm}
                >
                  {run.isPending ? "Starting…" : "Confirm & run App"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="cfg-primary"
                disabled={quote.isPending || run.isPending}
                onClick={estimate}
              >
                {quote.isPending
                  ? "Checking inputs & estimating…"
                  : "Review credits & run"}
              </button>
            )}
          </div>
          <WorkflowAutomationControls
            organizationId={organizationId}
            appVersionId={id}
            role={role}
          />
        </>
      }
      results={
        <section className="wf-app-results">
          <h3>
            Run results{" "}
            {latest && <span>· {workflowRunStatusLabel(latest)}</span>}
          </h3>
          {runs.length > 1 && (
            <ChoiceField>
              Run history{" "}
              <VisualSelect
                aria-label="App run history"
                value={latest?.id ?? ""}
                onChange={e => setSelectedRun(e.target.value)}
              >
                {runs.map(r => (
                  <option key={r.id} value={r.id}>
                    {new Date(r.createdAtMs).toLocaleString()} ·{" "}
                    {workflowRunStatusLabel(r)}
                  </option>
                ))}
              </VisualSelect>
            </ChoiceField>
          )}
          {latest && (
            <ol className="wf-result-progress" aria-label="Run steps">
              {latest.graph.nodes
                .filter(
                  n =>
                    !["app_input", "text", "image", "output"].includes(n.type)
                )
                .map(n => (
                  <li key={n.id}>
                    <strong>{n.title}</strong>
                    <span>{latest.steps[n.id]?.status ?? "pending"}</span>
                  </li>
                ))}
            </ol>
          )}
          {detail.error && <p role="alert">{detail.error.message}</p>}
          {latest?.error && <p role="alert">{latest.error}</p>}
          {!latest && (
            <p>
              {detail.isLoading
                ? "Loading run history…"
                : "Run this App to see its outputs and review any actions."}
            </p>
          )}
          <WorkflowRunReview
            organizationId={organizationId}
            run={latest}
            role={role}
            onRefresh={() => detail.refetch()}
          />
          {output.map((v, i) => (
            <div className="wf-app-output" key={i}>
              {v.type === "image" ? (
                <StudioImagePreview url={v.url} title={v.name} />
              ) : v.type === "video" ? (
                <video src={v.url} controls />
              ) : v.type === "publication" ? (
                <Link href={activationHref(v.channel, v.id)}>
                  {v.name} · Open in Activation Studio →
                </Link>
              ) : v.type === "data" ? (
                <WorkflowDataResult data={v.data} />
              ) : (
                <pre className="wf-evidence">{workflowValueText(v)}</pre>
              )}
            </div>
          ))}
          {active && (
            <Button
              variant="outline"
              disabled={stop.isPending || active.stopRequested}
              onClick={async () => {
                try {
                  await stop.mutateAsync({ organizationId, id: active.id });
                  await detail.refetch();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              {active.stopRequested
                ? "Stopping after current step…"
                : "Stop after current step"}
            </Button>
          )}
        </section>
      }
    />
  );
}
