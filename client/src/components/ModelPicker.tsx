import { useState } from "react";
import { Search, ChevronDown, Check, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  generationModel,
  generationModels,
  modelDefaults,
  referenceCapacity,
  requiresVideo,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  type ModelOptions,
} from "@shared/modelCatalog";
export function ModelPicker({
  organizationId,
  kind,
  value,
  onChange,
  disabled = false,
}: {
  organizationId: number;
  kind: "image" | "video";
  value?: string;
  onChange: (id: string, options: ModelOptions) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [maker, setMaker] = useState("all");
  const catalog = trpc.models.catalog.useQuery(
    { organizationId },
    { enabled: !!organizationId, staleTime: 60000 }
  );
  const selected =
      value || (kind === "image" ? DEFAULT_IMAGE_MODEL : DEFAULT_VIDEO_MODEL),
    model = generationModel(selected),
    choice = catalog.data?.find(m => m.id === selected);
  const models = (catalog.data ?? []).filter(m => m.kind === kind),
    makers = Array.from(new Set(models.map(m => m.maker))).sort();
  const visible = models.filter(
    m =>
      (maker === "all" || m.maker === maker) &&
      `${m.name} ${m.variant} ${m.maker}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  return (
    <div className="min-w-0 space-y-2">
      <span className="text-sm font-medium">Generation model</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex w-full min-w-0 items-center gap-3 rounded-xl border bg-background px-3 py-3 text-left text-sm hover:border-primary disabled:opacity-50"
      >
        <Sparkles size={16} className="shrink-0 text-violet-500" />
        <span className="min-w-0 flex-1">
          <strong className="block truncate font-medium">
            {model?.name ?? "Choose a model"}
          </strong>
          <span className="block truncate text-xs text-muted-foreground">
            {model?.variant}
            {choice?.provider
              ? ` · ${choice.provider === "openai" ? "OpenAI" : "Higgsfield"}`
              : ""}
          </span>
        </span>
        {choice?.direct && (
          <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-medium text-violet-600 dark:text-violet-300">
            Direct pricing
          </span>
        )}
        <ChevronDown size={16} />
      </button>
      {choice?.reason && (
        <p className="text-xs text-amber-600">{choice.reason}</p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-4xl">
          <div className="shrink-0 pr-6">
            <DialogTitle>
              Choose an {kind === "image" ? "image" : "AI video"} model
            </DialogTitle>
            <DialogDescription>
              Compare models, providers, and supported inputs. Credits are
              estimated before you run.
            </DialogDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search
                size={16}
                className="absolute left-3 top-3 text-muted-foreground"
              />
              <Input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search models…"
                className="pl-9"
              />
            </div>
            <select
              aria-label="Model maker"
              value={maker}
              onChange={e => setMaker(e.target.value)}
              className="rounded-lg border bg-background px-3 text-sm"
            >
              <option value="all">All model makers</option>
              {makers.map(m => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="grid min-h-0 auto-rows-max gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {visible.map(m => (
              <button
                type="button"
                key={m.id}
                disabled={!m.available}
                onClick={() => {
                  const definition = generationModel(m.routeId)!;
                  onChange(m.id, modelDefaults(definition));
                  setOpen(false);
                }}
                className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition-colors ${m.id === selected ? "border-violet-500 bg-violet-500/5" : "hover:border-violet-400 hover:bg-muted/50"} disabled:opacity-50`}
              >
                <span className="mt-1 shrink-0 rounded-lg bg-violet-500/10 p-2 text-violet-500">
                  <Sparkles size={17} />
                </span>
                <span className="min-w-0 flex-1 break-words">
                  <strong className="block text-sm">{m.name}</strong>
                  <span className="block text-xs text-muted-foreground">
                    {m.variant}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {m.direct ? "Direct pricing" : "Via Higgsfield"}
                    </span>
                    {m.estimatedCredits != null && (
                      <span>
                        ≈ {m.estimatedCredits} credits /{" "}
                        {m.kind === "image"
                          ? "image"
                          : `${m.estimatedSeconds}s`}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {referenceCapacity(generationModel(m.id)!)
                      ? `Up to ${referenceCapacity(generationModel(m.id)!)} image references`
                      : "Prompt input"}
                    {requiresVideo(generationModel(m.id)!)
                      ? " · Source video required"
                      : ""}
                  </span>
                  {m.reason && (
                    <span className="mt-1 block text-xs text-amber-600">
                      {m.reason}
                    </span>
                  )}
                </span>
                {m.id === selected && (
                  <Check size={16} className="shrink-0 text-violet-500" />
                )}
              </button>
            ))}
            {catalog.isLoading && (
              <p className="p-4 text-sm">Loading model catalog…</p>
            )}
            {catalog.error && (
              <p className="p-4 text-sm text-destructive">
                Could not load models. Try again.
              </p>
            )}
            {!catalog.isLoading && !visible.length && (
              <p className="p-4 text-sm text-muted-foreground">
                No models match these filters.
              </p>
            )}
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">
            Direct pricing means we connect to the model maker directly.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
const hidden = new Set([
  "multi_shots",
  "prompt",
  "image_url",
  "image_urls",
  "video_url",
  "video_urls",
  "audio_url",
  "audio_urls",
  "file_url",
  "link_url",
  "first_frame_url",
  "last_frame_url",
  "last_image_url",
  "end_image_url",
  "num_images",
  "batch_size",
  "n",
  "output_format",
  "moderation",
  "custom_reference_id",
  "custom_reference_strength",
  "preset_id",
  "style_id",
  "enhance_prompt",
]);
export function ModelSettings({
  organizationId,
  modelId,
  options = {},
  onChange,
  disabled = false,
}: {
  organizationId?: number | null;
  modelId?: string;
  options?: ModelOptions;
  onChange: (value: ModelOptions) => void;
  disabled?: boolean;
}) {
  const catalog = trpc.models.catalog.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId, staleTime: 60000 }
  );
  const model = generationModel(
    catalog.data?.find(m => m.id === modelId)?.routeId ?? modelId ?? ""
  );
  if (!model) return null;
  const values = { ...modelDefaults(model), ...options };
  const needsReview = Object.keys(options).some(
    k => !model.inputSchema.properties[k]
  );
  const fields = Object.entries(model.inputSchema.properties).filter(
    ([key, p]) =>
      !hidden.has(key) &&
      (p.enum ||
        ["string", "integer", "number", "boolean"].includes(String(p.type))) &&
      !Array.isArray(p.type)
  );
  const primary = new Set([
    "duration",
    "resolution",
    "quality",
    "aspect_ratio",
    "generate_audio",
    "sound",
  ]);
  const render = (key: string, p: (typeof fields)[number][1]) => (
    <label key={key} className="block min-w-0 space-y-1 text-xs">
      <span className="text-muted-foreground">
        {p.title ||
          key.replaceAll("_", " ").replace(/^./, s => s.toUpperCase())}
      </span>
      {p.enum ? (
        <select
          disabled={disabled}
          className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
          value={String(values[key] ?? "")}
          onChange={e =>
            onChange({
              ...options,
              [key]:
                p.type === "integer" ||
                p.type === "number" ||
                typeof p.enum?.[0] === "number"
                  ? Number(e.target.value)
                  : e.target.value,
            })
          }
        >
          {values[key] === undefined && <option value="">Automatic</option>}
          {p.enum.map(v => (
            <option key={String(v)} value={String(v)}>
              {v}
              {key === "duration" ? " seconds" : ""}
            </option>
          ))}
        </select>
      ) : p.type === "boolean" ? (
        <select
          disabled={disabled}
          className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
          value={values[key] === true ? "yes" : "no"}
          onChange={e =>
            onChange({ ...options, [key]: e.target.value === "yes" })
          }
        >
          <option value="yes">On</option>
          <option value="no">Off</option>
        </select>
      ) : (
        <Input
          disabled={disabled}
          type={p.type === "string" ? "text" : "number"}
          min={p.minimum}
          max={p.maximum}
          step={p.type === "integer" ? 1 : "any"}
          maxLength={p.maxLength}
          value={String(values[key] ?? "")}
          onChange={e => {
            const next = { ...options };
            if (!e.target.value) delete next[key];
            else
              next[key] =
                p.type === "string" ? e.target.value : Number(e.target.value);
            onChange(next);
          }}
        />
      )}
    </label>
  );
  return (
    <div className="space-y-3">
      {needsReview && (
        <div className="rounded-lg bg-amber-500/10 p-3 text-xs">
          The provider route changed. Review this model's current settings
          before running.
          <button
            type="button"
            className="mt-2 block underline"
            onClick={() => onChange(modelDefaults(model))}
          >
            Use current model settings
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {fields
          .filter(([key]) => primary.has(key))
          .map(([k, p]) => render(k, p))}
      </div>
      {fields.some(([k]) => !primary.has(k)) && (
        <details className="rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            More model settings
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {fields
              .filter(([key]) => !primary.has(key))
              .map(([k, p]) => render(k, p))}
          </div>
        </details>
      )}
    </div>
  );
}
