import { WorkflowMediaControl } from "./WorkflowMediaControl";
import { WorkflowConnectionInput } from "./WorkflowConnectionInput";
import { useEffect, type ReactNode } from "react";
import {
  ClipboardCheck,
  FileText,
  SlidersHorizontal,
  Sparkles,
  LayoutDashboard,
  ArrowLeft,
  ArrowRight,
  Pencil,
} from "lucide-react";
import type { WorkflowGraph, WorkflowNode } from "@shared/creativeWorkflow";
import {
  fieldChoices,
  parseWorkflowMediaSelection,
  fieldPrompt,
  isChoiceField,
  parsePerformanceInput,
  selectionValues,
} from "@shared/workflowInputs";
import {
  workflowAppFields,
  workflowFieldValue,
  workflowStudioGroups,
} from "@shared/workflowStudio";
import { trpc } from "@/lib/trpc";
import { WorkflowInputControl } from "./WorkflowInputControl";
import { StudioSections } from "./configurator/StudioSections";
import { studioCategoryIcon } from "./configurator/studioCategoryIcons";
import { StudioCategories } from "./configurator/StudioCategories";
import {
  scrollStudioChoices,
  useStudioNavigation,
} from "./configurator/studioNavigation";
import "@/styles/configurator.css";
import "@/styles/workflowStudio.css";

const icons = {
  setup: SlidersHorizontal,
  direction: Sparkles,
  content: FileText,
};

