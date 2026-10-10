import { ActionCredits } from "./ActionCredits";
import { ModelPicker, ModelSettings } from "./ModelPicker";
import {
  generationModel,
  modelVideoMode,
  requiresVideo,
  DEFAULT_VIDEO_MODEL,
  type ModelOptions,
} from "@shared/modelCatalog";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Check,
  Clapperboard,
  Film,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { AssetUploadDialog } from "./AssetUploadDialog";
import { LifestylePersonPicker } from "./LifestylePersonPicker";
import { VideoReferencePicker } from "./VideoReferencePicker";
import { VideoCreativeDirection } from "./VideoCreativeDirection";
import { studioDraftsHref } from "@shared/contentWorkflow";
import {
  activeVideoStatuses,
  defaultVideoSetup,
  defaultVideoDirection,
  type VideoImageChoice,
  videoModes,
  videoModelOptions,
  videoRatios,
  videoResolutions,
  videoSetupProblem,
  videoStatusLabels,
  type VideoSetup,
} from "@shared/videoCreation";

const field =
  "mt-2 h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
type SavedVideo = { id: string; revision: number; status: string };

export function VideoStudio({ initialPlanId }: { initialPlanId?: number }) {
  const { organizationId, membership } = useWorkspace();
  const scope = { organizationId: organizationId! };
  const params = new URLSearchParams(useSearch());
  const selectedId = params.get("video");
  const requestedUgc = params.get("type") === "ugc";
  const [, navigate] = useLocation();
  const href = (id?: string, ugc = false) =>
    `/app/creatives/video${id || ugc || initialPlanId ? "?" + new URLSearchParams({ ...(id ? { video: id } : {}), ...(ugc ? { type: "ugc" } : {}), ...(initialPlanId ? { plan: String(initialPlanId) } : {}) }) : ""}`;
  const [setup, setSetup] = useState<VideoSetup>({
    ...defaultVideoSetup,
    modelId: DEFAULT_VIDEO_MODEL,
    category: requestedUgc ? "ugc" : "product",
    direction: {
      ...defaultVideoDirection,
      setting: requestedUgc ? "people" : "product",
    },
    title: requestedUgc ? "Untitled creator video" : defaultVideoSetup.title,
    campaignPlanId: initialPlanId,
  });
  const isUgc = setup.category === "ugc";
  function modelOptionsChanged(modelId: string, modelOptions: ModelOptions) {
    const model = generationModel(modelId)!;
    update({
      modelId,
      modelOptions,
      mode: modelVideoMode(model),
      sourceVideoKey:
        model.inputSchema.properties.video_url ||
        model.inputSchema.properties.video_urls
          ? setup.sourceVideoKey
          : null,
      duration: Number(modelOptions.duration ?? 5),
      resolution: String(modelOptions.resolution ?? "720p"),
      aspectRatio: String(modelOptions.aspect_ratio ?? "16:9"),
      sound:
        typeof modelOptions.generate_audio === "boolean"
          ? modelOptions.generate_audio
          : typeof modelOptions.sound === "boolean"
            ? modelOptions.sound
            : true,
    });
  }
  const [saved, setSaved] = useState<SavedVideo | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<"images" | "video" | null>(null);
  const [upload, setUpload] = useState(false);
  const [uploadKind, setUploadKind] = useState<"images" | "video">("images");
  const [undoPrompt, setUndoPrompt] = useState<string | null>(null);
  const [promptPending, setPromptPending] = useState(false);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const editorContext = useRef({ organizationId, selectedId, locked: false });
  const loadedId = useRef<string | null>(null);
  const utils = trpc.useUtils();
  const options = trpc.video.options.useQuery(scope, {
    enabled: !!organizationId,
    refetchInterval: 30000,
  });
  const history = trpc.video.list.useQuery(scope, {
    enabled: !!organizationId,
    refetchInterval: query =>
      query.state.data?.some(job => activeVideoStatuses.includes(job.status))
        ? 5000
        : 15000,
  });
  const detail = trpc.video.get.useQuery(
    { ...scope, id: selectedId ?? "00000000-0000-4000-8000-000000000000" },
    {
      enabled: !!organizationId && !!selectedId,
      retry: false,
      refetchInterval: query =>
        query.state.data &&
        activeVideoStatuses.includes(query.state.data.status)
          ? 5000
          : false,
    }
  );
  const assets = trpc.assetLibrary.studioList.useQuery(scope, {
    enabled: !!organizationId,
  });
  const current =
    detail.data?.id === selectedId
      ? detail.data
      : history.data?.find(job => job.id === selectedId);
  const locked = !!selectedId && (current?.status ?? saved?.status) !== "draft";
  editorContext.current = { organizationId, selectedId, locked };
  const catalogSelection = trpc.video.catalogImages.useQuery(
    {
      ...scope,
      selectedOnly: true,
      selectedKeys: setup.imageKeys.filter(key =>
        key.startsWith("product_image:")
      ),
    },
    {
      enabled:
        !!organizationId &&
        setup.imageKeys.some(key => key.startsWith("product_image:")),
    }
  );
  const referenceMap = new Map<string, VideoImageChoice>([
    ...(assets.data ?? []).map(
      asset => [asset.key, asset] as [string, VideoImageChoice]
    ),
    ...(catalogSelection.data?.items ?? []).map(
      asset => [asset.key, asset] as [string, VideoImageChoice]
    ),
  ]);
  const active = !!current && activeVideoStatuses.includes(current.status);
  const assetMap = new Map(
    (assets.data ?? []).map(asset => [asset.key as string, asset])
  );
  const resultAsset = current?.assetKey
    ? assetMap.get(current.assetKey)
    : undefined;
  const [quoteSetup, setQuoteSetup] = useState(setup);
  useEffect(() => {
    const timer = setTimeout(() => setQuoteSetup(setup), 500);
    return () => clearTimeout(timer);
  }, [setup]);
  const quote = trpc.video.quote.useQuery(
    { ...scope, setup: quoteSetup },
    {
      enabled: !!organizationId && !locked && !videoSetupProblem(quoteSetup),
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const quoteCurrent = JSON.stringify(quoteSetup) === JSON.stringify(setup);
  const problem = videoSetupProblem(setup);
  const promptDraft = trpc.video.draftPrompt.useMutation();
  const save = trpc.video.save.useMutation();
  const generate = trpc.video.generate.useMutation();
  const cancel = trpc.video.cancel.useMutation();
  const check = trpc.video.checkAgain.useMutation();
  useEffect(() => {
    if (current && loadedId.current !== current.id) {
      loadedId.current = current.id;
      setSetup({ ...defaultVideoSetup, ...current.setup });
      setSaved(current);
      setDirty(false);
      setError("");
      setUndoPrompt(null);
    }
  }, [current]);
  useEffect(() => {
    if (!selectedId && (loadedId.current || requestedUgc !== isUgc)) {
      loadedId.current = null;
      setSetup({
        ...defaultVideoSetup,
        category: requestedUgc ? "ugc" : "product",
        title: requestedUgc
          ? "Untitled creator video"
          : defaultVideoSetup.title,
        campaignPlanId: initialPlanId,
      });
      setSaved(null);
      setDirty(false);
      setError("");
    }
  }, [selectedId, requestedUgc, initialPlanId]);
  const recentVideos = (history.data ?? []).filter(
    job =>
      (job.setup.category === "ugc") === isUgc &&
      (!initialPlanId || job.setup.campaignPlanId === initialPlanId)
  );
  const completed = (history.data ?? [])
    .filter(job => job.status === "completed")
    .map(job => job.id)
    .join(":");
  useEffect(() => {
    if (completed) void utils.assetLibrary.studioList.invalidate(scope);
  }, [completed, organizationId]);
  const update = (changes: Partial<VideoSetup>) => {
    const next = { ...setupRef.current, ...changes };
    setupRef.current = next;
    setSetup(next);
    setDirty(true);
    setError("");
  };
  async function draftFromImages() {
    if (promptPending || locked || busy || !setup.imageKeys.length) return;
    const requestSetup = setupRef.current;
    const context = editorContext.current;
    setPromptPending(true);
    setError("");
    try {
      const result = await promptDraft.mutateAsync({
        ...scope,
        setup: requestSetup,
      });
      if (
        setupRef.current !== requestSetup ||
        editorContext.current.organizationId !== context.organizationId ||
        editorContext.current.selectedId !== context.selectedId ||
        editorContext.current.locked
      ) {
        toast.info(
          "Your setup changed while the prompt was being generated. Your newer edits have been kept."
        );
        return;
      }
      setUndoPrompt(requestSetup.prompt);
      update({ prompt: result.prompt });
      toast.success(
        "Video prompt generated. Review it before generating your video."
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The prompt could not be generated. Try again."
      );
    } finally {
      setPromptPending(false);
    }
  }
  const refresh = () =>
    Promise.all([
      utils.video.list.invalidate(scope),
      utils.video.get.invalidate(),
      utils.assetLibrary.studioList.invalidate(scope),
    ]);
  const startNew = (next?: VideoSetup, ugc = isUgc) => {
    setSetup(
      next ?? {
        ...defaultVideoSetup,
        category: ugc ? "ugc" : "product",
        direction: {
          ...defaultVideoDirection,
          setting: ugc ? "people" : "product",
        },
        title: ugc ? "Untitled creator video" : defaultVideoSetup.title,
        campaignPlanId: initialPlanId,
      }
    );
    setSaved(null);
    setUndoPrompt(null);
    loadedId.current = null;
    setDirty(!!next);
    setError("");
    navigate(href(undefined, next ? next.category === "ugc" : ugc));
  };
  async function switchType(ugc: boolean) {
    if (ugc === isUgc || busy) return;
    if (dirty && !(await persist(false))) return;
    startNew(undefined, ugc);
  }
  async function openVideo(id: string, ugc: boolean) {
    if (busy || id === selectedId) return;
    if (dirty && !(await persist(false))) return;
    navigate(href(id, ugc));
  }
  async function persist(shouldGenerate: boolean) {
    if (busy) return false;
    if (!setup.title.trim()) {
      setError("Give your video a name before saving.");
      return false;
    }
    setBusy(true);
    setError("");
    try {
      const draft = await save.mutateAsync({
        ...scope,
        ...(saved?.status === "draft"
          ? { id: saved.id, revision: saved.revision }
          : {}),
        setup,
      });
      setSaved(draft);
      loadedId.current = draft.id;
      setDirty(false);
      navigate(href(draft.id, isUgc));
      if (shouldGenerate && quote.data) {
        const queued = await generate.mutateAsync({
          ...scope,
          id: draft.id,
          revision: draft.revision,
          quotedCredits: quote.data.credits,
        });
        setSaved(queued);
        toast.success(
          "Video queued. You can leave this page while it generates."
        );
      } else toast.success("Video draft saved.");
      await refresh();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The video could not be saved. Please try again."
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function act(action: "cancel" | "check") {
    if (!selectedId) return;
    setError("");
    try {
      await (action === "cancel" ? cancel : check).mutateAsync({
        ...scope,
        id: selectedId,
      });
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The request could not be updated."
      );
    }
  }
  const references = setup.imageKeys.map(key => ({
    key,
    asset: referenceMap.get(key),
  }));
  const source = setup.sourceVideoKey
    ? assetMap.get(setup.sourceVideoKey)
    : undefined;
  const maxImages = setup.mode === "motion" ? 8 : 9;
  return (
    <section aria-labelledby="video-studio-title" className="min-w-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="video-studio-title" className="text-2xl font-semibold">
            Video creation
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Turn your products and ideas into motion.
          </p>
        </div>
        {selectedId && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              if (dirty && !(await persist(false))) return;
              startNew();
            }}
          >
            <Plus size={16} className="mr-2" />
            New video
          </Button>
        )}
      </div>
      <nav aria-label="Video type" className="mb-7 grid gap-3 sm:grid-cols-2">
        {[
          {
            ugc: false,
            title: "Product videos",
            subtitle: "Showcase products, services, and brands",
            icon: Clapperboard,
          },
          {
            ugc: true,
            title: "Creator videos",
            subtitle:
              "Choose an AI presenter or model to bring your story to life",
            icon: Users,
          },
        ].map(({ ugc, title, subtitle, icon: Icon }) => (
          <button
            key={title}
            type="button"
            aria-label={title}
            aria-pressed={isUgc === ugc}
            disabled={busy}
            onClick={() => void switchType(ugc)}
            className={`flex min-w-0 items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${isUgc === ugc ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-card hover:border-primary/40"}`}
          >
            <span
              className={`rounded-xl p-3 ${isUgc === ugc ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              <Icon size={22} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {subtitle}
              </span>
            </span>
          </button>
        ))}
      </nav>
      <>
        {(options.error || (!options.isLoading && !options.data?.ready)) && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
          >
            {options.error
              ? "Video service readiness could not be checked. Please refresh before generating."
              : options.data?.reason}
          </div>
        )}
        {detail.error && (
          <p role="alert" className="mb-5 rounded-xl border p-4 text-sm">
            {detail.error.message}
          </p>
        )}
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="surface min-w-0 overflow-hidden">
            <div className="border-b bg-muted/20 p-5">
              <h3 className="font-semibold">
                {locked ? "Generation settings" : "Build your video"}
              </h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {locked
                  ? "This version is saved. Start a new version to change its settings."
                  : "Add references, describe the scene, and choose your format."}
              </p>
            </div>
            <fieldset
              disabled={busy || locked || (!!selectedId && !current && !saved)}
              className="min-w-0 space-y-6 p-5 sm:p-6 disabled:opacity-80"
            >
              <div>
                <label htmlFor="video-title" className="text-sm font-medium">
                  Video name
                </label>
                <Input
                  id="video-title"
                  maxLength={160}
                  value={setup.title}
                  onChange={e => update({ title: e.target.value })}
                  className="mt-2"
                />
              </div>
              <ModelPicker
                organizationId={organizationId!}
                kind="video"
                value={setup.modelId}
                disabled={locked || busy}
                onChange={modelOptionsChanged}
              />
              {setup.modelId && (
                <ModelSettings
                  organizationId={organizationId}
                  modelId={setup.modelId}
                  options={videoModelOptions(setup)}
                  disabled={locked || busy}
                  onChange={o => modelOptionsChanged(setup.modelId!, o)}
                />
              )}
              {!setup.modelId && (
                <div>
                  <p className="mb-2 text-sm font-medium">
                    What would you like to do?
                  </p>
                  <div
                    aria-label="Video operation"
                    className="grid grid-cols-2 gap-2"
                  >
                    {videoModes.map(mode => (
                      <button
                        key={mode.id}
                        type="button"
                        aria-pressed={setup.mode === mode.id}
                        onClick={() =>
                          update({
                            mode: mode.id,
                            imageKeys: setup.imageKeys.slice(
                              0,
                              mode.id === "motion" ? 8 : 9
                            ),
                          })
                        }
                        className={`rounded-xl border px-3 py-2.5 text-sm ${setup.mode === mode.id ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {
                      videoModes.find(mode => mode.id === setup.mode)
                        ?.description
                    }
                  </p>
                </div>
              )}
              {(setup.mode !== "create" ||
                (setup.modelId &&
                  (generationModel(setup.modelId)?.inputSchema.properties
                    .video_url ||
                    generationModel(setup.modelId)?.inputSchema.properties
                      .video_urls))) && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {setup.mode === "motion"
                        ? "Motion reference video"
                        : "Source video"}{" "}
                      <span className="text-destructive">*</span>
                    </p>
                    {source && (
                      <button
                        type="button"
                        onClick={() => update({ sourceVideoKey: null })}
                        className="text-xs text-muted-foreground underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPicker("video")}
                    className="mt-2 flex w-full items-center gap-3 rounded-xl border border-dashed bg-muted/20 p-4 text-left hover:border-primary"
                  >
                    <Film size={22} className="shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        {source?.name ?? "Choose an MP4 video"}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {source?.durationSeconds
                          ? `${source.durationSeconds.toFixed(1)} seconds`
                          : "4–30 seconds"}
                      </span>
                    </span>
                  </button>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    Reference images{" "}
                    {setup.mode === "motion" && (
                      <span className="text-destructive">*</span>
                    )}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {references.length} / {maxImages}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {references.map(({ key, asset }, i) => (
                    <div
                      key={key}
                      className="relative min-w-0 rounded-xl border bg-muted/20 p-1.5"
                    >
                      {asset ? (
                        <img
                          src={asset.url}
                          alt={`Reference ${i + 1}: ${asset.name}`}
                          className="aspect-square w-full rounded-lg object-contain"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center text-xs">
                          Unavailable
                        </div>
                      )}
                      <span className="mt-1 block text-center text-[10px] text-muted-foreground">
                        Image {i + 1}
                      </span>
                      {!locked && (
                        <button
                          aria-label={`Remove image ${i + 1}`}
                          type="button"
                          onClick={() =>
                            update({
                              imageKeys: setup.imageKeys.filter(
                                value => value !== key
                              ),
                            })
                          }
                          className="absolute right-1 top-1 rounded-full border bg-background p-1 shadow-sm"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  {references.length < maxImages && (
                    <button
                      type="button"
                      onClick={() => setPicker("images")}
                      className="flex aspect-square min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-primary hover:bg-primary/5"
                    >
                      <ImagePlus size={21} />
                      <span className="text-xs">Add images</span>
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Choose catalog product photos, image assets, or uploads.
                  Mention “Image 1” or “Image 2” in your description.
                </p>
              </div>
              <VideoCreativeDirection
                value={setup.direction}
                onChange={direction => update({ direction })}
                disabled={
                  busy || locked || (!!selectedId && !current && !saved)
                }
              />
              {isUgc && (
                <LifestylePersonPicker
                  setup={{ shot: "multiple", people: setup.people }}
                  onChange={selection =>
                    update({ people: selection.people ?? [] })
                  }
                  disabled={busy || locked}
                  description="Choose one to four people, then describe their actions and dialogue in your video description below."
                  emptyDescription="Choose models now or add them to this draft later."
                  clearLabel="Clear selection"
                  referenceDescription="Fictional AI models, including kids, teens, and adults. Your selected portraits are saved as references with this draft."
                />
              )}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      promptPending || !setup.imageKeys.length || busy || locked
                    }
                    onClick={() => void draftFromImages()}
                  >
                    {promptPending ? (
                      <Loader2 size={15} className="mr-2 animate-spin" />
                    ) : (
                      <Sparkles size={15} className="mr-2" />
                    )}
                    {promptPending
                      ? "Reading images…"
                      : setup.prompt
                        ? "Regenerate from images"
                        : "Generate prompt from images"}{" "}
                    <ActionCredits
                      organizationId={organizationId}
                      operation="video.draftPrompt"
                    />
                  </Button>
                  {undoPrompt !== null && (
                    <button
                      type="button"
                      className="text-xs text-primary underline"
                      onClick={() => {
                        update({ prompt: undoPrompt });
                        setUndoPrompt(null);
                      }}
                    >
                      Undo prompt
                    </button>
                  )}
                </div>
                {!setup.imageKeys.length && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    Add an image to have AI draft the scene and camera movement.
                  </p>
                )}
                <label htmlFor="video-prompt" className="text-sm font-medium">
                  Describe your video{" "}
                  {setup.mode !== "motion" && (
                    <span className="text-destructive">*</span>
                  )}
                </label>
                <textarea
                  id="video-prompt"
                  rows={5}
                  maxLength={10000}
                  value={setup.prompt}
                  onChange={e => update({ prompt: e.target.value })}
                  placeholder={
                    setup.mode === "motion"
                      ? "Optional: describe the subject, setting, or style to preserve…"
                      : isUgc
                        ? "Describe the setting, what each person does, and what they say. For example: a creator demonstrates the product in a bright kitchen…"
                        : "A slow cinematic orbit around the product. Soft studio lighting highlights the details, followed by a close-up of…"
                  }
                  className={field + " !h-auto resize-y py-3 leading-6"}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {references.map((ref, i) => (
                      <button
                        key={ref.key}
                        type="button"
                        onClick={() =>
                          update({
                            prompt: `${setup.prompt}${setup.prompt && !setup.prompt.endsWith(" ") ? " " : ""}Image ${i + 1} `,
                          })
                        }
                        className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                      >
                        + Image {i + 1}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {setup.prompt.length.toLocaleString()} / 10,000
                  </span>
                </div>
              </div>
              {!setup.modelId && (
                <div className="grid grid-cols-2 gap-4">
                  {["create", "extend"].includes(setup.mode) && (
                    <label className="text-sm font-medium">
                      {setup.mode === "extend"
                        ? "Extension length"
                        : "Duration"}
                      <select
                        className={field}
                        value={setup.duration}
                        onChange={e =>
                          update({ duration: Number(e.target.value) })
                        }
                      >
                        {Array.from({ length: 27 }, (_, i) => i + 4).map(
                          seconds => (
                            <option key={seconds} value={seconds}>
                              {seconds} seconds
                            </option>
                          )
                        )}
                      </select>
                    </label>
                  )}
                  {setup.mode === "create" && (
                    <label className="text-sm font-medium">
                      Aspect ratio
                      <select
                        className={field}
                        value={setup.aspectRatio}
                        onChange={e =>
                          update({
                            aspectRatio: e.target
                              .value as VideoSetup["aspectRatio"],
                          })
                        }
                      >
                        {videoRatios.map(ratio => (
                          <option key={ratio} value={ratio}>
                            {ratio}
                            {ratio === "9:16"
                              ? " · Vertical"
                              : ratio === "16:9"
                                ? " · Landscape"
                                : ratio === "1:1"
                                  ? " · Square"
                                  : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="text-sm font-medium">
                    Resolution
                    <select
                      className={field}
                      value={setup.resolution}
                      onChange={e =>
                        update({
                          resolution: e.target
                            .value as VideoSetup["resolution"],
                        })
                      }
                    >
                      {videoResolutions.map(resolution => (
                        <option key={resolution}>{resolution}</option>
                      ))}
                    </select>
                  </label>
                  {setup.mode !== "motion" && (
                    <label className="text-sm font-medium">
                      Bitrate
                      <select
                        className={field}
                        value={setup.bitrate}
                        onChange={e =>
                          update({
                            bitrate: e.target.value as VideoSetup["bitrate"],
                          })
                        }
                      >
                        <option value="default">Automatic</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                  )}
                </div>
              )}
              {(setup.mode !== "create" ||
                (setup.modelId &&
                  (generationModel(setup.modelId)?.inputSchema.properties
                    .video_url ||
                    generationModel(setup.modelId)?.inputSchema.properties
                      .video_urls))) && (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  Framing follows your source video.
                  {["edit", "motion"].includes(setup.mode)
                    ? " Duration also follows the source clip."
                    : ""}
                </p>
              )}
              {!setup.modelId && setup.mode !== "motion" && (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3">
                  <span className="flex items-center gap-2 text-sm">
                    {setup.sound ? (
                      <Volume2 size={17} />
                    ) : (
                      <VolumeX size={17} />
                    )}
                    Generate sound
                  </span>
                  <input
                    type="checkbox"
                    checked={setup.sound}
                    onChange={e => update({ sound: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              )}
            </fieldset>
            <div className="space-y-3 border-t bg-muted/10 p-5 sm:px-6">
              {(error || (!locked && quoteCurrent && quote.error)) && (
                <p role="alert" className="text-sm text-destructive">
                  {error || quote.error?.message}
                </p>
              )}
              {!locked ? (
                <>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      disabled={
                        busy ||
                        !setup.title.trim() ||
                        (!!selectedId && !current && !saved)
                      }
                      onClick={() => void persist(false)}
                    >
                      <Save size={16} className="mr-2" />
                      Save draft
                    </Button>
                    <Button
                      className="min-w-0 flex-1"
                      disabled={
                        busy ||
                        !options.data?.ready ||
                        !!problem ||
                        !setup.title.trim() ||
                        !quoteCurrent ||
                        quote.isFetching ||
                        !quote.data ||
                        !!quote.error ||
                        (!!selectedId && !current && !saved)
                      }
                      onClick={() => void persist(true)}
                    >
                      {busy ? (
                        <Loader2 size={16} className="mr-2 animate-spin" />
                      ) : (
                        <Sparkles size={16} className="mr-2" />
                      )}
                      {"Generate"}
                      {quoteCurrent && quote.data && !problem
                        ? ` · ≈ ${quote.data.credits.toLocaleString()} credits`
                        : " video"}
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {dirty ? "Unsaved changes. " : ""}
                    {problem ??
                      "Your accepted credit price is fixed. There is no extra deduction after generation. Confirmed provider failures are refunded."}
                  </p>
                </>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {!active && current?.status !== "attention" && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        startNew({
                          ...setup,
                          title: `${setup.title.slice(0, 146)} · New version`,
                        })
                      }
                    >
                      <Plus size={16} className="mr-2" />
                      Create another version
                    </Button>
                  )}
                  {current?.status === "attention" && (
                    <Button
                      variant="outline"
                      disabled={check.isPending}
                      onClick={() => void act("check")}
                    >
                      <RefreshCw size={16} className="mr-2" />
                      Check same request again
                    </Button>
                  )}
                  {active && current.status !== "saving" && (
                    <Button
                      variant="outline"
                      disabled={cancel.isPending || current.cancelRequested}
                      onClick={() => void act("cancel")}
                    >
                      {current.cancelRequested
                        ? "Cancellation requested"
                        : "Request cancellation"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 space-y-6">
            <section
              className="surface overflow-hidden"
              aria-labelledby="video-preview-heading"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
                <h3 id="video-preview-heading" className="font-semibold">
                  {resultAsset ? "Your video" : "Preview"}
                </h3>
                {current && (
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${current.status === "completed" ? "bg-emerald-100 text-emerald-900" : current.status === "failed" || current.status === "attention" ? "bg-amber-100 text-amber-950" : "bg-primary/10 text-primary"}`}
                  >
                    {videoStatusLabels[current.status]}
                  </span>
                )}
              </div>
              {resultAsset ? (
                <div className="bg-slate-950 p-3">
                  <video
                    key={resultAsset.url}
                    controls
                    playsInline
                    preload="metadata"
                    src={resultAsset.url}
                    className="max-h-[480px] min-h-52 w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex min-h-72 flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 px-6 py-12 text-center text-white sm:min-h-80">
                  <span className="mb-5 rounded-2xl border border-white/15 bg-white/5 p-5">
                    {active ? (
                      <Loader2
                        size={32}
                        className="animate-spin text-violet-200"
                      />
                    ) : (
                      <Clapperboard size={32} className="text-violet-200" />
                    )}
                  </span>
                  <h4 className="text-lg font-medium">
                    {active
                      ? videoStatusLabels[current!.status]
                      : "Your next story starts here"}
                  </h4>
                  <p className="mt-3 max-w-xs text-sm leading-6 text-slate-300">
                    {active
                      ? "You can leave this page. Your clip will appear here and in your drafts when it is ready."
                      : "Your generated video will appear here, ready to preview and send for review."}
                  </p>
                </div>
              )}
              {current?.error && (
                <p
                  role="status"
                  className="border-t bg-amber-50 p-4 text-sm leading-6 text-amber-950"
                >
                  {current.error}
                </p>
              )}
              {resultAsset && (
                <div className="space-y-4 p-5">
                  <p className="text-xs text-muted-foreground">
                    {resultAsset.width} × {resultAsset.height}
                    {resultAsset.durationSeconds
                      ? ` · ${resultAsset.durationSeconds.toFixed(1)}s`
                      : ""}{" "}
                    · MP4
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link
                        href={studioDraftsHref({
                          filter: "videos",
                          asset: resultAsset.key,
                          plan: initialPlanId,
                        })}
                      >
                        Review video
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        startNew({
                          ...setup,
                          mode: "extend",
                          sourceVideoKey: resultAsset.key,
                          prompt: "",
                          title: `${setup.title.slice(0, 146)} · Extended`,
                        })
                      }
                    >
                      Extend this clip
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        startNew({
                          ...setup,
                          mode: "edit",
                          sourceVideoKey: resultAsset.key,
                          prompt: "",
                          title: `${setup.title.slice(0, 146)} · Edited`,
                        })
                      }
                    >
                      Edit this clip
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Saved as a draft. Review and approve the finished asset
                    before adding it to a post or ad.
                  </p>
                </div>
              )}
            </section>
            <section
              className="surface p-5"
              aria-labelledby="video-history-heading"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 id="video-history-heading" className="font-semibold">
                  {isUgc ? "Recent creator videos" : "Recent product videos"}
                </h3>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Refresh videos"
                  onClick={() => void refresh()}
                  disabled={history.isFetching}
                >
                  <RefreshCw size={16} />
                </Button>
              </div>
              {history.isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading videos…
                </p>
              ) : history.error ? (
                <p role="alert" className="text-sm text-destructive">
                  Your videos could not be loaded. Try refreshing.
                </p>
              ) : recentVideos.length ? (
                <div className="space-y-2">
                  {recentVideos.slice(0, 8).map(job => (
                    <button
                      key={job.id}
                      type="button"
                      aria-label={`Open ${job.setup.title}`}
                      disabled={busy}
                      onClick={() =>
                        void openVideo(job.id, job.setup.category === "ugc")
                      }
                      className={`flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left hover:border-primary/50 ${job.id === selectedId ? "border-primary/40 bg-primary/5" : "border-transparent bg-muted/20"}`}
                    >
                      <span className="rounded-lg bg-background p-2 text-primary">
                        {activeVideoStatuses.includes(job.status) ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Film size={18} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {job.setup.title}
                        </span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {videoStatusLabels[job.status]} ·{" "}
                          {job.setup.resolution} ·{" "}
                          {new Date(job.updatedAtMs).toLocaleDateString()}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  Saved drafts and generated clips will appear here.
                </p>
              )}
            </section>
          </div>
        </div>
      </>
      {picker && (
        <VideoReferencePicker
          organizationId={organizationId!}
          kind={picker}
          assets={assets.data ?? []}
          selected={
            picker === "images"
              ? setup.imageKeys
              : setup.sourceVideoKey
                ? [setup.sourceVideoKey]
                : []
          }
          limit={picker === "images" ? maxImages : 1}
          onChange={keys =>
            update(
              picker === "images"
                ? { imageKeys: keys }
                : { sourceVideoKey: keys[0] ?? null }
            )
          }
          onClose={() => setPicker(null)}
          onUpload={() => {
            setUploadKind(picker);
            setPicker(null);
            setUpload(true);
          }}
        />
      )}
      <AssetUploadDialog
        open={upload}
        onClose={() => setUpload(false)}
        organizationId={organizationId!}
        role={membership?.role ?? ""}
        parent={null}
        defaultDisposition="draft"
        defaultPurpose="source"
        defaultUgc={isUgc}
        mediaFilter={uploadKind === "video" ? "video" : "image"}
        onSaved={() => utils.assetLibrary.studioList.invalidate(scope)}
        onComplete={key => {
          if (uploadKind === "video") update({ sourceVideoKey: key });
          else
            update({
              imageKeys: Array.from(new Set([...setup.imageKeys, key])).slice(
                0,
                maxImages
              ),
            });
        }}
      />
    </section>
  );
}
