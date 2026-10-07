import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  newWorkflowNode,
  workflowNodes,
  type WorkflowGraph,
} from "@shared/creativeWorkflow";
import {
  appFieldSchema,
  inputKinds,
  inputLabels,
  systemInputChoices,
  isChoiceField,
  type AppField,
  type InputChoice,
} from "@shared/workflowInputs";
import { Button } from "./ui/button";
import { WorkflowInputControl } from "./WorkflowInputControl";

export function WorkflowFormEditor({
  graph,
  onChange,
  organizationId,
  preview = false,
  fieldId,
}: {
  graph: WorkflowGraph;
  onChange: (g: WorkflowGraph) => void;
  organizationId: number;
  preview?: boolean;
  fieldId?: string;
}) {
  const [kind, setKind] = useState<AppField["kind"]>("theme");
  const [selected, setSelected] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState("");
  const [count, setCount] = useState(5);
  const [proposals, setProposals] = useState<InputChoice[]>([]);
  const assist = trpc.workflows.assistInput.useMutation();
  const fields = graph.nodes.filter(
    n => n.type === "app_input" && n.config.field
  );
  const node = fields.find(n => n.id === (fieldId ?? selected)) ?? fields[0];
  const f = node?.config.field;
  const update = (patch: Partial<AppField>) => {
    if (!node || !f) return;
    onChange({
      ...graph,
      nodes: graph.nodes.map(n =>
        n.id === node.id
          ? {
              ...n,
              config: {
                ...n.config,
                field: { ...f, ...patch },
                fieldValue: undefined,
              },
            }
          : n
      ),
    });
  };
  const current = Object.fromEntries(
    fields.map(n => [n.id, values[n.id] ?? n.config.field!.defaultValue])
  );
  if (preview)
    return (
      <section className="wf-form-preview">
        <h2>App preview</h2>
        <p>This preview does not run the workflow or spend credits.</p>
        {fields.length ? (
          fields.map(n => {
            const field = n.config.field!;
            if (
              field.visibleWhen &&
              current[field.visibleWhen.fieldId] !== field.visibleWhen.equals
            )
              return null;
            return (
              <div className="wf-form-field" key={n.id}>
                <label>
                  {n.title}
                  {field.required ? " *" : ""}
                </label>
                <WorkflowInputControl
                  field={field}
                  title={n.title}
                  value={current[n.id]}
                  organizationId={organizationId}
                  preview
                  onChange={v => setValues(old => ({ ...old, [n.id]: v }))}
                />
              </div>
            );
          })
        ) : (
          <p>
            Add fields in App form to preview them here. Existing text and image
            steps remain available in the published App.
          </p>
        )}
      </section>
    );
  return (
    <section className={`wf-form-editor ${fieldId ? "wf-form-inspector" : ""}`}>
      {!fieldId && (
        <aside>
          <h2>App form</h2>
          <p>
            Choose what users provide. Connect each field to the steps that need
            it.
          </p>
          <select
            aria-label="New field type"
            value={kind}
            onChange={e => setKind(e.target.value as AppField["kind"])}
          >
            {inputKinds.map(k => (
              <option key={k} value={k}>
                {inputLabels[k]}
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              if (graph.nodes.length >= 40) {
                toast.error("This workflow has reached 40 steps.");
                return;
              }
              const n = newWorkflowNode(
                "app_input",
                crypto.randomUUID(),
                60,
                80 + fields.length * 120
              );
              n.title = inputLabels[kind];
              n.config.field = appFieldSchema.parse({
                kind,
                source: systemInputChoices(kind).length ? "system" : "custom",
              });
              onChange({ ...graph, nodes: [...graph.nodes, n] });
              setSelected(n.id);
            }}
          >
            + Add field
          </Button>
          {fields.map((n, index) => (
            <div className="wf-field-row" key={n.id}>
              <button
                className={node?.id === n.id ? "is-selected" : ""}
                onClick={() => {
                  setSelected(n.id);
                  setProposals([]);
                }}
              >
                {n.title}
                <small>{inputLabels[n.config.field!.kind]}</small>
              </button>
              <button
                aria-label={`Move ${n.title} up`}
                disabled={!index}
                onClick={() => {
                  const nodes = [...graph.nodes];
                  const a = nodes.findIndex(x => x.id === n.id),
                    b = nodes.findIndex(x => x.id === fields[index - 1].id);
                  [nodes[a], nodes[b]] = [nodes[b], nodes[a]];
                  onChange({ ...graph, nodes });
                }}
              >
                ↑
              </button>
            </div>
          ))}
        </aside>
      )}
      {node && f ? (
        <div className="wf-field-settings" key={node.id}>
          <h2>{node.title}</h2>
          <label>
            Field label
            <input
              value={node.title}
              maxLength={100}
              onChange={e =>
                onChange({
                  ...graph,
                  nodes: graph.nodes.map(n =>
                    n.id === node.id ? { ...n, title: e.target.value } : n
                  ),
                })
              }
            />
          </label>
          <label>
            Help text
            <input
              value={f.help}
              maxLength={600}
              onChange={e => update({ help: e.target.value })}
            />
          </label>
          <div className="wf-field-flags">
            <label>
              <input
                type="checkbox"
                checked={f.required}
                onChange={e => update({ required: e.target.checked })}
              />
              Required
            </label>
            <label>
              <input
                type="checkbox"
                checked={f.locked}
                onChange={e => update({ locked: e.target.checked })}
              />
              Lock default value
            </label>
          </div>
          {isChoiceField(f) && (
            <>
              <label>
                Available choices
                <select
                  value={f.source}
                  onChange={e =>
                    update({
                      source: e.target.value as AppField["source"],
                      options:
                        e.target.value === "curated"
                          ? systemInputChoices(f.kind)
                          : f.options,
                      defaultValue: "",
                    })
                  }
                >
                  {systemInputChoices(f.kind).length > 0 && (
                    <>
                      <option value="system">All system choices</option>
                      <option value="curated">Choose a subset</option>
                    </>
                  )}
                  <option value="custom">My own list</option>
                </select>
              </label>
              {f.source === "curated" && (
                <details>
                  <summary>
                    {f.options.length} choices included · edit selection
                  </summary>
                  <Button
                    variant="outline"
                    onClick={() =>
                      update({ options: systemInputChoices(f.kind) })
                    }
                  >
                    Select all
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => update({ options: [], defaultValue: "" })}
                  >
                    Clear
                  </Button>
                  <div className="wf-choice-list">
                    {systemInputChoices(f.kind).map(o => (
                      <label key={o.id}>
                        <input
                          type="checkbox"
                          checked={f.options.some(x => x.id === o.id)}
                          onChange={e =>
                            update({
                              options: e.target.checked
                                ? [...f.options, o]
                                : f.options.filter(x => x.id !== o.id),
                              defaultValue: "",
                            })
                          }
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </details>
              )}
              {f.source === "custom" && (
                <>
                  <div className="wf-custom-choices">
                    {f.options.map((o, i) => (
                      <div key={o.id}>
                        <input
                          aria-label={`Choice ${i + 1} name`}
                          value={o.label}
                          maxLength={160}
                          onChange={e =>
                            update({
                              options: f.options.map(x =>
                                x.id === o.id
                                  ? { ...x, label: e.target.value }
                                  : x
                              ),
                            })
                          }
                        />
                        <textarea
                          aria-label={`Choice ${i + 1} instructions`}
                          value={o.direction}
                          maxLength={2000}
                          placeholder="Creative instructions for this choice"
                          onChange={e =>
                            update({
                              options: f.options.map(x =>
                                x.id === o.id
                                  ? { ...x, direction: e.target.value }
                                  : x
                              ),
                            })
                          }
                        />
                        <button
                          onClick={() =>
                            update({
                              options: f.options.filter(x => x.id !== o.id),
                              defaultValue: "",
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    disabled={f.options.length >= 200}
                    onClick={() =>
                      update({
                        options: [
                          ...f.options,
                          {
                            id: crypto.randomUUID(),
                            label: "New choice",
                            direction: "",
                          },
                        ],
                      })
                    }
                  >
                    Add choice
                  </Button>
                </>
              )}
              <details>
                <summary>Generate a new list with AI</summary>
                <label>
                  Describe the choices
                  <textarea
                    value={direction}
                    maxLength={3000}
                    onChange={e => setDirection(e.target.value)}
                    placeholder="Seasonal themes for a premium jewelry brand…"
                  />
                </label>
                <label>
                  Number of choices
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={count}
                    onChange={e => setCount(Number(e.target.value))}
                  />
                </label>
                <Button
                  disabled={assist.isPending || !direction.trim()}
                  onClick={async () => {
                    try {
                      setProposals(
                        (
                          await assist.mutateAsync({
                            organizationId,
                            field: f,
                            title: node.title,
                            direction,
                            count,
                            mode: "choices",
                          })
                        ).options
                      );
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  {assist.isPending ? "Generating…" : "Generate choices"}
                </Button>
                <small>
                  Uses AI credits. Your current list stays unchanged until you
                  apply the result.
                </small>
                {proposals.length > 0 && (
                  <>
                    <div className="wf-choice-list">
                      {proposals.map(o => (
                        <div key={o.id}>
                          <strong>{o.label}</strong>
                          <p>{o.direction}</p>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={() => {
                        update({
                          source: "custom",
                          options: proposals,
                          defaultValue: "",
                        });
                        setProposals([]);
                      }}
                    >
                      Use this list
                    </Button>
                  </>
                )}
              </details>
              <label>
                <input
                  type="checkbox"
                  checked={f.multiple}
                  disabled={f.kind === "size"}
                  onChange={e =>
                    update({ multiple: e.target.checked, defaultValue: "" })
                  }
                />
                Allow multiple selections
              </label>
              {f.multiple && (
                <label>
                  Maximum selections
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={f.maxSelections}
                    onChange={e =>
                      update({ maxSelections: Number(e.target.value) })
                    }
                  />
                </label>
              )}
            </>
          )}
          <label>Default value</label>
          <WorkflowInputControl
            field={{ ...f, locked: false, ai: false }}
            title={node.title}
            value={f.defaultValue}
            organizationId={organizationId}
            onChange={v => update({ defaultValue: v })}
          />
          {!isChoiceField(f) &&
            !["asset", "product", "url", "number"].includes(f.kind) && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={f.ai}
                    onChange={e => update({ ai: e.target.checked })}
                  />
                  Let users generate alternatives with AI
                </label>
                {f.ai && (
                  <label>
                    AI instructions
                    <textarea
                      value={f.aiInstructions}
                      maxLength={3000}
                      onChange={e => update({ aiInstructions: e.target.value })}
                    />
                  </label>
                )}
              </>
            )}
          <details>
            <summary>Conditional visibility</summary>
            <label>
              Show when
              <select
                value={f.visibleWhen?.fieldId ?? ""}
                onChange={e =>
                  update({
                    visibleWhen: e.target.value
                      ? { fieldId: e.target.value, equals: "" }
                      : undefined,
                  })
                }
              >
                <option value="">Always visible</option>
                {fields
                  .filter(n => n.id !== node.id)
                  .map(n => (
                    <option value={n.id} key={n.id}>
                      {n.title}
                    </option>
                  ))}
              </select>
            </label>
            {f.visibleWhen && (
              <label>
                Equals (choice ID or value)
                <input
                  value={f.visibleWhen.equals}
                  onChange={e =>
                    update({
                      visibleWhen: {
                        ...f.visibleWhen!,
                        equals: e.target.value,
                      },
                    })
                  }
                />
              </label>
            )}
          </details>
          <h3>Use this field in</h3>
          <p>
            Connect to generation, copy, optimization or other steps. A size
            field sets the format of directly connected generation steps.
          </p>
          {graph.nodes
            .filter(
              n =>
                n.id !== node.id &&
                n.type !== "app_input" &&
                workflowNodes[n.type].inputs.length
            )
            .map(n => {
              const port = workflowNodes[n.type].inputs.find(
                p =>
                  p.type === (f.kind === "asset" ? "image" : "text") ||
                  p.type === "any"
              );
              if (!port) return null;
              const connected = graph.edges.some(
                e => e.source === node.id && e.target === n.id
              );
              return (
                <label key={n.id}>
                  <input
                    type="checkbox"
                    checked={connected}
                    onChange={e =>
                      onChange({
                        ...graph,
                        edges: e.target.checked
                          ? [
                              ...graph.edges,
                              {
                                id: crypto.randomUUID(),
                                source: node.id,
                                target: n.id,
                                port: port.id,
                              },
                            ]
                          : graph.edges.filter(
                              edge =>
                                !(
                                  edge.source === node.id &&
                                  edge.target === n.id
                                )
                            ),
                      })
                    }
                  />
                  {n.title}
                </label>
              );
            })}
          {!graph.edges.some(e => e.source === node.id) && (
            <p className="wf-field-warning">
              This field is not connected yet. Select a step above so its value
              affects the result.
            </p>
          )}
          <Button
            variant="outline"
            onClick={() => {
              onChange({
                ...graph,
                nodes: graph.nodes.filter(n => n.id !== node.id),
                edges: graph.edges.filter(
                  e => e.source !== node.id && e.target !== node.id
                ),
              });
              setSelected("");
            }}
          >
            Remove field
          </Button>
        </div>
      ) : (
        <div className="wf-field-settings">
          <h2>Design your App’s inputs</h2>
          <p>
            Add reusable fields, curate the available choices, and connect them
            to workflow steps. Changes are saved as part of the workflow draft.
          </p>
        </div>
      )}
    </section>
  );
}
