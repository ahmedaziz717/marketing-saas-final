import {
  useStudioNavigation,
  scrollStudioChoices,
} from "@/components/configurator/studioNavigation";
import { StudioCategories } from "@/components/configurator/StudioCategories";
import {
  StudioChoicePicker,
  studioThemeChoices,
  studioThemeGroups,
  studioStyleChoices,
} from "@/components/configurator/StudioChoicePicker";
import { StudioSections } from "@/components/configurator/StudioSections";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  Copy,
  FolderOpen,
  Image,
  Layers3,
  Loader2,
  Palette,
  Save,
  Search,
  Settings2,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ModelSettings } from "@/components/ModelPicker";
import { StudioPeople } from "@/components/configurator/StudioPeople";
import { StudioSources } from "@/components/configurator/StudioSources";
import { StudioPreview } from "@/components/configurator/StudioPreview";
import { StudioLogos } from "@/components/configurator/StudioLogos";
import { ActionCredits } from "@/components/ActionCredits";
import { studioModelArtwork } from "@/components/configurator/studioArtwork";
import { ChoiceArt } from "@/components/configurator/ChoiceArt";
import {
  ConfigurationComparison,
  ModelComparison,
} from "@/components/configurator/Comparisons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CREATIVE_ART_STYLES,
  CREATIVE_MOODS,
  CREATIVE_CHANNELS,
  CREATIVE_FORMATS,
  PROMOTION_TYPES,
  creativeSetupSchema,
  generationSetupIssues,
  outputCount,
  creativeImageOutputs,
  formatDetails,
  type CreativeSetup,
} from "@shared/creativeBuilder";
import { getCreativeTheme } from "@shared/creativeThemes";
import {
  generationModel,
  modelDefaults,
  referenceCapacity,
  requiresVideo,
  type ModelDefinition,
  type ModelOptions,
} from "@shared/modelCatalog";
import {
  videoSetupProblem,
  videoSetupSchema,
  defaultVideoDirection,
  type VideoSetup,
  type VideoDirection,
} from "@shared/videoCreation";
import {
  configuratorSections,
  newConfiguration,
  readConfiguration,
  imageReferenceCount,
  modelCompatibility,
  videoWithModel,
  readConfigurationSnapshot,
  type ConfigurationSnapshot,
  type ConfiguratorState,
} from "@shared/creativeConfigurator";
import "@/styles/configurator.css";

