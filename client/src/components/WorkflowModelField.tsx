import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { VisualSelect, ChoiceField } from "./choices/VisualSelect";
import { ModelSettings } from "./ModelPicker";
import { appFieldSchema, type AppField } from "@shared/workflowInputs";
import {
  type WorkflowGraph,
  type WorkflowNode,
} from "@shared/creativeWorkflow";
import {
  workflowModelKind,
  workflowModel,
  defaultWorkflowModel,
  type WorkflowModelKind,
} from "@shared/workflowModelCatalog";
import {
  workflowModelCompatibility,
  workflowModelFieldDefaults,
} from "@shared/workflowModels";
import { generationModel, modelDefaults } from "@shared/modelCatalog";

function useModelCatalog(organizationId: number, kind?: WorkflowModelKind) {
  const media = trpc.models.catalog.useQuery(
    { organizationId },
    { enabled: kind !== "text", staleTime: 60000 }
  );
  const text = trpc.models.textCatalog.useQuery(
    { organizationId },
    { enabled: kind === "text", staleTime: 60000 }
  );
  return kind === "text" ? text : media;
}

export function WorkflowTextModelPicker({
  organizationId,
  value,
  onChange,
  disabled,
}: {
  organizationId: number;
  value?: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const catalog = trpc.models.textCatalog.useQuery(
    { organizationId },
    { staleTime: 60000 }
  );
  return (
    <ChoiceField>
      Generation model
      <VisualSelect
        density="compact"
        value={value ?? defaultWorkflowModel("text")}
        disabled={disabled || !catalog.data}
        onChange={e => onChange(e.target.value)}
      >
        {(
          catalog.data ?? [
            {
              id: defaultWorkflowModel("text"),
              name: "GPT-5.5",
              available: true,
            },
          ]
        ).map(m => (
          <option key={m.id} value={m.id} disabled={!m.available}>
            {m.name}
            {m.available ? "" : " · unavailable"}
          </option>
        ))}
      </VisualSelect>
      {catalog.error && <small>Could not load text models. Try again.</small>}
    </ChoiceField>
  );
}

export function WorkflowModelInput({
  field,
  title,
  value,
  onChange,
  organizationId,
}: {
  field: AppField;
  title: string;
  value: string;
  onChange: (value: string) => void;
  organizationId: number;
}) {
  const catalog = useModelCatalog(organizationId, field.modelKind);
  const allowed = field.allowedModelIds ?? [];
  return (
    <div className="wf-model-input space-y-2">
      <ChoiceField>
        <VisualSelect
          density="compact"
          aria-label={title}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={field.locked || allowed.length === 1 || !catalog.data}
        >
          {allowed.map(id => {
            const model = catalog.data?.find(m => m.id === id);
            return (
              <option key={id} value={id} disabled={!model?.available}>
                {workflowModel(id)?.name ?? id}
                {model?.available ? "" : " · unavailable"}
              </option>
            );
          })}
        </VisualSelect>
      </ChoiceField>
      <small>
        {allowed.length === 1
          ? "One model set by the App creator."
          : "Choose one model from the options allowed by the App creator. Credits update when you review the run."}
      </small>
      {catalog.error && (
        <p role="alert">Could not load model availability. Try again.</p>
      )}
      {catalog.isLoading && <p>Checking model availability…</p>}
      {catalog.data && !catalog.data.find(m => m.id === value)?.available && (
        <p role="alert">
          {catalog.data.find(m => m.id === value)?.reason ??
            "The selected model is unavailable. Choose another allowed model or ask the App creator to update this App."}
        </p>
      )}
    </div>
  );
}

export function WorkflowModelFieldEditor({
  graph,
  node,
  organizationId,
  onChange,
}: {
  graph: WorkflowGraph;
  node: WorkflowNode;
  organizationId: number;
  onChange: (graph: WorkflowGraph) => void;
}) {
  const field = node.config.field!;
  const kind = field.modelKind ?? "image";
  const catalog = useModelCatalog(organizationId, kind);
  const [search, setSearch] = useState("");
  const [settingsId, setSettingsId] = useState("");
  const targets = graph.nodes.filter(n => workflowModelKind(n.type) === kind);
  const target = targets.find(n =>
    graph.edges.some(
      e => e.source === node.id && e.target === n.id && e.port === "model"
    )
  );
  const allowed = field.allowedModelIds ?? [];
  const update = (patch: Partial<AppField>) =>
    onChange({
      ...graph,
      nodes: graph.nodes.map(n =>
        n.id === node.id
          ? {
              ...n,
              config: {
                ...n.config,
                field: { ...field, ...patch },
                fieldValue: undefined,
              },
            }
          : n
      ),
    });
  const bind = (nextKind: WorkflowModelKind, nextTarget?: WorkflowNode) => {
    const defaults = nextTarget
      ? workflowModelFieldDefaults(nextTarget)
      : {
          modelKind: nextKind,
          allowedModelIds: [defaultWorkflowModel(nextKind)],
          defaultValue: defaultWorkflowModel(nextKind),
          modelSettings: {},
        };
    onChange({
      ...graph,
      nodes: graph.nodes.map(n =>
        n.id === node.id
          ? {
              ...n,
              config: {
                ...n.config,
                field: appFieldSchema.parse({ ...field, ...defaults }),
                fieldValue: undefined,
              },
            }
          : n
      ),
      edges: [
        ...graph.edges.filter(e => e.source !== node.id),
        ...(nextTarget
          ? [
              {
                id: crypto.randomUUID(),
                source: node.id,
                target: nextTarget.id,
                port: "model",
              },
            ]
          : []),
      ],
    });
    setSearch("");
    setSettingsId("");
  };
  const choices = (catalog.data ?? []).filter(
    m => m.kind === kind && m.enabled !== false
  );
  const availableIds = new Set(choices.map(m => m.id));
  const settingsModel = allowed.includes(settingsId)
    ? settingsId
    : field.defaultValue;
  return (
    <div className="wf-model-field space-y-3">
      <ChoiceField>
        Model type
        <VisualSelect
          density="compact"
          value={kind}
          onChange={e => {
            const next = e.target.value as WorkflowModelKind;
            bind(
              next,
              graph.nodes.find(
                n =>
                  workflowModelKind(n.type) === next &&
                  !graph.edges.some(
                    edge =>
                      edge.target === n.id &&
                      edge.port === "model" &&
                      edge.source !== node.id
                  )
              )
            );
          }}
        >
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="text">Text / LLM</option>
        </VisualSelect>
      </ChoiceField>
      <ChoiceField>
        Generation step
        <VisualSelect
          density="compact"
          value={target?.id ?? ""}
          onChange={e =>
            bind(
              kind,
              targets.find(n => n.id === e.target.value)
            )
          }
        >
          <option value="">Choose a step</option>
          {targets.map(n => (
            <option
              key={n.id}
              value={n.id}
              disabled={graph.edges.some(
                e =>
                  e.target === n.id &&
                  e.port === "model" &&
                  e.source !== node.id
              )}
            >
              {n.title}
            </option>
          ))}
        </VisualSelect>
      </ChoiceField>
      {!target && (
        <p className="wf-field-warning">
          Add or choose a{" "}
          {kind === "text" ? "AI prompt writer" : `Generate ${kind}`} step to
          use this field.
        </p>
      )}
      <div>
        <h3>Allowed models · {allowed.length}</h3>
        <p>
          Starts with one model. Enable the alternatives users may select. Each
          run uses exactly one model.
        </p>
        <input
          aria-label="Search allowed models"
          placeholder="Search models…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="wf-choice-list">
          {choices
            .filter(
              m =>
                allowed.includes(m.id) ||
                m.name.toLowerCase().includes(search.toLowerCase())
            )
            .map(m => {
              const included = allowed.includes(m.id);
              const reason =
                m.reason ||
                (target
                  ? workflowModelCompatibility(
                      graph,
                      target,
                      "routeId" in m ? m.routeId : m.id,
                      field.modelSettings?.[m.id]
                    )
                  : "Choose a generation step first.");
              return (
                <label key={m.id}>
                  <input
                    type="checkbox"
                    aria-label={`Allow ${m.name}`}
                    checked={included}
                    disabled={
                      included
                        ? allowed.length === 1
                        : !!reason || allowed.length >= 50
                    }
                    onChange={e => {
                      const ids = e.target.checked
                        ? [...allowed, m.id]
                        : allowed.filter(id => id !== m.id);
                      const definition = generationModel(
                        "routeId" in m ? m.routeId : m.id
                      );
                      const modelSettings = Object.fromEntries(
                        ids.map(id => [
                          id,
                          field.modelSettings?.[id] ??
                            (id === m.id && definition
                              ? modelDefaults(definition)
                              : {}),
                        ])
                      );
                      update({
                        allowedModelIds: ids,
                        defaultValue: ids.includes(field.defaultValue)
                          ? field.defaultValue
                          : ids[0],
                        modelSettings,
                      });
                    }}
                  />
                  <span>
                    {m.name}
                    {reason && (
                      <small className="block text-muted-foreground">
                        {reason}
                      </small>
                    )}
                  </span>
                </label>
              );
            })}
          {allowed
            .filter(id => !availableIds.has(id))
            .map(id => (
              <div key={id}>
                {workflowModel(id)?.name ?? id} · unavailable{" "}
                {allowed.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const ids = allowed.filter(value => value !== id);
                      update({
                        allowedModelIds: ids,
                        defaultValue: ids.includes(field.defaultValue)
                          ? field.defaultValue
                          : ids[0],
                      });
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
        </div>
        {catalog.isLoading && <p>Loading models…</p>}
        {catalog.error && <p role="alert">Could not load models. Try again.</p>}
      </div>
      <ChoiceField>
        Default model
        <VisualSelect
          density="compact"
          value={field.defaultValue}
          onChange={e => update({ defaultValue: e.target.value })}
        >
          {allowed.map(id => (
            <option key={id} value={id}>
              {workflowModel(id)?.name ?? id}
            </option>
          ))}
        </VisualSelect>
      </ChoiceField>
      {kind !== "text" && (
        <details>
          <summary>Settings for each allowed model</summary>
          <p>
            These settings are saved with this App and used for the selected
            model’s credit estimate and generation.
          </p>
          <ChoiceField>
            Configure model
            <VisualSelect
              density="compact"
              value={settingsModel}
              onChange={e => setSettingsId(e.target.value)}
            >
              {allowed.map(id => (
                <option key={id} value={id}>
                  {workflowModel(id)?.name ?? id}
                </option>
              ))}
            </VisualSelect>
          </ChoiceField>
          <ModelSettings
            organizationId={organizationId}
            modelId={settingsModel}
            options={field.modelSettings?.[settingsModel]}
            onChange={options =>
              update({
                modelSettings: {
                  ...field.modelSettings,
                  [settingsModel]: options,
                },
              })
            }
          />
        </details>
      )}
    </div>
  );
}
