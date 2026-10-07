import { WorkflowInputControl } from "./WorkflowInputControl";
import { fieldValueProblem, fieldPrompt } from "@shared/workflowInputs";
import { useState } from "react";
import { Link } from "wouter";
import { AppWindow, ArrowRight, Workflow } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { workflowSections, workflowValueText } from "@shared/workflowPlatform";
import type { WorkflowFamily } from "@shared/creativeWorkflow";
import { Button } from "./ui/button";
import { WorkflowRunReview } from "./WorkflowRunReview";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function WorkflowApps({
  organizationId,
  family,
}: {
  organizationId: number;
  family: WorkflowFamily;
}) {
  const query = trpc.workflows.listApps.useQuery({ organizationId, family });
  const seen = new Set<string>();
  const apps =
    query.data?.filter(app => {
      if (seen.has(app.workflowId)) return false;
      seen.add(app.workflowId);
      return true;
    }) ?? [];
  return (
    <section className="wf-apps-section">
      <div className="wf-section-title">
        <h2>
          Your Apps <span>{apps.length}</span>
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
              <h3>{app.name}</h3>
              <p>
                {app.description ||
                  `${workflowSections[app.family].name} App · ${app.graph.nodes.length} steps`}
              </p>
              <div>
                <Link href={`${workflowSections[family].path}?app=${app.id}`}>
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
        </div>
      )}
    </section>
  );
}