type Choice = {
  id: string;
  title: string;
  description: string;
  image?: string;
  art?: string;
  palette?: readonly string[];
  badge?: string;
  reason?: string;
  detail?: ReactNode;
  footer?: ReactNode;
};
const sectionIcons = [Layers3, Palette, WandSparkles, Sparkles, Settings2];
function Field({
  title,
  children,
  help,
}: {
  title: string;
  children: ReactNode;
  help?: string;
}) {
  return (
    <label className="cfg-field">
      <span>{title}</span>
      {children}
      {help && <small>{help}</small>}
    </label>
  );
}
export default function CreativeConfiguratorPage() {
  const { organizationId } = useWorkspace();
  const { user } = useAuth();
  return (
    <WorkspaceGate>
      <Configurator key={String(user?.id) + ":" + organizationId} />
    </WorkspaceGate>
  );
}
function Configurator() {
  const studioRoot = useStudioNavigation();
  const { organizationId, membership } = useWorkspace();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const scope = { organizationId: organizationId! };
  const storageKey = "el-configurator-v1:" + user?.id + ":" + organizationId;
  const [config, setConfig] = useState<ConfiguratorState>(() => {
    try {
      return (
        readConfiguration(localStorage.getItem(storageKey)) ??
        newConfiguration()
      );
    } catch {
      return newConfiguration();
    }
  });
  const [section, setSection] = useState("type"),
    [category, setCategory] = useState("type");
  const [tab, setTab] = useState("all"),
    [search, setSearch] = useState(""),
    [maker, setMaker] = useState("all");
  const [capability, setCapability] = useState("all"),
    [maxCredits, setMaxCredits] = useState("");
  const [info, setInfo] = useState<Choice | null>(null),
    [confirm, setConfirm] = useState(false),
    [draftsOpen, setDraftsOpen] = useState(false);
  const [storageOk, setStorageOk] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pendingImageJob, setPendingImageJob] = useState<number | null>(null);
  const [savedImage, setSavedImage] = useState<{
    briefId: number;
    updatedAtMs: number;
  } | null>(null);
  const [savedVideo, setSavedVideo] = useState<{
    id: string;
    revision: number;
  } | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState<"models" | "builds" | null>(
    null
  );
  const [baseline, setBaseline] = useState<ConfigurationSnapshot | null>(() => {
    try {
      return readConfigurationSnapshot(
        localStorage.getItem(storageKey + ":comparison")
      );
    } catch {
      return null;
    }
  });
  const configRef = useRef(config);
  configRef.current = config;
  const canCreate = ["owner", "admin", "creator"].includes(
    membership?.role ?? ""
  );
  const options = trpc.creativeBuilder.options.useQuery(scope, {
    enabled: !!organizationId && canCreate,
  });
  const models = trpc.models.studioCatalog.useQuery(scope, {
    enabled: !!organizationId && canCreate,
    staleTime: 60000,
  });
  const assets = trpc.assetLibrary.studioList.useQuery(scope, {
    enabled: !!organizationId && canCreate,
  });
  const videos = trpc.video.list.useQuery(scope, {
    enabled: !!organizationId && canCreate,
  });
  const readiness = trpc.video.options.useQuery(scope, {
    enabled: !!organizationId && canCreate,
  });
  const utils = trpc.useUtils();
  const approveLogo = trpc.assetLibrary.approveAndAdd.useMutation(),
    reviewLogo = trpc.assetLibrary.review.useMutation(),
    submitLogo = trpc.assetLibrary.submit.useMutation();
  const imageSave = trpc.creativeBuilder.save.useMutation(),
    videoSave = trpc.video.save.useMutation();
  const imageGenerate = trpc.creativeBuilder.generate.useMutation(),
    videoGenerate = trpc.video.generate.useMutation();
  const copyAI = trpc.creativeBuilder.refreshCopy.useMutation(),
    promptAI = trpc.video.draftPrompt.useMutation();
  const image = config.image,
    video = config.video,
    isImage = config.kind === "image";
  const setup = isImage ? image : video;
  const direction = isImage
    ? image
    : (video.direction ?? defaultVideoDirection);
  const selectedModel = models.data?.find(m => m.id === setup.modelId);
  const model = generationModel(selectedModel?.routeId ?? setup.modelId ?? "");
  const referenceCount = isImage
    ? imageReferenceCount(image)
    : video.imageKeys.length + video.people.length;
  const incompatible = model
    ? modelCompatibility(
        model,
        referenceCount,
        !isImage && !!video.sourceVideoKey
      )
    : null;
  const theme = getCreativeTheme(direction.theme);
  const scene = isImage
    ? image.shot === "product"
      ? "product"
      : image.shot === "lifestyle"
        ? "lifestyle"
        : "people"
    : (video.direction?.setting ?? "product");
  const currentSection = configuratorSections.find(s => s.id === section)!;
  const categories = currentSection.categories.filter(
    c => !isImage || !["audio", "subtitles"].includes(c.id)
  );
  const products = options.data?.products ?? [];
  const selectedProduct = products.find(
    p => p.id === image.products[0]?.productId
  );
  const selectedCatalog = trpc.video.catalogImages.useQuery(
    {
      ...scope,
      selectedOnly: true,
      selectedKeys: video.imageKeys.filter(k => k.startsWith("product_image:")),
    },
    { enabled: canCreate && !isImage }
  );
  const videoReference =
    assets.data?.find(a => a.key === video.imageKeys[0]) ??
    selectedCatalog.data?.items.find(a => a.key === video.imageKeys[0]);
  const preview = isImage
    ? (selectedProduct?.images.find(i => i.id === image.products[0]?.imageId)
        ?.url ??
      assets.data?.find(a => a.key === image.sourceAssetKeys?.[0])?.url ??
      options.data?.references.find(a => a.id === image.referenceAssetIds?.[0])
        ?.url)
    : videoReference?.url;
  const issues: string[] = [];
  if (isImage) {
    issues.push(...generationSetupIssues(image));
    if (options.data?.brand?.status !== "active")
      issues.push("Activate your Brand Kit before generating images.");
    if (
      image.products.some(
        p =>
          !products.some(
            item =>
              item.id === p.productId &&
              (p.imageId === null
                ? item.recordType === "service"
                : item.images.some(i => i.id === p.imageId))
          )
      )
    )
      issues.push(
        "A selected catalog image is no longer available. Choose it again."
      );
    if (
      image.promotionMode === "platform" &&
      !image.promotion?.description.trim() &&
      !options.data?.brand?.businessProfile?.summary?.trim()
    )
      issues.push(
        "Describe your business, service or subscription in Subject & sources."
      );
    const parsed = creativeSetupSchema.safeParse(image);
    if (!parsed.success) issues.push(parsed.error.issues[0].message);
  } else {
    const problem = videoSetupProblem(video);
    if (problem) issues.push(problem);
    if (!video.prompt.trim())
      issues.push("Describe what should happen in your video.");
    if (!readiness.data?.ready)
      issues.push("Video generation is awaiting service readiness.");
    const parsed = videoSetupSchema.safeParse(video);
    if (!parsed.success) issues.push(parsed.error.issues[0].message);
  }
  if (models.isError)
    issues.push("Could not check model availability. Retry the model catalog.");
  if (!selectedModel?.available)
    issues.push(
      selectedModel?.reason ?? "Choose an available generation model."
    );
  if (incompatible) issues.push(incompatible);
  const [quotedConfig, setQuotedConfig] = useState(config);
  useEffect(() => {
    const timer = setTimeout(() => setQuotedConfig(config), 500);
    return () => clearTimeout(timer);
  }, [config]);
  const sameQuote = JSON.stringify(quotedConfig) === JSON.stringify(config);
  const imageQuote = trpc.creativeBuilder.quote.useQuery(
    { ...scope, setup: quotedConfig.image },
    {
      enabled: canCreate && isImage && sameQuote && !issues.length,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const videoQuote = trpc.video.quote.useQuery(
    { ...scope, setup: quotedConfig.video },
    {
      enabled: canCreate && !isImage && sameQuote && !issues.length,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const quote = isImage ? imageQuote : videoQuote;
  const imageOutputs = creativeImageOutputs(quotedConfig.image);
  const planningOutputs = imageOutputs.length
    ? imageOutputs
    : quotedConfig.image.formatIds
        .map(formatDetails)
        .filter(Boolean)
        .map(f => ({ width: f!.width, height: f!.height }));
  const planning = trpc.models.studioEstimate.useQuery(
    {
      ...scope,
      kind: config.kind,
      modelId:
        (isImage ? quotedConfig.image.modelId : quotedConfig.video.modelId) ??
        "",
      options:
        (isImage
          ? quotedConfig.image.modelOptions
          : quotedConfig.video.modelOptions) ?? {},
      outputs:
        isImage && planningOutputs.length
          ? planningOutputs
          : [{ width: 1080, height: 1080 }],
      sourceSeconds: !isImage
        ? assets.data?.find(a => a.key === video.sourceVideoKey)
            ?.durationSeconds
        : undefined,
    },
    {
      enabled: canCreate && !!selectedModel?.available && sameQuote,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  const baselineImageQuote = trpc.creativeBuilder.quote.useQuery(
    { ...scope, setup: baseline?.config.image ?? image },
    {
      enabled:
        canCreate &&
        compareOpen === "builds" &&
        baseline?.config.kind === "image",
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const baselineVideoQuote = trpc.video.quote.useQuery(
    { ...scope, setup: baseline?.config.video ?? video },
    {
      enabled:
        canCreate &&
        compareOpen === "builds" &&
        baseline?.config.kind === "video",
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const baselineQuote =
    baseline?.config.kind === "image" ? baselineImageQuote : baselineVideoQuote;
  const credits =
    !issues.length && sameQuote && !quote.isFetching && !quote.error
      ? quote.data?.credits
      : undefined;
  const ready = credits !== undefined && !busy && !pendingImageJob;
  const estimateCredits =
    credits ?? planning.data?.credits ?? selectedModel?.estimatedCredits;
  const quoteLabel =
    estimateCredits != null
      ? `${credits === undefined ? "≈ " : ""}${estimateCredits.toLocaleString()} credits`
      : planning.error
        ? "Credits unavailable"
        : "Calculating credits…";
  const creditDetail =
    credits !== undefined
      ? "Total for this creative"
      : !sameQuote || planning.isFetching
        ? "Updating with your choices…"
        : (planning.data?.assumptions ??
          "Select a model to see its credit estimate");
  const comparisonModels = (models.data ?? []).filter(
    m =>
      m.kind === config.kind &&
      m.enabled !== false &&
      compareIds.includes(m.id) &&
      generationModel(m.routeId)
  );
  function keepComparison(value: ConfigurationSnapshot) {
    setBaseline(value);
    try {
      localStorage.setItem(storageKey + ":comparison", JSON.stringify(value));
    } catch {
      toast.info(
        "Comparison kept for this session. Browser storage is unavailable."
      );
    }
  }
  function duplicateForComparison() {
    keepComparison({
      config: structuredClone(config),
      credits: credits ?? null,
      capturedAt: Date.now(),
    });
    if (isImage) {
      setSavedImage(null);
      updateImage({ name: image.name.slice(0, 145) + " · Alternative" });
    } else {
      setSavedVideo(null);
      updateVideo({ title: video.title.slice(0, 145) + " · Alternative" });
    }
    toast.success(
      "Original kept for comparison. Customize this alternative, then choose Compare builds."
    );
  }
  function swapBuilds() {
    if (!baseline) return;
    const restored = baseline.config;
    keepComparison({
      config: structuredClone(config),
      credits: credits ?? null,
      capturedAt: Date.now(),
    });
    setSavedImage(null);
    setSavedVideo(null);
    update(structuredClone(restored));
    go("output", "review");
  }
  function toggleCompare(id: string) {
    const currentIds = comparisonModels.map(m => m.id);
    if (currentIds.includes(id))
      setCompareIds(currentIds.filter(i => i !== id));
    else if (currentIds.length < 3) setCompareIds([...currentIds, id]);
    else toast.info("Compare up to three models. Remove one to add another.");
  }
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    }
  }, [config, storageKey]);
  const initialized = useRef(false);
  useEffect(() => {
    if (!options.data || initialized.current) return;
    initialized.current = true;
    if (
      configRef.current.image.name === "Untitled creative" &&
      !configRef.current.image.products.length &&
      !configRef.current.image.promotionMode &&
      !["products", "mixed"].includes(
        options.data.brand?.businessProfile?.model ?? "products"
      )
    )
      updateImage({
        promotionMode: "platform",
        products: [],
        promotion: { kind: "platform", title: "", description: "" },
      });
  }, [options.data]);
  function update(next: ConfiguratorState) {
    setConfig(next);
    setError("");
  }
  function updateImage(patch: Partial<CreativeSetup>) {
    update({
      ...configRef.current,
      image: { ...configRef.current.image, ...patch },
    });
  }
  function updateVideo(patch: Partial<VideoSetup>) {
    update({
      ...configRef.current,
      video: { ...configRef.current.video, ...patch },
    });
  }
  function updateDirection(patch: Partial<VideoDirection>) {
    if (isImage) updateImage(patch);
    else
      updateVideo({
        direction: { ...(video.direction ?? defaultVideoDirection), ...patch },
      });
  }
  function go(sectionId: string, categoryId?: string) {
    setSection(sectionId);
    setCategory(
      categoryId ??
        configuratorSections.find(s => s.id === sectionId)!.categories[0].id
    );
    setTab("all");
    setSearch("");
    setMaker("all");
    setCapability("all");
    setMaxCredits("");
    scrollStudioChoices(studioRoot.current);
  }
  function chooseCategory(id: string) {
    setCategory(id);
    setTab("all");
    setSearch("");
    setMaker("all");
    setCapability("all");
    setMaxCredits("");
    scrollStudioChoices(studioRoot.current);
  }
  function chooseModel(m: NonNullable<typeof models.data>[number]) {
    const def = generationModel(m.routeId)!;
    if (isImage)
      updateImage({ modelId: m.id, modelOptions: modelDefaults(def) });
    else updateVideo({ ...videoWithModel(video, def), modelId: m.id });
    toast.info(
      "Model selected. Its settings use current defaults; your source selections were preserved."
    );
  }
  function modelSettingsChanged(values: ModelOptions) {
    if (isImage) updateImage({ modelOptions: values });
    else if (model)
      updateVideo({
        ...videoWithModel(video, model, values),
        modelId: video.modelId,
      });
  }
  async function saveDraft() {
    if (!canCreate || busy) return;
    setBusy(true);
    setError("");
    try {
      if (isImage) {
        const result = await imageSave.mutateAsync({
          ...scope,
          setup: image,
          briefId: savedImage?.briefId,
          expectedUpdatedAtMs: savedImage?.updatedAtMs,
        });
        setSavedImage(result);
        await utils.creativeBuilder.options.invalidate();
      } else {
        const result = await videoSave.mutateAsync({
          ...scope,
          setup: video,
          ...savedVideo,
        });
        setSavedVideo({ id: result.id, revision: result.revision });
        await utils.video.list.invalidate();
      }
      toast.success(
        "Draft saved to your workspace. Open Saved drafts to continue on another device."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (!ready || credits === undefined || !canCreate) return;
    setBusy(true);
    setError("");
    try {
      if (isImage) {
        const saved = await imageSave.mutateAsync({
          ...scope,
          setup: image,
          briefId: savedImage?.briefId,
          expectedUpdatedAtMs: savedImage?.updatedAtMs,
        });
        setSavedImage(saved);
        const started = await imageGenerate.mutateAsync({
          ...scope,
          briefId: saved.briefId,
          expectedUpdatedAtMs: saved.updatedAtMs,
          requestId: crypto.randomUUID(),
          quotedCredits: credits,
        });
        setPendingImageJob(started.jobId);
        document
          .querySelector(".cfg-stage")
          ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      } else {
        const saved = await videoSave.mutateAsync({
          ...scope,
          setup: video,
          ...savedVideo,
        });
        setSavedVideo({ id: saved.id, revision: saved.revision });
        await videoGenerate.mutateAsync({
          ...scope,
          id: saved.id,
          revision: saved.revision,
          quotedCredits: credits,
        });
        navigate("/app/creatives/video?video=" + saved.id);
      }
      toast.success(
        isImage
          ? "Creating your images. Results will appear here and remain saved as drafts."
          : "Generation started. Your results will appear in your workspace."
      );
      await utils.models.credits.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation could not start.");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }
  async function generateText() {
    const before = configRef.current;
    try {
      if (isImage) {
        const copy = await copyAI.mutateAsync({ ...scope, setup: image });
        if (before === configRef.current) updateImage({ copy });
        else
          toast.info(
            "Your newer edits were kept. Generate again to use the latest selections."
          );
      } else {
        const result = await promptAI.mutateAsync({ ...scope, setup: video });
        if (before === configRef.current)
          updateVideo({ prompt: result.prompt });
        else
          toast.info(
            "Your newer edits were kept. Generate again to use the latest selections."
          );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate text.");
    }
  }
  function tabs(items: { id: string; name: string }[]) {
    return (
      <StudioCategories
        compact
        label="Choice groups"
        items={items.map(item => ({ id: item.id, title: item.name }))}
        current={tab}
        onSelect={setTab}
      />
    );
  }
  function cards(
    choices: Choice[],
    selected: string[],
    onSelect: (id: string) => void,
    multi = false
  ) {
    const filtered = choices.filter(c =>
      (c.title + " " + c.description)
        .toLowerCase()
        .includes(search.toLowerCase())
    );
    return (
      <>
        <div className="cfg-choice-count">
          {filtered.length} choices{" "}
          <span>
            {multi ? "Select multiple" : "Select one"} · Illustrations are
            visual guides
          </span>
        </div>
        <div className="cfg-card-grid">
          {filtered.map(c => (
            <article
              key={c.id}
              className={
                "cfg-card" +
                (selected.includes(c.id) ? " is-selected" : "") +
                (c.reason ? " is-unavailable" : "")
              }
            >
              <button
                className="cfg-choice"
                disabled={!!c.reason}
                aria-pressed={selected.includes(c.id)}
                aria-label={"Select " + c.title}
                onClick={() => onSelect(c.id)}
              >
                <div
                  className={
                    "cfg-card-art" +
                    (category === "brand" ? " cfg-contain" : "")
                  }
                >
                  {c.image ? (
                    <img src={c.image} alt={c.title} loading="lazy" />
                  ) : (
                    <ChoiceArt
                      name={c.title}
                      type={c.art}
                      palette={c.palette}
                    />
                  )}
                  {c.badge && <span className="cfg-badge">{c.badge}</span>}
                  <span className="cfg-selected-mark">
                    {selected.includes(c.id) ? <Check size={15} /> : "+"}
                  </span>
                </div>
                <div className="cfg-card-copy">
                  <h3>{c.title}</h3>
                  <p>{c.description}</p>
                  {c.footer && <div className="cfg-card-foot">{c.footer}</div>}
                </div>
              </button>
              {c.reason && <p className="cfg-disabled-reason">{c.reason}</p>}
              <div className="cfg-card-tools">
                <button
                  className="cfg-info"
                  onClick={() => setInfo(c)}
                  aria-label={"More about " + c.title}
                >
                  <CircleHelp size={15} /> Details
                </button>
                {category === "model" && (
                  <label className="cfg-compare-check">
                    <input
                      type="checkbox"
                      checked={comparisonModels.some(m => m.id === c.id)}
                      onChange={() => toggleCompare(c.id)}
                      aria-label={"Compare " + c.title}
                    />{" "}
                    Compare
                  </label>
                )}
              </div>
            </article>
          ))}
        </div>
        {!filtered.length && (
          <div className="cfg-empty">
            No choices match.{" "}
            <button
              onClick={() => {
                setSearch("");
                setTab("all");
                setMaker("all");
                setCapability("all");
                setMaxCredits("");
              }}
            >
              Reset filters
            </button>
          </div>
        )}
      </>
    );
  }
  const scenes: Choice[] = [
    {
      id: "product",
      title: "Subject only",
      description:
        "A focused product, service concept or brand composition without people.",
      art: "image",
    },
    {
      id: "lifestyle",
      title: "Lifestyle · no people",
      description:
        "Place your subject in a believable setting, with no people or faces.",
      art: "scene",
      palette: ["#183329", "#608c74", "#efedc5"],
    },
    {
      id: "people",
      title: "Lifestyle · with people",
      description: "Add one to four people from your existing model library.",
      art: "people",
      palette: ["#35252b", "#bb797a", "#ffe2c0"],
    },
  ];
  function content() {
    if (category === "audio") {
      const controls = Object.entries(
        model?.inputSchema.properties ?? {}
      ).filter(([k, p]) => /audio|sound/.test(k) && p.type === "boolean");
      return (
        <div className="cfg-form">
          <h3>Give your video a sound</h3>
          <p>
            Audio controls follow your selected model. Changes are included in
            the credit total.
          </p>
          {controls.length ? (
            controls.map(([key, property]) => (
              <Field
                key={key}
                title={property.title || key.replaceAll("_", " ")}
                help={property.description}
              >
                <select
                  value={String(
                    (video.modelOptions?.[key] ?? property.default ?? false) ===
                      true
                  )}
                  onChange={e =>
                    modelSettingsChanged({
                      ...video.modelOptions,
                      [key]: e.target.value === "true",
                    })
                  }
                >
                  <option value="false">Off</option>
                  <option value="true">On</option>
                </select>
              </Field>
            ))
          ) : (
            <div className="cfg-note">
              This model does not expose audio controls.{" "}
              <button onClick={() => go("model")}>Explore other models</button>
            </div>
          )}
          <div className="cfg-note">
            <strong>Voice, music & sound effects</strong>
            <p>
              Separate voice selection, music tracks and audio mixing are not
              available in this prototype. For models with generated audio,
              describe the desired sound in your prompt; exact delivery depends
              on the model.
            </p>
          </div>
        </div>
      );
    }
    if (category === "subtitles")
      return (
        <div className="cfg-empty">
          <h3>Subtitles & finishing</h3>
          <p>
            Subtitle transcription, timing and style selection are not available
            in this prototype yet. No subtitle service is added to your build or
            credit total.
          </p>
          <p>
            Generated on-screen text is not a substitute for timed subtitles.
          </p>
        </div>
      );
    if (category === "type")
      return cards(
        [
          {
            id: "image",
            title: "Image",
            description:
              "Create campaign imagery, product scenes and brand visuals in multiple sizes.",
            art: "image",
            badge: "Still imagery",
            detail:
              "Uses the existing Image Creator. Approved catalog images, Brand Kit references, themes, people and copy flow into the same generation pipeline.",
          },
          {
            id: "video",
            title: "Video",
            description:
              "Create a product film or creator video. Edit, extend or transfer motion with compatible models.",
            art: "video",
            badge: "Moving stories",
            palette: ["#18253b", "#537fc0", "#d0f07d"],
            detail:
              "Uses the existing video generation pipeline. Choose a model and its supported duration, resolution, audio and inputs. Source-video operations depend on the selected model.",
          },
        ],
        [config.kind],
        id => {
          update({ ...config, kind: id as "image" | "video" });
        }
      );
    if (category === "source")
      return (
        <StudioSources
          organizationId={organizationId!}
          role={membership?.role ?? "creator"}
          kind={config.kind}
          image={image}
          video={video}
          products={products}
          assets={assets.data ?? []}
          search={search}
          updateImage={updateImage}
          updateVideo={updateVideo}
          onUploaded={async () => {
            await Promise.all([
              utils.assetLibrary.studioList.invalidate(),
              utils.creativeBuilder.options.invalidate(),
              utils.video.catalogImages.invalidate(),
            ]);
          }}
        />
      );
    if (category === "brand")
      return (
        <>
          <div className="cfg-note">
            <strong>{options.data?.brand?.name ?? "Your Brand Kit"}</strong>
            <p>
              {options.data?.brand?.status === "active"
                ? "Active · your saved brand context is available."
                : "Activate your Brand Kit before image generation."}
            </p>
            <Link href="/app/brand">
              Manage Brand Kit <ArrowRight size={13} />
            </Link>
          </div>
          {isImage ? (
            <StudioLogos
              assets={assets.data ?? []}
              role={membership?.role ?? "creator"}
              selectedId={image.logoAssetId}
              search={search}
              loading={assets.isLoading}
              loadError={
                assets.error
                  ? "Saved logos could not be loaded. Refresh to try again."
                  : undefined
              }
              onChange={logoAssetId => updateImage({ logoAssetId })}
              onAction={async (asset, action) => {
                const input = {
                  ...scope,
                  key: asset.key,
                  revision: asset.revision,
                };
                if (action === "submit") await submitLogo.mutateAsync(input);
                else if (asset.state === "needs_review")
                  await reviewLogo.mutateAsync({
                    ...input,
                    decision: "approved",
                    note: "Approved from Creative Studio's logo picker.",
                  });
                else await approveLogo.mutateAsync(input);
                await Promise.all([
                  utils.assetLibrary.studioList.invalidate(),
                  utils.assetLibrary.list.invalidate(),
                  utils.creativeBuilder.options.invalidate(),
                ]);
                if (action === "submit")
                  toast.success("Logo submitted for review.");
              }}
            />
          ) : (
            <p className="cfg-help">
              Video uses your selected references and written direction. Exact
              logo overlays are not available in this prototype; add a branded
              reference image or finish branding in an editor.
            </p>
          )}
          {isImage && !!options.data?.references.length && (
            <section className="cfg-brand-references">
              <h3>Brand imagery</h3>
              <p className="cfg-help">
                Add up to three approved references for your brand's visual
                direction.
              </p>
              {cards(
                options.data.references.map(r => ({
                  id: `reference:${r.id}`,
                  title: r.name,
                  description: "Approved brand reference",
                  image: r.url,
                  reason:
                    (image.referenceAssetIds?.length ?? 0) >= 3 &&
                    !image.referenceAssetIds?.includes(r.id)
                      ? "Remove a reference before adding another."
                      : undefined,
                })),
                (image.referenceAssetIds ?? []).map(id => `reference:${id}`),
                key => {
                  const id = Number(key.split(":")[1]);
                  updateImage({
                    referenceAssetIds: image.referenceAssetIds?.includes(id)
                      ? image.referenceAssetIds.filter(x => x !== id)
                      : [...(image.referenceAssetIds ?? []), id],
                  });
                },
                true
              )}
            </section>
          )}
        </>
      );
    if (category === "scene")
      return cards(scenes, [scene], id => {
        if (isImage)
          updateImage({
            shot:
              id === "people" ? "multiple" : (id as "product" | "lifestyle"),
            people: id === "people" ? image.people : [],
            person: undefined,
          });
        else
          updateVideo({
            category: id === "people" ? "ugc" : "product",
            people: id === "people" ? video.people : [],
            direction: {
              ...(video.direction ?? defaultVideoDirection),
              setting: id as VideoDirection["setting"],
            },
          });
        if (scene === "people" && id !== "people")
          toast.info(
            "People were removed because the new scene has no people."
          );
      });
    if (category === "people")
      return scene !== "people" ? (
        <div className="cfg-empty">
          <ChoiceArt name="People" type="people" />
          <h3>Add a human element</h3>
          <p>
            Choose “Lifestyle · with people” in Scene to unlock the people
            library.
          </p>
          <button onClick={() => go("look", "scene")}>
            Choose a scene <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <StudioPeople
          organizationId={organizationId!}
          selected={isImage ? (image.people ?? []) : video.people}
          onChange={people =>
            isImage
              ? updateImage({ people, person: undefined })
              : updateVideo({ people })
          }
        />
      );
    if (category === "theme")
      return (
        <>
          <StudioChoicePicker
            title="Theme"
            choices={studioThemeChoices}
            groups={studioThemeGroups}
            selected={[direction.theme]}
            onSelect={id =>
              updateDirection({
                theme: id,
                themePrompt: getCreativeTheme(id).direction,
              })
            }
          />
          <p className="cfg-help">
            Changing the theme updates visual direction and preserves your
            written copy.
          </p>
        </>
      );
    if (category === "style")
      return (
        <StudioChoicePicker
          title="Art style"
          choices={studioStyleChoices}
          selected={[direction.artStyle]}
          onSelect={id =>
            updateDirection({ artStyle: id as VideoDirection["artStyle"] })
          }
        />
      );
    if (category === "mood")
      return cards(
        CREATIVE_MOODS.map((m, i) => ({
          id: m.id,
          title: m.name,
          description: m.direction,
          palette: [
            i % 2 ? "#112132" : "#2d2035",
            ["#8c82df", "#f08b65", "#536278", "#afbaa9"][i % 4],
            "#e7e7d5",
          ],
        })),
        [direction.mood],
        id => updateDirection({ mood: id as VideoDirection["mood"] })
      );
    if (category === "composition")
      return cards(
        [
          {
            id: "auto",
            title: "Art-directed",
            description:
              "Let the generator balance your subject and supporting content.",
          },
          {
            id: "left",
            title: "Subject left",
            description:
              "Request space to the right for copy or breathing room.",
          },
          {
            id: "center",
            title: "Subject center",
            description: "Keep the subject as the central focal point.",
          },
          {
            id: "right",
            title: "Subject right",
            description:
              "Request space to the left for copy or breathing room.",
          },
        ],
        [direction.placement],
        id => updateDirection({ placement: id as VideoDirection["placement"] })
      );
    if (category === "message")
      return (
        <div className="cfg-form">
          <div className="cfg-note">
            {isImage
              ? "This image pipeline requires a headline and CTA. Text is generated into the image; inspect spelling and placement in the result."
              : "Describe the action, sequence and camera movement. Dialogue and sound are available only on models that support them."}
          </div>
          {isImage ? (
            (["headline", "subheadline", "cta"] as const).map(key => (
              <Field
                key={key}
                title={
                  key === "cta"
                    ? "Call to action · required"
                    : key === "headline"
                      ? "Headline · required"
                      : "Subheadline · optional"
                }
              >
                <input
                  value={image.copy[key]}
                  maxLength={
                    key === "cta" ? 60 : key === "headline" ? 180 : 400
                  }
                  onChange={e =>
                    updateImage({
                      copy: { ...image.copy, [key]: e.target.value },
                    })
                  }
                />
              </Field>
            ))
          ) : (
            <Field title="Video prompt · required">
              <textarea
                rows={7}
                value={video.prompt}
                maxLength={10000}
                placeholder="Describe the subject, action, scene and camera movement…"
                onChange={e => updateVideo({ prompt: e.target.value })}
              />
            </Field>
          )}
          <button
            className="cfg-secondary"
            disabled={
              copyAI.isPending ||
              promptAI.isPending ||
              (!isImage && !video.imageKeys.length) ||
              (isImage && options.data?.brand?.status !== "active")
            }
            onClick={generateText}
          >
            <WandSparkles size={16} />
            {copyAI.isPending || promptAI.isPending
              ? "Writing…"
              : isImage
                ? "Generate copy from this setup"
                : "Generate prompt from references"}
            <ActionCredits
              organizationId={organizationId}
              operation={
                isImage ? "creativeBuilder.refreshCopy" : "video.draftPrompt"
              }
            />
          </button>
          {!isImage && !video.imageKeys.length && (
            <p className="cfg-help">
              Add a reference image in Type & Source to generate a prompt from
              it.
            </p>
          )}
        </div>
      );
    if (category === "direction")
      return (
        <div className="cfg-form">
          <Field title="Theme direction">
            <textarea
              value={direction.themePrompt ?? theme.direction}
              maxLength={4000}
              onChange={e => updateDirection({ themePrompt: e.target.value })}
            />
          </Field>
          <Field
            title="Additional creative direction"
            help="Composition, lighting and styling instructions. Use verified facts for claims."
          >
            <textarea
              value={direction.extraDirection}
              maxLength={4000}
              onChange={e =>
                updateDirection({ extraDirection: e.target.value })
              }
            />
          </Field>
          {isImage && (
            <details>
              <summary>Base generation instructions</summary>
              <Field title="Base prompt">
                <textarea
                  rows={7}
                  value={image.basePrompt}
                  maxLength={8000}
                  onChange={e => updateImage({ basePrompt: e.target.value })}
                />
              </Field>
            </details>
          )}
        </div>
      );
    if (category === "model") {
      const list = (models.data ?? []).filter(
        m => m.kind === config.kind && m.enabled
      );
      const makers = Array.from(new Set(list.map(m => m.maker))).sort();
      const visible = list.filter(m => {
        const d = generationModel(m.routeId);
        return (
          d &&
          (maker === "all" || m.maker === maker) &&
          (tab !== "value" || m.direct) &&
          (capability !== "references" || referenceCapacity(d) > 0) &&
          (capability !== "video" || requiresVideo(d)) &&
          (capability !== "prompt" ||
            !(d.inputSchema.required ?? []).some(k => /_url/.test(k))) &&
          (!maxCredits ||
            (m.estimatedCredits != null &&
              m.estimatedCredits <= Number(maxCredits))) &&
          (tab !== "compatible" ||
            (m.available &&
              !modelCompatibility(
                d,
                referenceCount,
                !isImage && !!video.sourceVideoKey
              )))
        );
      });
      return (
        <>
          {tabs([
            { id: "all", name: "All models" },
            { id: "compatible", name: "Compatible with my setup" },
            { id: "value", name: "Great Value" },
          ])}
          <div className="cfg-filters">
            <Field title="Model maker">
              <select value={maker} onChange={e => setMaker(e.target.value)}>
                <option value="all">All makers</option>
                {makers.map(m => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field title="Input capability">
              <select
                value={capability}
                onChange={e => setCapability(e.target.value)}
              >
                <option value="all">All inputs</option>
                <option value="prompt">Prompt only supported</option>
                <option value="references">Reference images</option>
                {!isImage && (
                  <option value="video">Requires source video</option>
                )}
              </select>
            </Field>
            <Field title="Maximum starting credits">
              <input
                type="number"
                min="0"
                value={maxCredits}
                placeholder="Any"
                onChange={e => setMaxCredits(e.target.value)}
              />
            </Field>
          </div>
          <p className="cfg-help">
            Card prices are estimates at model defaults. Your complete credit
            total is confirmed before generation. Artwork is visual inspiration,
            not a sample generated by each model.
          </p>
          <div className="cfg-compare-bar">
            <span>
              <strong>{comparisonModels.length} / 3</strong> models to compare{" "}
              <small>Check Compare on any model card.</small>
            </span>
            <div className="cfg-actions">
              <button
                disabled={!comparisonModels.length}
                onClick={() => setCompareIds([])}
              >
                Clear
              </button>
              <button
                disabled={comparisonModels.length < 2}
                onClick={() => setCompareOpen("models")}
              >
                Compare models
              </button>
            </div>
          </div>
          {models.isLoading && <p>Loading model catalog…</p>}
          {models.error && (
            <button onClick={() => models.refetch()}>
              Retry model catalog
            </button>
          )}
          {cards(
            visible.map(m => {
              const d = generationModel(m.routeId)!;
              const reason = !m.available
                ? (m.reason ?? "Currently unavailable.")
                : modelCompatibility(
                    d,
                    referenceCount,
                    !isImage && !!video.sourceVideoKey
                  );
              return {
                id: m.id,
                title: m.name,
                description: m.maker + " · " + m.variant,
                image: studioModelArtwork(m.routeId, config.kind),
                art: config.kind,
                badge: m.direct ? "Great Value" : undefined,
                reason: reason ?? undefined,
                footer: (
                  <>
                    {m.estimatedCredits != null
                      ? "≈ " +
                        m.estimatedCredits +
                        " credits / " +
                        (isImage ? "image" : String(m.estimatedSeconds) + "s")
                      : "See credits on selection"}
                    <br />
                    {referenceCapacity(d)} image references{" "}
                    {requiresVideo(d) ? "· Source video required" : ""}
                  </>
                ),
                detail: (
                  <ModelSynopsis model={d} name={m.name} maker={m.maker} />
                ),
              };
            }),
            [setup.modelId ?? ""],
            id => chooseModel(list.find(m => m.id === id)!)
          )}
        </>
      );
    }
    if (category === "settings" || (!isImage && category === "format"))
      return (
        <div className="cfg-form">
          <h3>{selectedModel?.name ?? "Select an AI model"}</h3>
          <p>
            Only settings supported by the selected model appear. Changing the
            model restores its own defaults.
          </p>
          <ModelSettings
            presentation="tiles"
            organizationId={organizationId}
            modelId={setup.modelId}
            options={setup.modelOptions}
            onChange={modelSettingsChanged}
          />
          {!isImage && (
            <p className="cfg-help">
              Video resolution is the model's output resolution. Aspect ratio
              determines framing; exact pixel dimensions are confirmed by the
              generated file. Some edit models inherit their source clip's
              framing and duration.
            </p>
          )}
        </div>
      );
    if (category === "format")
      return (
        <>
          {tabs([{ id: "all", name: "All channels" }, ...CREATIVE_CHANNELS])}
          <p className="cfg-help">
            Choose one or more output sizes. These are creative formats;
            selecting one does not connect an ad account or publish anything.
          </p>
          {cards(
            CREATIVE_FORMATS.filter(
              f => tab === "all" || f.channel === tab
            ).map(f => ({
              id: f.id,
              title: f.name,
              description:
                (CREATIVE_CHANNELS.find(c => c.id === f.channel)?.name ?? "") +
                " · " +
                f.width +
                " × " +
                f.height +
                " px",
              footer: "Ratio " + ratioLabel(f.width, f.height),
              art: "format:" + f.width / f.height,
            })),
            image.formatIds,
            id => {
              const ids = image.formatIds.includes(id)
                ? image.formatIds.filter(i => i !== id)
                : [...image.formatIds, id];
              updateImage({
                formatIds: ids,
                channels: Array.from(
                  new Set(
                    CREATIVE_FORMATS.filter(f => ids.includes(f.id)).map(
                      f => f.channel
                    )
                  )
                ),
              });
            },
            true
          )}
        </>
      );
    return (
      <div className="cfg-review">
        <div className="cfg-note">
          <strong>
            {issues.length
              ? "A few choices need attention"
              : "Your configuration is ready"}
          </strong>
          <p>
            Review your selections and the current credit total. Generation
            creates an asset for review.
          </p>
        </div>
        <dl>
          {summary.map(s => (
            <div key={s.title}>
              <dt>{s.title}</dt>
              <dd>
                <button onClick={() => go(s.section, s.category)}>
                  {s.value}
                  <ChevronRight size={14} />
                </button>
              </dd>
            </div>
          ))}
        </dl>
        {issues.length > 0 && (
          <ul className="cfg-problems">
            {Array.from(new Set(issues)).map(i => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
        {quote.error && (
          <div className="cfg-problems">
            {quote.error.message}
            <button onClick={() => quote.refetch()}>Refresh credits</button>
          </div>
        )}
        <p className="cfg-help">
          The composition shown above is a creative direction preview, not an
          AI-generated result. Generation can vary; review the finished asset
          before use.
        </p>
      </div>
    );
  }
  const summary = [
    {
      title: "Creative",
      value: isImage ? "Image" : "Video",
      section: "type",
      category: "type",
    },
    {
      title: "Subject",
      value: isImage
        ? image.promotionMode === "platform"
          ? image.promotion?.title || "Business promotion"
          : image.products.length
            ? image.products.length + " catalog item(s)"
            : image.sourceAssetKeys?.length
              ? `${image.sourceAssetKeys.length} source images`
              : "Choose a subject"
        : video.imageKeys.length +
          " references" +
          (video.sourceVideoKey ? " + source clip" : ""),
      section: "type",
      category: "source",
    },
    {
      title: "Visual",
      value:
        theme.name +
        " · " +
        CREATIVE_ART_STYLES.find(s => s.id === direction.artStyle)?.name,
      section: "look",
      category: "theme",
    },
    {
      title: "People",
      value:
        scene === "people"
          ? ((isImage ? image.people?.length : video.people.length) ?? 0) +
            " selected"
          : "No people",
      section: "look",
      category: "scene",
    },
    {
      title: "AI Model",
      value: selectedModel?.name ?? model?.name ?? "Choose a model",
      section: "model",
      category: "model",
    },
    {
      title: "Output",
      value: isImage
        ? outputCount(image) +
          " image(s) · " +
          image.formatIds.length +
          " sizes"
        : String(video.modelOptions?.duration ?? video.duration) +
          "s · " +
          String(video.modelOptions?.resolution ?? video.resolution),
      section: "output",
      category: "format",
    },
  ];
  if (!canCreate)
    return (
      <div className="surface p-8">
        A creator role is required to use Creative Studio.
      </div>
    );
  if (options.error)
    return (
      <div className="surface p-8">
        Could not load your workspace choices.{" "}
        <button onClick={() => options.refetch()}>Try again</button>
      </div>
    );
  return (
    <div className="cfg-root cfg-creative" ref={studioRoot}>
      <div className="cfg-heading">
        <div>
          <Link href="/app/creatives" className="cfg-back">
            <ArrowLeft size={14} /> All creative apps
          </Link>
          <div className="cfg-title">
            <h1>
              Creative Studio<span>Made by you</span>
            </h1>
          </div>
          <p>
            A little direction. A lot of possibility. Build your next image or
            video.
          </p>
        </div>
        <div className="cfg-actions">
          <button
            disabled={busy}
            onClick={duplicateForComparison}
            aria-label={
              baseline ? "Replace saved comparison" : "Duplicate & compare"
            }
          >
            <Copy size={15} />
            <span className="cfg-action-label-wide">
              {baseline ? "Replace comparison" : "Duplicate & compare"}
            </span>
            <span className="cfg-action-label-compact" aria-hidden="true">
              {baseline ? "Replace" : "Compare"}
            </span>
          </button>
          {baseline && (
            <button disabled={busy} onClick={() => setCompareOpen("builds")}>
              Compare builds
            </button>
          )}
          <button onClick={() => setDraftsOpen(true)} aria-label="Saved drafts">
            <FolderOpen size={15} />
            <span className="cfg-action-label-wide">Saved drafts</span>
            <span className="cfg-action-label-compact" aria-hidden="true">
              Drafts
            </span>
          </button>
          <button disabled={busy} onClick={saveDraft}>
            <Save size={15} /> Save draft
          </button>
        </div>
      </div>
      <fieldset disabled={busy} className="cfg-workspace">
        <StudioPreview
          key={config.kind + ":" + (savedImage?.briefId ?? "new")}
          summary={
            <>
              <div className="cfg-build-top">
                <span className="cfg-eyebrow">YOUR CREATIVE, YOUR WAY</span>
                <span className="cfg-draft-status">
                  {storageOk
                    ? "Remembered in this browser"
                    : "Browser storage unavailable · save a draft"}
                </span>
              </div>
              <Field title="Creative name">
                <input
                  aria-label="Creative name"
                  value={isImage ? image.name : video.title}
                  maxLength={160}
                  onChange={e =>
                    isImage
                      ? updateImage({ name: e.target.value })
                      : updateVideo({ title: e.target.value })
                  }
                />
              </Field>
              <div className="cfg-summary">
                {summary.map(s => (
                  <button
                    key={s.title}
                    onClick={() => go(s.section, s.category)}
                  >
                    <span>{s.title}</span>
                    <strong>{s.value}</strong>
                    <ChevronRight size={13} />
                  </button>
                ))}
              </div>
              <div className="cfg-estimate">
                <span>
                  <small>Generation total</small>
                  <strong>{quoteLabel}</strong>
                  <small aria-live="polite">{creditDetail}</small>
                </span>
                <button
                  className="cfg-primary"
                  onClick={() => go("output", "review")}
                >
                  Review configuration <ArrowRight size={16} />
                </button>
              </div>
            </>
          }
          organizationId={organizationId!}
          role={membership?.role ?? ""}
          jobId={pendingImageJob}
          referenceUrl={preview}
          onSettled={() => {
            setPendingImageJob(null);
            void utils.assetLibrary.studioList.invalidate();
            void utils.models.credits.invalidate();
          }}
          kind={config.kind}
          briefId={savedImage?.briefId}
          assets={assets.data ?? []}
          videos={videos.data ?? []}
          reuse={trial => {
            setSavedImage(null);
            setSavedVideo(null);
            update({
              ...configRef.current,
              ...(trial.imageSetup
                ? {
                    kind: "image",
                    image: {
                      ...trial.imageSetup,
                      name:
                        trial.imageSetup.name.slice(0, 140) + " · new version",
                    },
                  }
                : {}),
              ...(trial.videoSetup
                ? {
                    kind: "video",
                    video: {
                      ...trial.videoSetup,
                      title:
                        trial.videoSetup.title.slice(0, 140) + " · new version",
                    },
                  }
                : {}),
            });
            toast.success(
              "Settings loaded into a new draft. Review them before generating."
            );
          }}
        >
          <div className="cfg-preview" style={{ background: theme.palette[0] }}>
            {preview ? (
              <img src={preview} alt="Selected source reference" />
            ) : (
              <ChoiceArt
                name={theme.name}
                type={scene === "people" ? "people" : config.kind}
                palette={theme.palette}
              />
            )}
            <span className="cfg-preview-label">
              {preview ? "Source reference" : "Visual inspiration"}
            </span>
            <div className="cfg-preview-caption">
              <span>
                {isImage ? "STILL / " : "MOTION / "}
                {theme.name}
              </span>
              <strong>
                {isImage
                  ? image.copy.headline || "Your story starts here."
                  : video.title}
              </strong>
            </div>
          </div>
        </StudioPreview>
        <StudioSections
          label="Studio sections"
          current={section}
          items={configuratorSections.map((s, i) => ({
            ...s,
            icon: sectionIcons[i],
          }))}
          onSelect={id => go(id)}
        >
          <div className="cfg-body">
            <StudioCategories
              items={categories.map(c => ({
                ...c,
                hint:
                  c.id === "people" && scene !== "people"
                    ? "Needs people scene"
                    : undefined,
              }))}
              current={category}
              onSelect={chooseCategory}
            />
            <div className="cfg-content-title">
              <div>
                <span className="cfg-eyebrow">{currentSection.title}</span>
                <h2>
                  {
                    currentSection.categories.find(c => c.id === category)
                      ?.title
                  }
                </h2>
              </div>
              {["model", "source", "mood", "format"].includes(category) && (
                <label className="cfg-search">
                  <Search size={16} />
                  <input
                    aria-label="Search choices"
                    placeholder="Find your next choice…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
              )}
            </div>
            {options.isLoading ? (
              <p className="cfg-empty">
                <Loader2 className="animate-spin" /> Loading your workspace…
              </p>
            ) : (
              content()
            )}
          </div>
        </StudioSections>
      </fieldset>
      {error && (
        <div role="alert" className="cfg-problems">
          {error}
        </div>
      )}
      {!pendingImageJob && (
        <div className="cfg-bottom">
          <div>
            <strong>{quoteLabel}</strong>
            <span>
              {busy ? "Working…" : creditDetail}
              {issues.length ? ` · ${issues.length} items to complete` : ""}
            </span>
          </div>
          <div className="cfg-actions">
            <button
              disabled={busy}
              onClick={() => {
                const i = configuratorSections.findIndex(s => s.id === section);
                go(
                  configuratorSections[(i + 1) % configuratorSections.length].id
                );
              }}
            >
              Next section <ChevronRight size={15} />
            </button>
            <button
              className="cfg-primary"
              disabled={!ready}
              onClick={() => setConfirm(true)}
            >
              {busy ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}{" "}
              Generate {isImage ? "images" : "video"}
            </button>
          </div>
        </div>
      )}
      {info && (
        <Dialog open onOpenChange={open => !open && setInfo(null)}>
          <DialogContent className="cfg-modal sm:max-w-xl">
            <DialogTitle>{info.title}</DialogTitle>
            <DialogDescription>{info.description}</DialogDescription>
            {info.image ? (
              <img
                className="max-h-56 w-full object-contain"
                src={info.image}
                alt={info.title}
              />
            ) : (
              <ChoiceArt
                name={info.title}
                type={info.art}
                palette={info.palette}
              />
            )}
            <div className="cfg-synopsis">
              {info.detail ?? info.description}
            </div>
            {info.reason && <p className="cfg-problems">{info.reason}</p>}
          </DialogContent>
        </Dialog>
      )}
      {compareOpen === "models" && comparisonModels.length >= 2 && (
        <ModelComparison
          choices={comparisonModels}
          references={referenceCount}
          hasVideo={!isImage && !!video.sourceVideoKey}
          selectedId={setup.modelId}
          onChoose={id => chooseModel(models.data!.find(m => m.id === id)!)}
          onClose={() => setCompareOpen(null)}
        />
      )}
      {compareOpen === "builds" && baseline && (
        <ConfigurationComparison
          baseline={baseline}
          current={config}
          credits={credits}
          baselineQuote={{
            credits: baselineQuote.data?.credits,
            pending: baselineQuote.isFetching,
            error: baselineQuote.error?.message,
          }}
          context={{
            products,
            assets: [
              ...(assets.data ?? []),
              ...(selectedCatalog.data?.items ?? []),
            ],
            references: options.data?.references ?? [],
            logos: options.data?.logos ?? [],
            models: models.data ?? [],
          }}
          onSwap={swapBuilds}
          onClose={() => setCompareOpen(null)}
        />
      )}
      <Dialog open={confirm} onOpenChange={open => !busy && setConfirm(open)}>
        <DialogContent className="cfg-modal">
          <DialogTitle>
            Generate this {isImage ? "image set" : "video"}?
          </DialogTitle>
          <DialogDescription>
            Your current configuration will use {credits ?? "the displayed"}{" "}
            credits. The result goes to your workspace for review.
          </DialogDescription>
          <p>
            {selectedModel?.name} ·{" "}
            {isImage ? outputCount(image) + " images" : "1 video"}
          </p>
          {credits === undefined && (
            <p>
              Configuration or pricing changed. Close this dialog and review the
              current credit total.
            </p>
          )}
          <button className="cfg-primary" disabled={!ready} onClick={generate}>
            {busy ? "Starting…" : "Confirm · " + credits + " credits"}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={draftsOpen} onOpenChange={setDraftsOpen}>
        <DialogContent className="cfg-modal sm:max-w-2xl">
          <DialogTitle>Saved workspace drafts</DialogTitle>
          <DialogDescription>
            Load a saved image or video configuration. Your other creative type
            is preserved.
          </DialogDescription>
          <div className="cfg-draft-list">
            {(options.data?.drafts ?? []).map(d => (
              <button
                key={d.id}
                onClick={() => {
                  const parsed = creativeSetupSchema.safeParse(d.setup);
                  if (!parsed.success)
                    return toast.error(
                      "This draft cannot be opened in Creative Studio."
                    );
                  update({ ...config, kind: "image", image: parsed.data });
                  setSavedImage({ briefId: d.id, updatedAtMs: d.updatedAtMs });
                  setDraftsOpen(false);
                  go("type");
                }}
              >
                <Image size={18} />
                <span>
                  {d.name}
                  <small>Image draft</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
            {(videos.data ?? [])
              .filter(d => d.status === "draft")
              .map(d => (
                <button
                  key={d.id}
                  onClick={() => {
                    const parsed = videoSetupSchema.safeParse(d.setup);
                    if (!parsed.success)
                      return toast.error(
                        "This draft cannot be opened in Creative Studio."
                      );
                    update({ ...config, kind: "video", video: parsed.data });
                    setSavedVideo({ id: d.id, revision: d.revision });
                    setDraftsOpen(false);
                    go("type");
                  }}
                >
                  <Clapperboard size={18} />
                  <span>
                    {d.setup.title}
                    <small>Video draft</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            {!options.data?.drafts.length &&
              !videos.data?.some(d => d.status === "draft") && (
                <p>
                  No saved drafts yet. Configure your creative and choose Save
                  draft.
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function ratioLabel(w: number, h: number) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  return w / g + ":" + h / g;
}
function ModelSynopsis({
  model,
  name,
  maker,
}: {
  model: ModelDefinition;
  name: string;
  maker: string;
}) {
  const properties = model.inputSchema.properties;
  return (
    <>
      <p>
        <strong>{name}</strong> by {maker}. {model.variant}. This overview
        describes the capabilities offered by the current integration.
      </p>
      <dl>
        <dt>Reference images</dt>
        <dd>Up to {referenceCapacity(model)}</dd>
        <dt>Required source material</dt>
        <dd>
          {requiresVideo(model)
            ? "Source video required"
            : (model.inputSchema.required ?? []).some(k =>
                  /image|frame/.test(k)
                )
              ? "Reference image required"
              : "Can start with a text prompt"}
        </dd>
        {["duration", "resolution", "quality", "aspect_ratio"].map(
          k =>
            properties[k] && (
              <div key={k}>
                <dt>{k.replaceAll("_", " ")}</dt>
                <dd>
                  {properties[k].enum?.join(" · ") ??
                    properties[k].description ??
                    "Model-controlled"}
                </dd>
              </div>
            )
        )}
        <dt>Audio control</dt>
        <dd>
          {properties.generate_audio || properties.sound
            ? "Available in model settings"
            : "No audio toggle exposed"}
        </dd>
      </dl>
      <p>
        Use Model settings for the exact controls. The final credit total
        reflects your settings and output count.
      </p>
    </>
  );
}
