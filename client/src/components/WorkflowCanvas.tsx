import { WorkflowFormEditor } from "./WorkflowFormEditor";
import {
  appFieldSchema,
  inputKinds,
  inputLabels,
  systemInputChoices,
  fieldChoices,
  fieldPrompt,
  type AppField,
} from "@shared/workflowInputs";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Expand,
  Film,
  GitBranch,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  X,
  Play,
  Link2,
  GripVertical,
  Send,
  BarChart3,
  Clock,
  ShieldCheck,
  AppWindow,
  Target,
  ArrowDownToLine,
} from "lucide-react";
import { Link } from "wouter";
import { WorkflowAppPicker } from "./WorkflowAppPicker";
import { selectWorkflowApp } from "@shared/workflowAppCatalog";
import { WorkflowBusinessSettings } from "./WorkflowBusinessSettings";
import { workflowSections, workflowValueText } from "@shared/workflowPlatform";
import { toast } from "sonner";
import { ModelPicker, ModelSettings } from "./ModelPicker";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  generationModel,
  type ModelOptions,
} from "@shared/modelCatalog";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { VideoReferencePicker } from "./VideoReferencePicker";
import { AssetUploadDialog } from "./AssetUploadDialog";
import { CreativeThemeLibrary } from "./CreativeThemeLibrary";
import { CREATIVE_MOODS, CREATIVE_ART_STYLES } from "@shared/creativeBuilder";
import {
  defaultVideoDirection,
  isGenerationNode,
  newWorkflowNode,
  workflowGraphProblem,
  workflowNodes,
  workflowSignature,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeType,
  type WorkflowValue,
  type WorkflowSteps,
  type WorkflowFamily,
} from "@shared/creativeWorkflow";
import type { LibraryAsset } from "@shared/assetLibrary";

const icons = {
  text: Type,
  image: ImageIcon,
  assistant: Sparkles,
  combine: Layers,
  generate_image: ImageIcon,
  generate_video: Film,
  output: GitBranch,
  app: AppWindow,
  app_input: ArrowDownToLine,
  app_output: AppWindow,
  review: ShieldCheck,
  wait: Clock,
  facebook_post: Send,
  meta_ad: Send,
  deliver_publication: Send,
  meta_activate: Play,
  meta_report: BarChart3,
  facebook_report: BarChart3,
  compare_metrics: BarChart3,
  optimize_metric: Target,
  optimize_copy: Sparkles,
};
const NODE_WIDTH = 276;
const outPoint = (node: WorkflowNode) => ({
  x: node.x + NODE_WIDTH,
  y: node.y + 88,
});
const inPoint = (node: WorkflowNode, port: string) => ({
  x: node.x,
  y:
    node.y +
    88 +
    workflowNodes[node.type].inputs.findIndex(p => p.id === port) * 28,
});
const pathBetween = (
  a: { x: number; y: number },
  b: { x: number; y: number }
) =>
  `M${a.x},${a.y} C${a.x + Math.max(70, Math.abs(b.x - a.x) * 0.45)},${a.y} ${b.x - Math.max(70, Math.abs(b.x - a.x) * 0.45)},${b.y} ${b.x},${b.y}`;