export function WorkflowAppRunner({
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
  const assets = trpc.assetLibrary.studioList.useQuery({ organizationId });
  const detail = trpc.workflows.get.useQuery(
    { organizationId, id: app.data?.workflowId ?? "" },
    { enabled: !!app.data, refetchInterval: 3000 }
  );
  const [values, setValues] = useState<
    Record<string, { text?: string; imageKey?: string; value?: string }>
  >({});
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
    section = workflowSections[item.family],
    fields = item.graph.nodes.filter(n =>
      ["text", "image", "app_input"].includes(n.type)
    );
  const input = (): Array<{
    id: string;
    value?: string;
    text?: string;
    imageKey?: string;
  }> =>
    fields.map(n => ({
      id: n.id,
      ...(n.config.field
        ? {
            value: n.config.field.locked
              ? n.config.field.defaultValue
              : (values[n.id]?.value ?? n.config.field.defaultValue),
          }
        : n.type === "image"
          ? {
              imageKey:
                values[n.id]?.imageKey ?? n.config.imageKey ?? undefined,
            }
          : { text: values[n.id]?.text ?? n.config.text }),
    }));
  const runs = detail.data?.runs.filter(r => r.appVersionId === id) ?? [],
    active = runs.find(r => ["queued", "running"].includes(r.status)),
    latest = active ?? runs[0];
  const output =
    latest?.graph.nodes
      .filter(n => n.type === "output")
      .flatMap(n => latest.steps[n.id]?.outputs ?? []) ?? [];
  return (
    <div className="wf-app-runner" data-family={item.family}>
      <Button variant="ghost" onClick={onBack}>
        ← {section.name} workflows
      </Button>
      <header>
        <span className="wf-eyebrow">
          {section.name.toUpperCase()} / APP · VERSION {item.version}
        </span>
        <h1>{item.name}</h1>
        <p>{item.description}</p>
        <Link href={`${section.path}?workflow=${item.workflowId}`}>
          <Workflow size={15} /> Open workflow
        </Link>
      </header>
      <div className="wf-app-run-layout">
        <section className="wf-app-form">
          <h2>Inputs</h2>
          {fields.length ? (
            fields
              .filter(n => {
                const c = n.config.field?.visibleWhen;
                if (!c) return true;
                const parent = fields.find(x => x.id === c.fieldId);
                return (
                  (parent?.config.field?.locked
                    ? parent.config.field.defaultValue
                    : (values[c.fieldId]?.value ??
                      parent?.config.field?.defaultValue)) === c.equals
                );
              })
              .map(n => (
                <div className="wf-form-field" key={n.id}>
                  <label>
                    {n.title}
                    {n.config.field?.required ? " *" : ""}
                  </label>
                  {n.config.field ? (
                    <WorkflowInputControl
                      field={n.config.field}
                      title={n.title}
                      value={values[n.id]?.value ?? n.config.field.defaultValue}
                      onChange={value =>
                        setValues(v => ({ ...v, [n.id]: { value } }))
                      }
                      organizationId={organizationId}
                      context={JSON.stringify(
                        fields.map(x => ({
                          label: x.title,
                          value: x.config.field
                            ? fieldPrompt(
                                x.config.field,
                                values[x.id]?.value ??
                                  x.config.field.defaultValue
                              )
                            : (values[x.id]?.text ?? x.config.text),
                        }))
                      )}
                      productIds={fields
                        .filter(x => x.config.field?.kind === "product")
                        .map(x =>
                          Number(
                            values[x.id]?.value ?? x.config.field?.defaultValue
                          )
                        )
                        .filter(Boolean)}
                      imageKeys={fields
                        .filter(
                          x =>
                            x.config.field?.kind === "asset" ||
                            x.type === "image"
                        )
                        .map(
                          x =>
                            values[x.id]?.value ??
                            values[x.id]?.imageKey ??
                            x.config.field?.defaultValue ??
                            x.config.imageKey ??
                            ""
                        )
                        .filter(Boolean)}
                    />
                  ) : n.type === "image" ? (
                    <select
                      value={values[n.id]?.imageKey ?? n.config.imageKey ?? ""}
                      onChange={e =>
                        setValues(v => ({
                          ...v,
                          [n.id]: { imageKey: e.target.value },
                        }))
                      }
                    >
                      <option value="">Choose an image</option>
                      {assets.data
                        ?.filter(a => a.mediaType === "image")
                        .map(a => (
                          <option value={a.key} key={a.key}>
                            {a.name}
                            {a.width && a.height
                              ? ` · ${a.width} × ${a.height}`
                              : ""}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <textarea
                      rows={5}
                      maxLength={10000}
                      value={values[n.id]?.text ?? n.config.text}
                      onChange={e =>
                        setValues(v => ({
                          ...v,
                          [n.id]: { text: e.target.value },
                        }))
                      }
                    />
                  )}
                </div>
              ))
          ) : (
            <p>
              This App uses its published configuration. Open the workflow to
              change its accounts, dates, or process and publish a new version.
            </p>
          )}
          <Button
            disabled={!!active || quote.isPending || run.isPending}
            onClick={async () => {
              try {
                const inputs = input();
                for (const n of fields) {
                  const f = n.config.field;
                  if (!f) continue;
                  const c = f.visibleWhen;
                  if (
                    c &&
                    inputs.find(x => x.id === c.fieldId)?.value !== c.equals
                  )
                    continue;
                  const problem = fieldValueProblem(
                    f,
                    inputs.find(x => x.id === n.id)?.value ?? ""
                  );
                  if (problem) throw new Error(`${n.title}: ${problem}`);
                }
                const q = await quote.mutateAsync({
                  organizationId,
                  id: item.workflowId,
                  revision: item.workflowRevision,
                  appVersionId: id,
                  inputs,
                });
                setReview({
                  credits: q.credits,
                  requestId: crypto.randomUUID(),
                  inputs,
                });
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            {quote.isPending ? "Estimating…" : "Run App"}
          </Button>
        </section>
        <section className="wf-app-results">
          <h2>Latest result {latest && <span>· {latest.status}</span>}</h2>
          {latest?.error && <p role="alert">{latest.error}</p>}
          {!latest && (
            <p>Run this App to see its outputs and review any actions.</p>
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
                <img src={v.url} alt={v.name} />
              ) : v.type === "video" ? (
                <video src={v.url} controls />
              ) : v.type === "publication" ? (
                <Link href={`/app/publishing?publication=${v.id}`}>
                  {v.name} →
                </Link>
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
              Stop after current step
            </Button>
          )}
        </section>
      </div>
      <Dialog
        open={!!review}
        onOpenChange={open => !open && !run.isPending && setReview(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run {item.name}?</DialogTitle>
            <DialogDescription>
              Uses the published version and the inputs shown. Delivery steps
              can queue approved publications; ad activation requires its own
              review.
            </DialogDescription>
          </DialogHeader>
          <div className="wf-credit-total">
            <strong>{review?.credits}</strong>
            <span>estimated AI credits</span>
          </div>
          <Button
            disabled={run.isPending}
            onClick={async () => {
              if (!review) return;
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
                await detail.refetch();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Confirm run
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