/** One form renderer for the editor preview and every published App version. */
export function WorkflowAppStudio({
  graph,
  organizationId,
  title,
  description,
  header,
  values,
  onChange,
  page,
  onPageChange,
  preview = false,
  busy = false,
  review,
  results,
  status,
  error,
}: {
  graph: WorkflowGraph;
  organizationId: number;
  title: string;
  description?: string;
  header?: ReactNode;
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  page: string;
  onPageChange: (page: string) => void;
  preview?: boolean;
  busy?: boolean;
  review?: ReactNode;
  results?: ReactNode;
  status?: string;
  error?: string;
}) {
  const root = useStudioNavigation();
  useEffect(() => {
    if (error)
      root.current
        ?.querySelector<HTMLElement>('[role="alert"]')
        ?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [error, root]);
  const assets = trpc.assetLibrary.studioList.useQuery({ organizationId });
  const groups = workflowStudioGroups(graph, values);
  const fields = workflowAppFields(graph);
  const inputPages = groups.flatMap(s => s.categories);
  const pages = [
    ...inputPages,
    { id: "review", title: "Summary & run", fields: [] },
    { id: "results", title: "Latest run", fields: [] },
  ];
  const current = pages.find(p => p.id === page) ?? pages[0];
  const section = groups.find(s => s.categories.some(c => c.id === current.id));
  const sections = [
    ...groups.map(s => ({ ...s, icon: icons[s.id] })),
    {
      id: "review",
      title: "Review & run",
      subtitle: "Check inputs & credits",
      icon: ClipboardCheck,
    },
    {
      id: "results",
      title: "Results",
      subtitle: "Progress & outputs",
      icon: LayoutDashboard,
    },
  ];
  const index = pages.indexOf(current);
  useEffect(() => {
    if (page && !error) scrollStudioChoices(root.current);
  }, [page, root]);
  const select = onPageChange;
  const value = (node: WorkflowNode) => workflowFieldValue(node, values);
  const context = JSON.stringify(
    fields.map(n => ({
      label: n.title,
      value: n.config.field ? fieldPrompt(n.config.field, value(n)) : value(n),
    }))
  );
  const productIds = fields
    .filter(n => ["asset", "product"].includes(n.config.field?.kind ?? ""))
    .map(
      n =>
        parseWorkflowMediaSelection(
          value(n),
          n.config.field?.kind === "product" ? "product" : "asset"
        )?.productId
    )
    .filter((id): id is number => !!id);
  const imageKeys = fields
    .filter(
      n =>
        ["asset", "product"].includes(n.config.field?.kind ?? "") ||
        n.type === "image"
    )
    .map(
      n =>
        parseWorkflowMediaSelection(
          value(n),
          n.config.field?.kind === "product" ? "product" : "asset"
        )?.imageKey
    )
    .filter((key): key is string => !!key);
  const summarize = (node: WorkflowNode) => {
    const raw = value(node),
      field = node.config.field;
    if (!raw) return "Not provided";
    if (field?.kind === "connection")
      return (
        <WorkflowConnectionInput
          organizationId={organizationId}
          value={raw}
          onChange={() => {}}
          channel={field.connectionChannel}
          title={node.title}
          summary
        />
      );
    if (field && isChoiceField(field))
      return (
        selectionValues(raw, field.multiple)
          .map(id => fieldChoices(field).find(o => o.id === id)?.label ?? id)
          .join(", ") || "Not provided"
      );
    if (field?.kind === "performance_data") {
      const request = parsePerformanceInput(raw);
      return request
        ? `Selected account · ${request.range.since} to ${request.range.until}`
        : "Choose an account and dates";
    }
    if (field?.kind === "asset" || field?.kind === "product")
      return (
        <WorkflowMediaControl
          field={field}
          value={raw}
          onChange={() => {}}
          organizationId={organizationId}
          summary
        />
      );
    if (node.type === "image")
      return assets.data?.find(a => a.key === raw)?.name ?? "Selected image";
    return raw;
  };
  return (
    <div
      ref={root}
      className={`cfg-root wf-studio${preview ? " wf-studio-preview" : ""}`}
    >
      <header className="cfg-heading">
        <div>
          {header}
          <div className="cfg-title">
            <h1>{title}</h1>
            <span className="cfg-pilot">
              {preview ? "App preview" : "App Studio"}
            </span>
          </div>
        </div>
        {status && (
          <button
            type="button"
            className="cfg-secondary"
            onClick={() => select("results")}
          >
            {status} <ArrowRight size={15} />
          </button>
        )}
      </header>
      {preview ? (
        <p className="wf-studio-description">
          This preview does not run the workflow or spend credits.
        </p>
      ) : (
        description && <p className="wf-studio-description">{description}</p>
      )}
      <StudioSections
        label="App Studio sections"
        items={sections}
        current={section?.id ?? current.id}
        onSelect={id =>
          select(groups.find(s => s.id === id)?.categories[0].id ?? id)
        }
      />
      <div className="cfg-body">
        <StudioCategories
          items={(section?.categories ?? [current]).map(category => ({
            ...category,
            icon: studioCategoryIcon(
              category.fields[0]?.config.field?.kind ?? category.id,
              category.title
            ),
          }))}
          current={current.id}
          onSelect={select}
        />
        {error && (
          <p role="alert" className="wf-studio-error">
            {error}
          </p>
        )}
        {/* Keep input controls mounted so navigation preserves in-progress AI suggestions. */}
        {inputPages.map(category => (
          <section
            key={category.id}
            hidden={current.id !== category.id}
            aria-label={`${category.title} inputs`}
          >
            <div className="cfg-content-title">
              <div>
                <h2>{category.title}</h2>
                <p>Set the inputs this App will use.</p>
              </div>
              <span>
                {category.fields.length}{" "}
                {category.fields.length === 1 ? "field" : "fields"}
              </span>
            </div>
            <fieldset disabled={busy} className="wf-studio-fields">
              {category.fields.map(n => (
                <div
                  className={`wf-form-field${n.config.field && isChoiceField(n.config.field) ? " wf-form-field-visual" : ""}`}
                  key={n.id}
                >
                  {(category.fields.length > 1 ||
                    n.title !== category.title ||
                    n.config.field?.required ||
                    n.config.field?.locked) && (
                    <div className="wf-studio-field-label">
                      {(category.fields.length > 1 ||
                        n.title !== category.title) &&
                        n.title}
                      {n.config.field?.required && <span>Required</span>}
                      {n.config.field?.locked && <span>Preset</span>}
                    </div>
                  )}
                  {n.config.field ? (
                    <WorkflowInputControl
                      field={n.config.field}
                      title={n.title}
                      value={value(n)}
                      onChange={v => onChange(n.id, v)}
                      organizationId={organizationId}
                      preview={preview}
                      context={context}
                      productIds={productIds}
                      imageKeys={imageKeys}
                    />
                  ) : n.type === "image" ? (
                    <select
                      aria-label={n.title}
                      value={value(n)}
                      onChange={e => onChange(n.id, e.target.value)}
                    >
                      <option value="">Choose an image</option>
                      {assets.data
                        ?.filter(a => a.mediaType === "image")
                        .map(a => (
                          <option key={a.key} value={a.key}>
                            {a.name}
                            {a.width && a.height
                              ? ` · ${a.width} × ${a.height}`
                              : ""}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <textarea
                      aria-label={n.title}
                      rows={5}
                      maxLength={10000}
                      value={value(n)}
                      onChange={e => onChange(n.id, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </fieldset>
          </section>
        ))}
        <section
          hidden={current.id !== "review"}
          aria-label="Review App inputs"
        >
          <div className="cfg-content-title">
            <div>
              <h2>Ready to run?</h2>
              <p>Review your inputs, then check the estimated credits.</p>
            </div>
          </div>
          {inputPages.length ? (
            <div className="wf-studio-summary">
              {groups.map(group => (
                <div key={group.id} className="wf-studio-summary-section">
                  <h3>{group.title}</h3>
                  {group.categories.map(category => (
                    <article key={category.id}>
                      <div className="wf-studio-summary-heading">
                        <h4>{category.title}</h4>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => select(category.id)}
                          aria-label={`Edit ${group.title}: ${category.title}`}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                      </div>
                      <dl>
                        {category.fields.map(n => (
                          <div key={n.id}>
                            <dt>{n.title}</dt>
                            <dd>{summarize(n)}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p>
              This App uses its published configuration. There are no inputs to
              fill in.
            </p>
          )}
          {preview ? (
            <div className="wf-studio-run">
              <p>
                In the published App, users review estimated credits here before
                confirming a run.
              </p>
              <button type="button" className="cfg-primary" disabled>
                Review credits & run
              </button>
            </div>
          ) : (
            review
          )}
        </section>
        <section hidden={current.id !== "results"} aria-label="App results">
          <div className="cfg-content-title">
            <div>
              <h2>Results</h2>
              <p>Follow progress and review everything your App creates.</p>
            </div>
          </div>
          {preview ? (
            <p>
              Run progress, outputs, and any actions requiring approval will
              appear here in the published App.
            </p>
          ) : (
            results
          )}
        </section>
        <footer className="wf-studio-footer">
          <span>
            Step {index + 1} of {pages.length}
          </span>
          <div className="cfg-actions">
            {index > 0 && (
              <button
                type="button"
                className="cfg-secondary"
                onClick={() => select(pages[index - 1].id)}
              >
                <ArrowLeft size={15} /> Previous
              </button>
            )}
            {index < inputPages.length && (
              <button
                type="button"
                className="cfg-primary"
                onClick={() => select(pages[index + 1].id)}
              >
                {pages[index + 1].id === "review"
                  ? "Review inputs"
                  : "Continue"}
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