type Run = { graph: WorkflowGraph; steps: WorkflowSteps; status: string };
export function WorkflowCanvas({
  graph,
  onChange,
  organizationId,
  role,
  run,
  onRunNode,
  busy,
  family = "create",
  connectedChannels = [],
}: {
  graph: WorkflowGraph;
  onChange: (graph: WorkflowGraph) => void;
  organizationId: number;
  role: string;
  run?: Run;
  onRunNode: (id: string) => void;
  busy: boolean;
  family?: WorkflowFamily;
  connectedChannels?: string[];
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [library, setLibrary] = useState(!graph.nodes.length),
    [nodeSearch, setNodeSearch] = useState("");
  const [paletteMode, setPaletteMode] = useState<"steps" | "fields">("steps");
  const [paletteFamily, setPaletteFamily] = useState<WorkflowFamily | "all">(
    family
  );
  const [view, setView] = useState({ x: 35, y: 40, zoom: 0.8 }),
    [connecting, setConnecting] = useState<string | null>(null),
    [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [pickImage, setPickImage] = useState<string | null>(null),
    [pickVideo, setPickVideo] = useState<string | null>(null),
    [uploadFor, setUploadFor] = useState<string | null>(null),
    [preview, setPreview] = useState<WorkflowValue | null>(null);
  const [past, setPast] = useState<WorkflowGraph[]>([]),
    [future, setFuture] = useState<WorkflowGraph[]>([]);
  const viewport = useRef<HTMLDivElement>(null),
    graphRef = useRef(graph);
  graphRef.current = graph;
  const drag = useRef<{
    kind: "pan" | "node";
    id?: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
    graph?: WorkflowGraph;
  } | null>(null);
  const assets = trpc.assetLibrary.studioList.useQuery({ organizationId });
  const selectedNode = graph.nodes.find(n => n.id === selected);
  const change = (next: WorkflowGraph, history = true) => {
    if (history) {
      setPast(p => [...p.slice(-39), graphRef.current]);
      setFuture([]);
    }
    onChange(next);
  };
  const update = (id: string, patch: Partial<WorkflowNode>) =>
    change({
      ...graphRef.current,
      nodes: graphRef.current.nodes.map(n =>
        n.id === id ? { ...n, ...patch } : n
      ),
    });
  const config = (patch: Partial<WorkflowNode["config"]>) => {
    if (selectedNode)
      update(selectedNode.id, { config: { ...selectedNode.config, ...patch } });
  };
  const undo = () => {
    if (!past.length) return;
    setFuture(f => [graph, ...f]);
    onChange(past[past.length - 1]);
    setPast(p => p.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setPast(p => [...p, graph]);
    onChange(future[0]);
    setFuture(f => f.slice(1));
  };
  const remove = (id: string) => {
    change({
      nodes: graph.nodes.filter(n => n.id !== id),
      edges: graph.edges.filter(e => e.source !== id && e.target !== id),
    });
    setSelected(null);
  };
  const fit = () => {
    const el = viewport.current;
    if (!el || !graph.nodes.length) {
      setView({ x: 35, y: 40, zoom: 0.8 });
      return;
    }
    const minX = Math.min(...graph.nodes.map(n => n.x)),
      minY = Math.min(...graph.nodes.map(n => n.y)),
      maxX = Math.max(...graph.nodes.map(n => n.x + NODE_WIDTH)),
      maxY = Math.max(...graph.nodes.map(n => n.y + 370));
    const width = Math.max(320, el.clientWidth - (selected ? 350 : 0) - 130),
      height = el.clientHeight - 100,
      zoom = Math.max(
        0.25,
        Math.min(1, width / (maxX - minX), height / (maxY - minY))
      );
    setView({
      x: 80 + (width - (maxX - minX) * zoom) / 2 - minX * zoom,
      y: 50 + (height - (maxY - minY) * zoom) / 2 - minY * zoom,
      zoom,
    });
  };
  useEffect(() => {
    const timer = setTimeout(fit, 80);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          "input,textarea,select,[contenteditable=true]"
        )
      )
        return;
      if (e.key === "Escape") {
        setConnecting(null);
        setLibrary(false);
        setSelected(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Delete" && selected) {
        e.preventDefault();
        remove(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [graph, selected, past, future]);
  const point = (clientX: number, clientY: number) => {
    const rect = viewport.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.zoom,
      y: (clientY - rect.top - view.y) / view.zoom,
    };
  };
  const connect = (target: string, port: string) => {
    if (!connecting) return;
    const next = {
        ...graph,
        edges: [
          ...graph.edges,
          { id: crypto.randomUUID(), source: connecting, target, port },
        ],
      },
      problem = workflowGraphProblem(next);
    if (problem) toast.error(problem);
    else change(next);
    setConnecting(null);
  };
  const add = (type: WorkflowNodeType, fieldKind?: AppField["kind"]) => {
    if (graph.nodes.length >= 40) {
      toast.error("Keep each workflow to 40 steps or fewer.");
      return;
    }
    const x = (120 - view.x) / view.zoom,
      y = (100 - view.y) / view.zoom;
    const node = newWorkflowNode(
      type,
      crypto.randomUUID(),
      Math.round(x + (graph.nodes.length % 3) * 45),
      Math.round(y + (graph.nodes.length % 3) * 45)
    );
    if (fieldKind) {
      node.title = inputLabels[fieldKind];
      node.config.field = appFieldSchema.parse({
        kind: fieldKind,
        source: systemInputChoices(fieldKind).length ? "system" : "custom",
      });
    }
    change({ ...graph, nodes: [...graph.nodes, node] });
    setSelected(node.id);
    setLibrary(false);
  };
  const startDrag = (e: ReactPointerEvent, id?: string) => {
    if (e.button !== 0) return;
    const node = graph.nodes.find(n => n.id === id);
    drag.current = {
      kind: node ? "node" : "pan",
      id,
      x: e.clientX,
      y: e.clientY,
      startX: node?.x ?? view.x,
      startY: node?.y ?? view.y,
      graph: graphRef.current,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (id) setSelected(id);
  };
  const move = (e: ReactPointerEvent) => {
    if (connecting) setCursor(point(e.clientX, e.clientY));
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (d.kind === "pan")
      setView(v => ({ ...v, x: d.startX + dx, y: d.startY + dy }));
    else
      onChange({
        ...graphRef.current,
        nodes: graphRef.current.nodes.map(n =>
          n.id === d.id
            ? {
                ...n,
                x: Math.max(-10000, Math.min(10000, d.startX + dx / view.zoom)),
                y: Math.max(-10000, Math.min(10000, d.startY + dy / view.zoom)),
              }
            : n
        ),
      });
  };
  const end = () => {
    const d = drag.current;
    if (d?.kind === "node" && d.graph && d.graph !== graphRef.current) {
      setPast(p => [...p.slice(-39), d.graph!]);
      setFuture([]);
    }
    drag.current = null;
  };
  const duplicate = (node: WorkflowNode) => {
    const copy = {
      ...node,
      id: crypto.randomUUID(),
      title: `${node.title.slice(0, 90)} copy`,
      x: node.x + 50,
      y: node.y + 50,
    };
    change({ ...graph, nodes: [...graph.nodes, copy] });
    setSelected(copy.id);
  };
  return (
    <div className="wf-canvas-shell">
      <div
        ref={viewport}
        className={`wf-canvas ${connecting ? "wf-connecting" : ""}`}
        aria-label="Workflow canvas"
        onPointerDown={e => {
          if (
            !(e.target as HTMLElement).closest?.(
              "[data-node],button,input,textarea,select,[data-panel],.wf-edge"
            )
          ) {
            setSelected(null);
            startDrag(e);
          }
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onWheel={e => {
          if ((e.target as HTMLElement).closest("[data-panel]")) return;
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const p = point(e.clientX, e.clientY);
            setView(v => {
              const zoom = Math.max(
                0.25,
                Math.min(1.7, v.zoom * (e.deltaY < 0 ? 1.1 : 0.9))
              );
              return {
                x: v.x + p.x * (v.zoom - zoom),
                y: v.y + p.y * (v.zoom - zoom),
                zoom,
              };
            });
          } else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
        }}
        style={{
          backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          className="wf-plane"
          style={{
            transform: `translate(${view.x}px,${view.y}px) scale(${view.zoom})`,
          }}
        >
          <svg
            className="wf-connections"
            width="1"
            height="1"
            aria-label="Connections"
          >
            {graph.edges.map(edge => {
              const source = graph.nodes.find(n => n.id === edge.source),
                target = graph.nodes.find(n => n.id === edge.target);
              if (!source || !target) return null;
              return (
                <g
                  key={edge.id}
                  className="wf-edge"
                  data-type={workflowNodes[source.type].output}
                >
                  <path
                    d={pathBetween(
                      outPoint(source),
                      inPoint(target, edge.port)
                    )}
                  />
                  <path
                    className="wf-edge-hit"
                    d={pathBetween(
                      outPoint(source),
                      inPoint(target, edge.port)
                    )}
                    onClick={() => setSelected(target.id)}
                  >
                    <title>
                      {source.title} → {target.title}
                    </title>
                  </path>
                </g>
              );
            })}
            {connecting && graph.nodes.some(n => n.id === connecting) && (
              <path
                className="wf-connection-draft"
                d={pathBetween(
                  outPoint(graph.nodes.find(n => n.id === connecting)!),
                  cursor
                )}
              />
            )}
          </svg>
          {graph.nodes.map(node => {
            const Icon = icons[node.type],
              meta = workflowNodes[node.type],
              step = run?.steps[node.id],
              stale =
                run &&
                node.type !== "app" &&
                workflowSignature(run.graph, node.id) !==
                  workflowSignature(graph, node.id);
            return (
              <article
                key={node.id}
                data-node
                data-type={node.type}
                className={`wf-node ${selected === node.id ? "is-selected" : ""}`}
                style={{ left: node.x, top: node.y }}
                aria-label={`${node.title} step`}
                onClick={() => setSelected(node.id)}
              >
                <header
                  className="wf-node-header"
                  onPointerDown={e => {
                    if (!(e.target as HTMLElement).closest("button"))
                      startDrag(e, node.id);
                  }}
                >
                  <span className="wf-node-icon">
                    <Icon size={16} />
                  </span>
                  <strong>{node.title}</strong>
                  <button
                    className="wf-icon-button"
                    title={`Settings for ${node.title}`}
                    aria-label={`Settings for ${node.title}`}
                    onClick={() => {
                      setSelected(node.id);
                      setLibrary(false);
                    }}
                  >
                    <Settings2 size={14} />
                  </button>
                  <GripVertical size={13} className="wf-drag-hint" />
                </header>
                <div className="wf-node-type">
                  {node.config.field
                    ? inputLabels[node.config.field.kind] + " field"
                    : meta.name}
                  {step && (
                    <span className={`wf-step-state ${step.status}`}>
                      {stale ? (
                        "Previous result"
                      ) : ["running", "waiting"].includes(step.status) ? (
                        <>
                          <Loader2 size={11} className="animate-spin" />{" "}
                          {step.status === "waiting" ? "Waiting" : "Running"}
                        </>
                      ) : step.status === "completed" ? (
                        <>
                          <Check size={11} /> Done
                        </>
                      ) : (
                        step.status
                      )}
                    </span>
                  )}
                </div>
                {meta.inputs.map((port, i) => (
                  <button
                    key={port.id}
                    data-type={port.type}
                    className={`wf-port wf-input-port ${connecting ? "is-connectable" : ""}`}
                    style={{ top: 88 + i * 28 }}
                    aria-label={`Connect ${port.name.toLowerCase()} to ${node.title}`}
                    title={`${port.name} input`}
                    onPointerUp={e => {
                      e.stopPropagation();
                      connect(node.id, port.id);
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      connect(node.id, port.id);
                    }}
                  >
                    <i />
                    <span>{port.name}</span>
                  </button>
                ))}
                {node.type !== "output" && (
                  <button
                    data-type={meta.output}
                    className={`wf-port wf-output-port ${connecting === node.id ? "is-linking" : ""}`}
                    style={{ top: 88 }}
                    aria-label={`Connect output from ${node.title}`}
                    title={`Connect ${meta.output} output`}
                    onPointerDown={e => {
                      e.stopPropagation();
                      setConnecting(node.id);
                      setCursor(outPoint(node));
                    }}
                    onClick={e => {
                      e.stopPropagation();
                      setConnecting(node.id);
                      setCursor(outPoint(node));
                    }}
                  >
                    <i />
                  </button>
                )}
                <div
                  className="wf-node-body"
                  style={{
                    paddingTop:
                      meta.inputs.length > 1
                        ? 63
                        : meta.inputs.length
                          ? 35
                          : 12,
                  }}
                >
                  {node.config.field ? (
                    <button
                      className="wf-field-node-preview"
                      onClick={() => {
                        setSelected(node.id);
                        setLibrary(false);
                      }}
                    >
                      <strong>
                        {node.config.field.defaultValue
                          ? fieldPrompt(
                              node.config.field,
                              node.config.field.defaultValue
                            )
                          : "Set up this field"}
                      </strong>
                      <span>
                        {fieldChoices(node.config.field).length
                          ? `${fieldChoices(node.config.field).length} choices · `
                          : ""}
                        {node.config.field.required ? "Required" : "Optional"}
                        {node.config.field.ai ? " · AI assistance" : ""}
                      </span>
                      <span>Configure field →</span>
                    </button>
                  ) : node.type === "text" ? (
                    <textarea
                      aria-label={`Text for ${node.title}`}
                      placeholder="Write a brief or prompt…"
                      value={node.config.text}
                      maxLength={10000}
                      onChange={e =>
                        update(node.id, {
                          config: { ...node.config, text: e.target.value },
                        })
                      }
                    />
                  ) : node.type === "image" ? (
                    <InputImage
                      node={node}
                      organizationId={organizationId}
                      assets={assets.data ?? []}
                      onChoose={() => setPickImage(node.id)}
                    />
                  ) : step?.outputs?.length ? (
                    <div className="wf-node-results">
                      {step.outputs
                        .slice(0, node.type === "output" ? 6 : 1)
                        .map((value, i) => (
                          <ResultPreview
                            key={i}
                            value={value}
                            onPreview={() => setPreview(value)}
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="wf-node-placeholder">
                      <Icon size={29} />
                      <span>
                        {node.type === "assistant"
                          ? "Your prompt will appear here"
                          : node.type === "combine"
                            ? "Combine connected text"
                            : node.type === "output"
                              ? "Connect a result to preview it"
                              : node.type === "generate_video"
                                ? "Your video starts here"
                                : node.type === "generate_image"
                                  ? "Your next image starts here"
                                  : meta.description}
                      </span>
                      {node.config.text && <p>{node.config.text}</p>}
                    </div>
                  )}
                  {step?.status === "waiting" && step.waitingReason && (
                    <p className="wf-setting-help">{step.waitingReason}</p>
                  )}
                  {step?.publicationId && (
                    <Link
                      className="wf-result-link"
                      href={`/app/publishing?publication=${step.publicationId}`}
                    >
                      Review publication →
                    </Link>
                  )}
                  {step?.error && (
                    <p className="wf-node-error" role="alert">
                      {step.error}
                    </p>
                  )}
                </div>
                <footer className="wf-node-footer">
                  {["generate_image", "generate_video"].includes(node.type) && (
                    <span className="wf-model-label">
                      {
                        generationModel(
                          node.config.modelId ||
                            (node.type === "generate_image"
                              ? DEFAULT_IMAGE_MODEL
                              : DEFAULT_VIDEO_MODEL)
                        )?.name
                      }
                    </span>
                  )}
                  <span>
                    {node.type === "text"
                      ? `${node.config.text.length} characters`
                      : node.type === "generate_image"
                        ? `${node.config.ratio} · Image`
                        : node.type === "generate_video"
                          ? `${node.config.duration}s · ${node.config.resolution} · ${node.config.ratio}`
                          : node.type === "output"
                            ? step?.outputs?.length
                              ? "Saved in run history"
                              : "Collect workflow results"
                            : meta.output}
                  </span>
                  {isGenerationNode(node.type) && (
                    <NodeCredits organizationId={organizationId} node={node} />
                  )}
                  {isGenerationNode(node.type) && (
                    <button
                      disabled={busy}
                      aria-label={`Run ${node.title}`}
                      onClick={e => {
                        e.stopPropagation();
                        onRunNode(node.id);
                      }}
                    >
                      <Play size={11} /> Run
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
        {!graph.nodes.length && (
          <div className="wf-blank">
            <GitBranch size={34} />
            <h2>A blank canvas. Endless possibilities.</h2>
            <p>
              Start with a prompt or an image, then connect a generation step.
            </p>
            <Button onClick={() => setLibrary(true)}>
              <Plus size={16} /> Add your first step
            </Button>
          </div>
        )}
        <div className="wf-canvas-toolbar" data-panel>
          <button
            title="Add step"
            aria-label="Add step"
            className={library ? "active" : ""}
            onClick={() => {
              setLibrary(!library);
              setSelected(null);
            }}
          >
            <Plus size={21} />
          </button>
          <span />
          <button
            aria-label="Undo"
            title="Undo"
            disabled={!past.length}
            onClick={undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            aria-label="Redo"
            title="Redo"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={18} />
          </button>
        </div>
        {library && (
          <aside className="wf-node-library" data-panel>
            <div className="wf-panel-title">
              <h2>Add a step</h2>
              <button
                aria-label="Close step library"
                onClick={() => setLibrary(false)}
              >
                <X size={17} />
              </button>
            </div>
            <label className="wf-search">
              <Search size={15} />
              <Input
                autoFocus
                value={nodeSearch}
                onChange={e => setNodeSearch(e.target.value)}
                placeholder="Search steps…"
                aria-label="Search steps"
              />
            </label>
            <div className="wf-palette-tabs" aria-label="Add steps or fields">
              <button
                aria-pressed={paletteMode === "steps"}
                onClick={() => setPaletteMode("steps")}
              >
                Steps
              </button>
              <button
                aria-pressed={paletteMode === "fields"}
                onClick={() => setPaletteMode("fields")}
              >
                Fields
              </button>
            </div>
            {paletteMode === "fields" ? (
              <div className="wf-node-group">
                <h3>APP INPUT FIELDS</h3>
                <p className="wf-setting-help">
                  Add a field, configure it here, then connect it to a step. It
                  also appears in your App form.
                </p>
                {inputKinds
                  .filter(k =>
                    `${inputLabels[k]} ${k}`
                      .toLowerCase()
                      .includes(nodeSearch.toLowerCase())
                  )
                  .map(kind => (
                    <button key={kind} onClick={() => add("app_input", kind)}>
                      <span data-type="app_input">
                        <ArrowDownToLine size={19} />
                      </span>
                      <div>
                        <strong>{inputLabels[kind]}</strong>
                        <p>
                          {[
                            "theme",
                            "art_style",
                            "choice",
                            "channel",
                            "size",
                          ].includes(kind)
                            ? "System choices, curated lists or your own options"
                            : "Defaults, user input and field settings"}
                        </p>
                      </div>
                      <ChevronRight size={14} />
                    </button>
                  ))}
              </div>
            ) : (
              <>
                <label className="wf-palette-filter">
                  Capabilities
                  <select
                    aria-label="Node section"
                    value={paletteFamily}
                    onChange={e =>
                      setPaletteFamily(e.target.value as typeof paletteFamily)
                    }
                  >
                    {Object.entries(workflowSections).map(([id, section]) => (
                      <option key={id} value={id}>
                        {section.name}
                      </option>
                    ))}
                    <option value="all">All sections</option>
                  </select>
                </label>
                {Array.from(
                  new Set(Object.values(workflowNodes).map(m => m.group))
                ).map(group => (
                  <div className="wf-node-group" key={group}>
                    <h3>{group}</h3>
                    {Object.entries(workflowNodes)
                      .filter(
                        ([, meta]) =>
                          meta.group === group &&
                          !meta.hidden &&
                          (!meta.channel ||
                            connectedChannels.includes(meta.channel)) &&
                          (paletteFamily === "all" ||
                            (!meta.family &&
                              [
                                "Inputs",
                                "Apps",
                                "Control",
                                "Utilities",
                              ].includes(meta.group)) ||
                            (meta.family ?? "create") === paletteFamily) &&
                          `${meta.name} ${meta.description}`
                            .toLowerCase()
                            .includes(nodeSearch.toLowerCase())
                      )
                      .map(([type, meta]) => {
                        const Icon = icons[type as WorkflowNodeType];
                        return (
                          <button
                            key={type}
                            onClick={() => add(type as WorkflowNodeType)}
                          >
                            <span data-type={type}>
                              <Icon size={19} />
                            </span>
                            <div>
                              <strong>{meta.name}</strong>
                              <p>{meta.description}</p>
                            </div>
                            <ChevronRight size={14} />
                          </button>
                        );
                      })}
                  </div>
                ))}
              </>
            )}
            <p className="wf-setting-help">
              Connected channels add their available steps.{" "}
              <Link href="/app/settings/integrations">Manage connections</Link>
            </p>
          </aside>
        )}
        {selectedNode && !library && (
          <aside className="wf-inspector" data-panel>
            <div className="wf-panel-title">
              <h2>
                {selectedNode.config.field
                  ? "Field settings"
                  : workflowNodes[selectedNode.type].name}
              </h2>
              <button
                aria-label="Close step settings"
                onClick={() => setSelected(null)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="wf-inspector-body">
              {!selectedNode.config.field && (
                <label>
                  Step name
                  <Input
                    value={selectedNode.title}
                    maxLength={100}
                    onChange={e =>
                      update(selectedNode.id, { title: e.target.value })
                    }
                  />
                </label>
              )}
              {(selectedNode.type === "app" ||
                selectedNode.config.builtinAppId) && (
                <WorkflowAppPicker
                  node={selectedNode}
                  organizationId={organizationId}
                  disabled={busy}
                  onSelect={selection => {
                    const result = selectWorkflowApp(
                      graphRef.current,
                      selectedNode.id,
                      selection
                    );
                    change(result.graph);
                    if (result.removed)
                      toast.info(
                        `${result.removed} incompatible connection(s) removed. You can undo this change.`
                      );
                  }}
                />
              )}
              {[
                "app",
                "app_input",
                "review",
                "wait",
                "facebook_post",
                "meta_ad",
                "deliver_publication",
                "meta_activate",
                "meta_report",
                "facebook_report",
                "compare_metrics",
                "optimize_metric",
                "optimize_copy",
              ].includes(selectedNode.type) && (
                <WorkflowBusinessSettings
                  key={selectedNode.id}
                  node={selectedNode}
                  organizationId={organizationId}
                  onChange={config}
                />
              )}
              {selectedNode.config.field && (
                <WorkflowFormEditor
                  key={`field-${selectedNode.id}`}
                  graph={graph}
                  fieldId={selectedNode.id}
                  organizationId={organizationId}
                  onChange={change}
                />
              )}
              {selectedNode.type === "image" ? (
                <Button
                  variant="outline"
                  onClick={() => setPickImage(selectedNode.id)}
                >
                  <ImageIcon size={16} /> Choose image
                </Button>
              ) : (
                [
                  "text",
                  "combine",
                  "assistant",
                  "generate_image",
                  "generate_video",
                  "app_input",
                  "optimize_copy",
                ].includes(selectedNode.type) &&
                !selectedNode.config.field && (
                  <label>
                    {selectedNode.type === "combine"
                      ? "Additional text (optional)"
                      : selectedNode.type === "assistant"
                        ? "Instructions"
                        : "Prompt"}
                    <textarea
                      value={selectedNode.config.text}
                      maxLength={10000}
                      rows={6}
                      onChange={e => config({ text: e.target.value })}
                      placeholder="Describe what this step should create…"
                    />
                    <small>
                      Connected text is included before these instructions.
                    </small>
                  </label>
                )
              )}
              {["generate_image", "generate_video"].includes(
                selectedNode.type
              ) && (
                <>
                  <ModelPicker
                    organizationId={organizationId}
                    kind={
                      selectedNode.type === "generate_image" ? "image" : "video"
                    }
                    value={selectedNode.config.modelId}
                    disabled={busy}
                    onChange={(modelId, modelOptions) =>
                      config({
                        modelId,
                        modelOptions,
                        duration: Number(modelOptions.duration ?? 5),
                        resolution: String(modelOptions.resolution ?? "720p"),
                        ratio: String(modelOptions.aspect_ratio ?? "1:1"),
                      })
                    }
                  />
                  <ModelSettings
                    organizationId={organizationId}
                    modelId={selectedNode.config.modelId}
                    options={selectedNode.config.modelOptions}
                    disabled={busy}
                    onChange={modelOptions =>
                      config({
                        modelOptions,
                        duration: Number(
                          modelOptions.duration ?? selectedNode.config.duration
                        ),
                        resolution: String(
                          modelOptions.resolution ??
                            selectedNode.config.resolution
                        ),
                        ratio: String(
                          modelOptions.aspect_ratio ?? selectedNode.config.ratio
                        ),
                      })
                    }
                  />
                  {(!selectedNode.config.modelId ||
                    selectedNode.config.modelId.startsWith("openai:")) && (
                    <div className="wf-settings-row">
                      <label>
                        Aspect ratio
                        <select
                          value={selectedNode.config.ratio}
                          onChange={e =>
                            config({
                              ratio: e.target
                                .value as WorkflowNode["config"]["ratio"],
                            })
                          }
                        >
                          {(selectedNode.type === "generate_video"
                            ? ["16:9", "9:16", "1:1"]
                            : ["1:1", "4:5", "9:16", "16:9"]
                          ).map(r => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      {selectedNode.type === "generate_video" && (
                        <label>
                          Resolution
                          <select
                            value={selectedNode.config.resolution}
                            onChange={e =>
                              config({
                                resolution: e.target
                                  .value as WorkflowNode["config"]["resolution"],
                              })
                            }
                          >
                            {["480p", "720p", "1080p"].map(r => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  )}
                  {!selectedNode.config.modelId &&
                    selectedNode.type === "generate_video" && (
                      <label>
                        Duration (seconds)
                        <Input
                          type="number"
                          min={4}
                          max={30}
                          value={selectedNode.config.duration}
                          onChange={e =>
                            config({
                              duration: Math.max(
                                4,
                                Math.min(30, Number(e.target.value) || 5)
                              ),
                            })
                          }
                        />
                      </label>
                    )}
                  {selectedNode.type === "generate_video" &&
                    (() => {
                      const model = generationModel(
                        selectedNode.config.modelId || DEFAULT_VIDEO_MODEL
                      );
                      return !!(
                        model?.inputSchema.properties.video_url ||
                        model?.inputSchema.properties.video_urls
                      );
                    })() && (
                      <div className="space-y-2 rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">
                          Connect a source video step, or choose a saved clip.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => setPickVideo(selectedNode.id)}
                        >
                          <Film size={14} />
                          {selectedNode.config.sourceVideoKey
                            ? "Change source video"
                            : "Choose source video"}
                        </Button>
                        {selectedNode.config.sourceVideoKey && (
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span>
                              {assets.data?.find(
                                a =>
                                  a.key === selectedNode.config.sourceVideoKey
                              )?.name || "Selected clip"}
                            </span>
                            <button
                              onClick={() => config({ sourceVideoKey: null })}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  <details className="wf-direction">
                    <summary>
                      Creative direction <Settings2 size={14} />
                    </summary>
                    <label className="wf-checkbox">
                      <input
                        type="checkbox"
                        checked={!!selectedNode.config.direction}
                        onChange={e =>
                          config({
                            direction: e.target.checked
                              ? { ...defaultVideoDirection }
                              : null,
                          })
                        }
                      />{" "}
                      Apply a theme and style
                    </label>
                    {selectedNode.config.direction && (
                      <>
                        <CreativeThemeLibrary
                          selectedTheme={selectedNode.config.direction.theme}
                          onSelect={theme =>
                            config({
                              direction: {
                                ...selectedNode.config.direction!,
                                theme: theme.id,
                                themePrompt: "",
                              },
                            })
                          }
                        />
                        <label>
                          Mood
                          <select
                            value={selectedNode.config.direction.mood}
                            onChange={e =>
                              config({
                                direction: {
                                  ...selectedNode.config.direction!,
                                  mood: e.target
                                    .value as typeof defaultVideoDirection.mood,
                                },
                              })
                            }
                          >
                            {CREATIVE_MOODS.map(o => (
                              <option value={o.id} key={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Style
                          <select
                            value={selectedNode.config.direction.artStyle}
                            onChange={e =>
                              config({
                                direction: {
                                  ...selectedNode.config.direction!,
                                  artStyle: e.target
                                    .value as typeof defaultVideoDirection.artStyle,
                                },
                              })
                            }
                          >
                            {CREATIVE_ART_STYLES.map(o => (
                              <option value={o.id} key={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </details>
                </>
              )}
              {["assistant", "generate_image", "optimize_copy"].includes(
                selectedNode.type
              ) && (
                <label className="wf-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedNode.config.useBrand}
                    onChange={e => config({ useBrand: e.target.checked })}
                  />{" "}
                  Use workspace brand context
                </label>
              )}
              {!!workflowNodes[selectedNode.type].inputs.length && (
                <section className="wf-inputs-list">
                  <h3>
                    <Link2 size={14} /> Connected inputs
                  </h3>
                  {graph.edges
                    .filter(e => e.target === selectedNode.id)
                    .map(edge => (
                      <div key={edge.id}>
                        <span>
                          {graph.nodes.find(n => n.id === edge.source)?.title}{" "}
                          <small>→ {edge.port}</small>
                        </span>
                        <button
                          aria-label={`Remove connection from ${graph.nodes.find(n => n.id === edge.source)?.title}`}
                          onClick={() =>
                            change({
                              ...graph,
                              edges: graph.edges.filter(e => e.id !== edge.id),
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  {!graph.edges.some(e => e.target === selectedNode.id) && (
                    <p>
                      Click an output dot, then a matching input dot to connect
                      steps.
                    </p>
                  )}
                </section>
              )}
              <div className="wf-inspector-actions">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={graph.nodes.length >= 40}
                  onClick={() => duplicate(selectedNode)}
                >
                  <Copy size={14} /> Duplicate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(selectedNode.id)}
                >
                  <Trash2 size={14} /> Delete
                </Button>
              </div>
            </div>
          </aside>
        )}
        {connecting && (
          <div className="wf-connect-hint" data-panel>
            Choose a matching input dot{" "}
            <button
              aria-label="Cancel connection"
              onClick={() => setConnecting(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="wf-zoom" data-panel>
          <button
            aria-label="Zoom out"
            onClick={() =>
              setView(v => ({ ...v, zoom: Math.max(0.25, v.zoom - 0.1) }))
            }
          >
            <Minus size={16} />
          </button>
          <span>{Math.round(view.zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() =>
              setView(v => ({ ...v, zoom: Math.min(1.7, v.zoom + 0.1) }))
            }
          >
            <Plus size={16} />
          </button>
          <span className="wf-zoom-divider" />
          <button
            aria-label="Fit workflow to screen"
            title="Fit to screen"
            onClick={fit}
          >
            <Maximize2 size={16} />
          </button>
        </div>
        <span className="wf-canvas-help">
          Drag to move · Scroll to pan · Ctrl / ⌘ + scroll to zoom
        </span>
      </div>
      {pickImage && (
        <VideoReferencePicker
          organizationId={organizationId}
          kind="images"
          assets={assets.data ?? []}
          selected={
            graph.nodes.find(n => n.id === pickImage)?.config.imageKey
              ? [graph.nodes.find(n => n.id === pickImage)!.config.imageKey!]
              : []
          }
          limit={1}
          onChange={keys => {
            const node = graph.nodes.find(n => n.id === pickImage);
            if (node)
              update(node.id, {
                config: { ...node.config, imageKey: keys[0] ?? null },
              });
          }}
          onClose={() => setPickImage(null)}
          onUpload={() => {
            setUploadFor(pickImage);
            setPickImage(null);
          }}
        />
      )}
      {pickVideo && (
        <VideoReferencePicker
          organizationId={organizationId}
          kind="video"
          assets={assets.data ?? []}
          selected={
            graph.nodes.find(n => n.id === pickVideo)?.config.sourceVideoKey
              ? [
                  graph.nodes.find(n => n.id === pickVideo)!.config
                    .sourceVideoKey!,
                ]
              : []
          }
          limit={1}
          onChange={keys => {
            const node = graph.nodes.find(n => n.id === pickVideo);
            if (node)
              update(node.id, {
                config: { ...node.config, sourceVideoKey: keys[0] ?? null },
              });
          }}
          onClose={() => setPickVideo(null)}
          onUpload={() => {
            setUploadFor(pickVideo);
            setPickVideo(null);
          }}
        />
      )}
      <AssetUploadDialog
        open={!!uploadFor}
        organizationId={organizationId}
        role={role}
        parent={null}
        defaultDisposition="draft"
        defaultPurpose="source"
        mediaFilter={
          graph.nodes.find(n => n.id === uploadFor)?.type === "generate_video"
            ? "video"
            : "image"
        }
        onClose={() => setUploadFor(null)}
        onSaved={() => assets.refetch()}
        onComplete={key => {
          const node = graphRef.current.nodes.find(n => n.id === uploadFor);
          if (node)
            update(node.id, {
              config: {
                ...node.config,
                ...(node.type === "generate_video"
                  ? { sourceVideoKey: key }
                  : { imageKey: key }),
              },
            });
          setUploadFor(null);
        }}
      />
      <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {preview?.type === "text"
                ? "Generated text"
                : (preview?.name ?? "Preview")}
            </DialogTitle>
            <DialogDescription>Workflow result</DialogDescription>
          </DialogHeader>
          {preview?.type === "image" ? (
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[70vh] w-full object-contain"
            />
          ) : preview?.type === "video" ? (
            <video src={preview.url} controls className="max-h-[70vh] w-full" />
          ) : (
            <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap text-sm">
              {preview ? workflowValueText(preview) : ""}
            </pre>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function NodeCredits({
  organizationId,
  node,
}: {
  organizationId: number;
  node: WorkflowNode;
}) {
  const [quoted, setQuoted] = useState(node);
  useEffect(() => {
    const timer = setTimeout(
      () => setQuoted({ ...node, x: 0, y: 0, title: "Step" }),
      500
    );
    return () => clearTimeout(timer);
  }, [node.config, node.type, node.id]);
  const quote = trpc.models.nodeQuote.useQuery(
    { organizationId, node: quoted },
    { staleTime: 15000, retry: false }
  );
  return (
    <span
      className="ml-auto whitespace-nowrap text-[10px] text-violet-600 dark:text-violet-300"
      title={
        quote.error?.message ||
        "Estimated credits. Final usage is settled after generation."
      }
    >
      {quote.data
        ? `≈ ${quote.data.credits} credits`
        : quote.error
          ? "Check inputs"
          : "Estimating…"}
    </span>
  );
}
function InputImage({
  node,
  organizationId,
  assets,
  onChoose,
}: {
  node: WorkflowNode;
  organizationId: number;
  assets: LibraryAsset[];
  onChoose: () => void;
}) {
  const key = node.config.imageKey;
  const catalog = trpc.video.catalogImages.useQuery(
    {
      organizationId,
      selectedOnly: true,
      selectedKeys: key?.startsWith("product_image:") ? [key] : [],
    },
    { enabled: !!key?.startsWith("product_image:") }
  );
  const item = key?.startsWith("product_image:")
    ? catalog.data?.items[0]
    : assets.find(a => a.key === key);
  return (
    <button
      className={`wf-input-image ${item ? "has-image" : ""}`}
      onClick={onChoose}
      aria-label={`Choose image for ${node.title}`}
    >
      {item ? (
        <>
          <img draggable={false} src={item.url} alt={item.name} />
          <span>{item.name}</span>
        </>
      ) : (
        <>
          <ImageIcon size={30} />
          <strong>{key ? "Choose or replace image" : "Choose an image"}</strong>
          <span>Product photo, asset, or upload</span>
        </>
      )}
    </button>
  );
}
function ResultPreview({
  value,
  onPreview,
}: {
  value: WorkflowValue;
  onPreview: () => void;
}) {
  if (value.type === "publication")
    return (
      <Link
        className="wf-result-link"
        href={`/app/publishing?publication=${value.id}`}
      >
        {value.name}
        <br />
        Open publication →
      </Link>
    );
  if (value.type === "data" || value.type === "decision")
    return (
      <button className="wf-data-result" onClick={onPreview}>
        <strong>{value.name}</strong>
        <p>
          {value.type === "decision"
            ? String(value.data.recommendation ?? "View decision")
            : "View measurements and reporting context"}
        </p>
        <span>Inspect result →</span>
      </button>
    );
  if (value.type === "text")
    return (
      <div className="wf-text-result">
        <p>{value.text}</p>
        <div>
          <button
            onClick={() => {
              void navigator.clipboard
                .writeText(value.text)
                .then(() => toast.success("Text copied"))
                .catch(() =>
                  toast.error("Select and copy the text from the preview.")
                );
            }}
          >
            <Copy size={12} /> Copy
          </button>
          <button aria-label="Expand text result" onClick={onPreview}>
            <Expand size={12} />
          </button>
        </div>
      </div>
    );
  if (value.type !== "image" && value.type !== "video") return null;
  return (
    <button
      className="wf-media-result"
      onClick={onPreview}
      aria-label={`Preview ${value.name}`}
    >
      {value.type === "image" ? (
        <img draggable={false} src={value.url} alt={value.name} />
      ) : (
        <>
          <video src={value.url} preload="metadata" muted />
          <Play className="wf-video-play" size={26} />
        </>
      )}
      <span>
        <Expand size={13} />
      </span>
    </button>
  );
}
