import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Box,
  Brush,
  Camera,
  Check,
  Clapperboard,
  Film,
  Flame,
  Gem,
  ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Moon,
  Newspaper,
  PackageSearch,
  PartyPopper,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Square,
  Sparkles,
  Sun,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  CREATIVE_ART_STYLES,
  CREATIVE_CHANNELS,
  CREATIVE_FORMATS,
  CREATIVE_MOODS,
  DEFAULT_CREATIVE_BASE_PROMPT,
  applyCreativeTheme,
  creativeSetupSchema,
  defaultCreativeSetup,
  formatDetails,
  generationSetupIssues,
  getCreativeTheme,
  outputCount,
  type CreativeCopy,
  type CreativeSetup,
} from "@shared/creativeBuilder";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "./ui/button";
import { CreativeThemeLibrary } from "./CreativeThemeLibrary";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm";
const labelClass = "mb-2 block text-sm font-medium";
const sectionClass = "surface p-5 sm:p-6";
type Props = { onGenerated: () => void };

const visualDirectionIcons: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  zap: Zap,
  moon: Moon,
  square: Square,
  flame: Flame,
  sun: Sun,
  party: PartyPopper,
  gem: Gem,
  camera: Camera,
  clapperboard: Clapperboard,
  brush: Brush,
  box: Box,
  newspaper: Newspaper,
  film: Film,
  layers: Layers,
  scan: ScanLine,
};

function VisualDirectionOptions<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{
    id: T;
    name: string;
    icon: string;
    direction: string;
  }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map(option => {
          const Icon = visualDirectionIcons[option.icon] ?? Sparkles;
          const selected = option.id === value;
          return (
            <button
              type="button"
              key={option.id}
              aria-pressed={selected}
              title={option.direction}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5"
              }`}
              onClick={() => onChange(option.id)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {option.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CreativeBuilder({ onGenerated }: Props) {
  const { organizationId, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const options = trpc.creativeBuilder.options.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const [setup, setSetup] = useState<CreativeSetup>(defaultCreativeSetup);
  const [saved, setSaved] = useState<{
    briefId: number;
    updatedAtMs: number;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [undoCopy, setUndoCopy] = useState<CreativeCopy | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [darkLogoBackground, setDarkLogoBackground] = useState(true);
  const setupRef = useRef(setup);
  const initialized = useRef<number | null>(null);
  const canEdit = ["owner", "admin", "creator"].includes(
    membership?.role ?? ""
  );
  const save = trpc.creativeBuilder.save.useMutation();
  const refresh = trpc.creativeBuilder.refreshCopy.useMutation();
  const generate = trpc.creativeBuilder.generate.useMutation();
  const busy = save.isPending || generate.isPending;
  const catalog = options.data?.products ?? [];
  const logos = options.data?.logos ?? [];
  const selected = setup.products.map(selection => ({
    selection,
    product: catalog.find(product => product.id === selection.productId),
  }));
  const active =
    selected.find(item => item.selection.productId === focusedId) ??
    selected[0];
  const activeImage = active?.product?.images.find(
    image => image.id === active.selection.imageId
  );
  const logo = logos.find(asset => asset.id === setup.logoAssetId);
  const count = outputCount(setup);
  const issues = generationSetupIssues(setup);
  const structural = creativeSetupSchema.safeParse(setup);
  if (!structural.success) issues.push(structural.error.issues[0].message);
  if (
    selected.some(
      item =>
        !item.product ||
        (item.product.recordType !== "service" &&
          !item.product.images.some(
            image => image.id === item.selection.imageId
          ))
    )
  )
    issues.push("Review unavailable products or product images.");
  if (setup.logoAssetId !== null && !logo)
    issues.push("Choose an available, approved logo.");
  if (options.data?.brand?.status !== "active")
    issues.push("Activate your Brand Kit before generating.");
  const filtered = catalog.filter(product =>
    (product.name + " " + (product.sku ?? ""))
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function change(next: CreativeSetup) {
    setupRef.current = next;
    setSetup(next);
    setDirty(true);
  }
  function loadDraft(id: number) {
    const draft = options.data?.drafts.find(item => item.id === id);
    if (!draft?.setup) return;
    const parsed = creativeSetupSchema.safeParse(draft.setup);
    if (!parsed.success)
      return toast.error("This setup could not be loaded. Create a new setup.");
    setupRef.current = parsed.data;
    setSetup(parsed.data);
    setSaved({ briefId: draft.id, updatedAtMs: draft.updatedAtMs });
    setDirty(false);
    setUndoCopy(null);
    setFocusedId(parsed.data.products[0]?.productId ?? null);
  }
  useEffect(() => {
    if (
      !options.data ||
      !organizationId ||
      initialized.current === organizationId
    )
      return;
    initialized.current = organizationId;
    if (options.data.drafts[0]) loadDraft(options.data.drafts[0].id);
    else {
      const next = defaultCreativeSetup();
      setupRef.current = next;
      setSetup(next);
      setSaved(null);
      setDirty(false);
      setUndoCopy(null);
      setFocusedId(null);
    }
  }, [options.data, organizationId]);

  function toggleProduct(product: (typeof catalog)[number]) {
    if (setup.products.some(item => item.productId === product.id)) {
      change({
        ...setup,
        products: setup.products.filter(item => item.productId !== product.id),
      });
    } else {
      if (!product.images[0] && product.recordType !== "service") return;
      if (setup.products.length >= 12)
        return toast.error("Choose up to 12 products per setup.");
      if (setup.productMode === "together" && setup.products.length >= 3)
        return toast.error(
          "Combine up to three products, or switch to separate sets."
        );
      change({
        ...setup,
        products: [
          ...setup.products,
          {
            productId: product.id,
            imageId: product.images[0]?.id ?? null,
            featuredSpecKeys: [],
            includePrice: false,
          },
        ],
      });
      setFocusedId(product.id);
    }
  }
  function changeProduct(values: Partial<CreativeSetup["products"][number]>) {
    if (!active) return;
    change({
      ...setup,
      products: setup.products.map(product =>
        product.productId === active.selection.productId
          ? { ...product, ...values }
          : product
      ),
    });
  }
  async function saveSetup() {
    if (!organizationId) throw new Error("Workspace unavailable.");
    const parsed = creativeSetupSchema.safeParse(setupRef.current);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    const result = await save.mutateAsync({
      organizationId,
      setup: parsed.data,
      briefId: saved?.briefId,
      expectedUpdatedAtMs: saved?.updatedAtMs,
    });
    setSaved(result);
    setDirty(false);
    await utils.creativeBuilder.options.invalidate();
    return result;
  }
  async function generateSet() {
    try {
      const result = dirty || !saved ? await saveSetup() : saved;
      setReviewOpen(false);
      const completed = await generate.mutateAsync({
        organizationId: organizationId!,
        ...result,
        expectedUpdatedAtMs: result.updatedAtMs,
        requestId: crypto.randomUUID(),
      });
      await Promise.all([
        utils.creatives.overview.invalidate(),
        utils.activity.list.invalidate(),
      ]);
      toast.success(
        completed.status === "completed"
          ? "Your creatives are ready for review"
          : "Generation started. You can continue using the dashboard."
      );
      onGenerated();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Generation could not complete."
      );
      await utils.creatives.overview.invalidate();
    }
  }
  async function refreshCopy() {
    const before = setupRef.current;
    try {
      const copy = await refresh.mutateAsync({
        organizationId: organizationId!,
        setup: before,
      });
      if (setupRef.current !== before)
        return toast.info(
          "Your setup changed while AI was writing. Refresh again to use the latest direction."
        );
      setUndoCopy(before.copy);
      change({ ...before, copy });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Copy could not be refreshed."
      );
    }
  }

  if (options.isLoading)
    return (
      <div className="surface p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Loading your products and brand assets…
      </div>
    );
  if (options.error)
    return (
      <div className="surface p-8">
        <p>Products and brand assets could not be loaded.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => options.refetch()}
        >
          Try again
        </Button>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="saved-creative-setup">
            Saved setups
          </label>
          <select
            id="saved-creative-setup"
            className={selectClass + " sm:w-64"}
            value={saved?.briefId ?? ""}
            disabled={busy}
            onChange={event => {
              if (
                dirty &&
                !window.confirm(
                  "Load another setup and discard unsaved changes?"
                )
              )
                return;
              if (event.target.value) loadDraft(Number(event.target.value));
            }}
          >
            <option value="">New creative setup</option>
            {options.data?.drafts.map(draft => (
              <option key={draft.id} value={draft.id}>
                {draft.name}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            disabled={busy || !canEdit}
            onClick={() => {
              if (
                dirty &&
                !window.confirm(
                  "Start a new setup and discard unsaved changes?"
                )
              )
                return;
              const next = defaultCreativeSetup();
              setupRef.current = next;
              setSetup(next);
              setSaved(null);
              setDirty(false);
              setUndoCopy(null);
            }}
          >
            New setup
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {dirty
              ? "Unsaved changes"
              : saved
                ? "Setup saved"
                : "Ready to create"}
          </span>
        </div>
        <Button
          variant="outline"
          disabled={!canEdit || busy}
          onClick={() =>
            saveSetup()
              .then(() => toast.success("Setup saved"))
              .catch(error => toast.error(error.message))
          }
        >
          {save.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save setup
        </Button>
      </div>
      {!canEdit && (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          You can view setups. An owner, administrator, or creator can edit and
          generate.
        </p>
      )}
      <fieldset
        disabled={!canEdit || busy}
        className="grid min-w-0 gap-5 border-0 p-0 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.8fr)]"
      >
        <div className="min-w-0 space-y-5">
          <section className={sectionClass}>
            <label className={labelClass} htmlFor="creative-name">
              Creative name
            </label>
            <Input
              id="creative-name"
              value={setup.name}
              maxLength={180}
              onChange={event => change({ ...setup, name: event.target.value })}
            />
            <h2 className="mb-3 mt-6 text-base font-semibold">
              1. Choose a theme
            </h2>
            <CreativeThemeLibrary
              selectedTheme={setup.theme}
              onSelect={theme => {
                const next = applyCreativeTheme(setupRef.current, theme.id);
                if (next === setupRef.current) return;
                setUndoCopy(null);
                change(next);
              }}
            />
            <div className="mt-5 grid gap-4 rounded-2xl border border-border bg-muted/25 p-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <label
                      className="text-sm font-medium"
                      htmlFor="creative-base-prompt"
                    >
                      Main prompt
                    </label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Applied to every creative in this setup.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      change({
                        ...setup,
                        basePrompt: DEFAULT_CREATIVE_BASE_PROMPT,
                      })
                    }
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Reset
                  </Button>
                </div>
                <Textarea
                  id="creative-base-prompt"
                  value={setup.basePrompt}
                  maxLength={8000}
                  rows={6}
                  onChange={event =>
                    change({ ...setup, basePrompt: event.target.value })
                  }
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <label
                      className="text-sm font-medium"
                      htmlFor="creative-theme-prompt"
                    >
                      Theme prompt
                    </label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Starts from the selected theme and remains fully editable.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      change({
                        ...setup,
                        themePrompt: getCreativeTheme(setup.theme).direction,
                      })
                    }
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Reset
                  </Button>
                </div>
                <Textarea
                  id="creative-theme-prompt"
                  value={
                    setup.themePrompt ?? getCreativeTheme(setup.theme).direction
                  }
                  maxLength={4000}
                  rows={4}
                  onChange={event =>
                    change({ ...setup, themePrompt: event.target.value })
                  }
                />
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Prompt edits guide styling and composition only. Approved
                product facts, claims, logo rules, and publishing safeguards
                remain authoritative.
              </p>
            </div>
          </section>
          <section className={sectionClass}>
            <h2 className="mb-3 text-base font-semibold">
              2. Channels & sizes
            </h2>
            <div className="flex flex-wrap gap-2">
              {CREATIVE_CHANNELS.map(channel => (
                <label
                  key={channel.id}
                  className={
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm " +
                    (setup.channels.includes(channel.id)
                      ? "border-primary bg-primary/5"
                      : "border-border")
                  }
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={setup.channels.includes(channel.id)}
                    onChange={event => {
                      const formats = CREATIVE_FORMATS.filter(
                        format => format.channel === channel.id
                      );
                      change({
                        ...setup,
                        channels: event.target.checked
                          ? [...setup.channels, channel.id]
                          : setup.channels.filter(id => id !== channel.id),
                        formatIds: event.target.checked
                          ? [...setup.formatIds, formats[0].id]
                          : setup.formatIds.filter(
                              id => !formats.some(format => format.id === id)
                            ),
                      });
                    }}
                  />
                  {channel.name}
                </label>
              ))}
            </div>
            {CREATIVE_CHANNELS.filter(channel =>
              setup.channels.includes(channel.id)
            ).map(channel => (
              <div key={channel.id} className="mt-5">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {channel.name}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CREATIVE_FORMATS.filter(
                    format => format.channel === channel.id
                  ).map(format => (
                    <label
                      key={format.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={setup.formatIds.includes(format.id)}
                        onChange={event =>
                          change({
                            ...setup,
                            formatIds: event.target.checked
                              ? [...setup.formatIds, format.id]
                              : setup.formatIds.filter(id => id !== format.id),
                          })
                        }
                      />
                      <span className="min-w-0 flex-1">
                        {format.name}
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {format.width} × {format.height}
                        </span>
                      </span>
                      <span className="grid h-8 w-9 shrink-0 place-items-center">
                        <span
                          className="block border border-primary/60 bg-primary/5"
                          style={{
                            width: Math.min(
                              30,
                              (26 * format.width) / format.height
                            ),
                            height: Math.min(
                              26,
                              (30 * format.height) / format.width
                            ),
                          }}
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <p className="mt-4 text-xs text-muted-foreground">
              Create for any supported channel. Connect an account when you're
              ready to publish.
            </p>
          </section>
          <section className={sectionClass}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">3. Featured products</h2>
              <span className="text-xs text-muted-foreground">
                {setup.products.length} selected
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label="Search products or SKU"
                placeholder="Search products or SKU…"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </div>
            <div className="mt-3 grid max-h-72 gap-1 overflow-y-auto overscroll-contain rounded-xl border border-border p-1 sm:grid-cols-2">
              {filtered.map(product => (
                <label
                  key={product.id}
                  className={
                    "flex min-w-0 cursor-pointer items-center gap-3 rounded-lg p-2.5 " +
                    (setup.products.some(item => item.productId === product.id)
                      ? "bg-primary/5"
                      : "hover:bg-muted/50")
                  }
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={setup.products.some(
                      item => item.productId === product.id
                    )}
                    disabled={
                      !product.images.length && product.recordType !== "service"
                    }
                    onChange={() => toggleProduct(product)}
                  />
                  <span className="grid h-14 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-white">
                    {product.images[0] ? (
                      <img
                        src={product.images[0].url}
                        alt=""
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-slate-400" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium">
                      {product.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {product.images.length
                        ? product.sku || "No SKU"
                        : product.recordType === "service"
                          ? "Service · image optional"
                          : "Needs a catalog image"}
                    </span>
                  </span>
                </label>
              ))}
              {!filtered.length && (
                <p className="p-4 text-sm text-muted-foreground sm:col-span-2">
                  {catalog.length ? (
                    "No matching products."
                  ) : (
                    <>
                      Approve products in your{" "}
                      <Link
                        href="/app/catalog"
                        className="text-primary underline"
                      >
                        catalog
                      </Link>{" "}
                      to use them here.
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selected.map(({ selection, product }) => (
                <button
                  type="button"
                  key={selection.productId}
                  className="flex max-w-full items-center gap-2 rounded-lg bg-muted px-2.5 py-2 text-xs"
                  aria-label={
                    "Remove " + (product?.name ?? "unavailable product")
                  }
                  onClick={() =>
                    change({
                      ...setup,
                      products: setup.products.filter(
                        item => item.productId !== selection.productId
                      ),
                    })
                  }
                >
                  {product?.images.find(
                    image => image.id === selection.imageId
                  ) && (
                    <img
                      src={
                        product.images.find(
                          image => image.id === selection.imageId
                        )!.url
                      }
                      alt=""
                      className="h-6 w-6 rounded bg-white object-contain"
                    />
                  )}
                  <span className="truncate">
                    {product?.name ?? "Unavailable product"}
                  </span>
                  <X className="h-3 w-3 shrink-0" />
                </button>
              ))}
            </div>
            {setup.products.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {(["separate", "together"] as const).map(mode => (
                  <label key={mode} className="flex items-center gap-2 text-sm">
                    <input
                      name="product-mode"
                      type="radio"
                      className="accent-primary"
                      checked={setup.productMode === mode}
                      onChange={() => change({ ...setup, productMode: mode })}
                    />
                    {mode === "separate"
                      ? "Separate set per product"
                      : "Products together"}
                  </label>
                ))}
              </div>
            )}
          </section>
          <section className={sectionClass}>
            <h2 className="mb-4 text-base font-semibold">
              4. Creative direction
            </h2>
            <div className="grid gap-5">
              <VisualDirectionOptions
                label="Mood"
                value={setup.mood}
                options={CREATIVE_MOODS}
                onChange={mood => change({ ...setupRef.current, mood })}
              />
              <VisualDirectionOptions
                label="Art style"
                value={setup.artStyle}
                options={CREATIVE_ART_STYLES}
                onChange={artStyle => change({ ...setupRef.current, artStyle })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={`${labelClass} mt-5`}>Product setting</span>
                <select
                  className={selectClass}
                  value={setup.shot}
                  onChange={event =>
                    change({
                      ...setupRef.current,
                      shot: event.target.value as CreativeSetup["shot"],
                    })
                  }
                >
                  <option value="product">Product only</option>
                  <option value="female">Lifestyle · female</option>
                  <option value="male">Lifestyle · male</option>
                  <option value="lifestyle">Lifestyle · no person</option>
                </select>
              </label>
              <label>
                <span className={`${labelClass} mt-5`}>Product placement</span>
                <select
                  className={selectClass}
                  value={setup.placement}
                  onChange={event =>
                    change({
                      ...setupRef.current,
                      placement: event.target
                        .value as CreativeSetup["placement"],
                    })
                  }
                >
                  <option value="auto">Let AI arrange it</option>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </div>
            <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                Logo from brand assets
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setDarkLogoBackground(!darkLogoBackground)}
              >
                {darkLogoBackground ? "Preview on light" : "Preview on dark"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                aria-pressed={setup.logoAssetId === null}
                className={
                  "rounded-xl border p-3 text-sm " +
                  (setup.logoAssetId === null
                    ? "border-primary bg-primary/5"
                    : "border-border")
                }
                onClick={() => change({ ...setup, logoAssetId: null })}
              >
                <span className="mb-2 grid h-16 place-items-center text-muted-foreground">
                  None
                </span>
                No logo
              </button>
              {logos.map(asset => (
                <button
                  type="button"
                  key={asset.id}
                  aria-pressed={setup.logoAssetId === asset.id}
                  className={
                    "min-w-0 rounded-xl border p-3 text-left text-sm " +
                    (setup.logoAssetId === asset.id
                      ? "border-primary bg-primary/5"
                      : "border-border")
                  }
                  onClick={() => change({ ...setup, logoAssetId: asset.id })}
                >
                  <span
                    className="mb-2 grid h-16 place-items-center rounded-lg p-2"
                    style={{
                      background: darkLogoBackground ? "#29252f" : "#f4f4f5",
                    }}
                  >
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </span>
                  <span className="block truncate">{asset.name}</span>
                </button>
              ))}
            </div>
            {!logos.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                Approved logos from your Brand Kit will appear here.
              </p>
            )}
            <label className="mt-5 block">
              <span className={labelClass}>
                Extra direction{" "}
                <span className="font-normal text-muted-foreground">
                  · optional
                </span>
              </span>
              <Textarea
                value={setup.extraDirection}
                maxLength={4000}
                onChange={event =>
                  change({ ...setup, extraDirection: event.target.value })
                }
                placeholder="A relaxed room at night. Product on the right, space for the headline on the left."
                className="min-h-24"
              />
            </label>
          </section>
          <section className={sectionClass + " bg-primary/[.025]"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">5. Copy</h2>
              <div className="flex gap-2">
                {undoCopy && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      change({ ...setup, copy: undoCopy });
                      setUndoCopy(null);
                    }}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Undo
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={refresh.isPending}
                  onClick={refreshCopy}
                >
                  {refresh.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Refresh copy
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Copy updates when you choose a different theme. Edit it or refresh
              for another direction.
              {setup.products.length > 1 && setup.productMode === "separate"
                ? " Copy is shared across product sets."
                : ""}
            </p>
            <div className="mt-4 grid gap-4">
              {(["headline", "subheadline", "cta"] as const).map(key => (
                <label key={key}>
                  <span className={labelClass}>
                    {key === "cta"
                      ? "Call to action"
                      : key === "headline"
                        ? "Headline"
                        : "Subheadline"}
                  </span>
                  <Input
                    value={setup.copy[key]}
                    maxLength={
                      key === "headline" ? 180 : key === "cta" ? 60 : 400
                    }
                    onChange={event => {
                      change({
                        ...setup,
                        copy: { ...setup.copy, [key]: event.target.value },
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          </section>
        </div>
        <aside className="min-w-0 space-y-5">
          <section className={sectionClass + " xl:sticky xl:top-6"}>
            <h2 className="mb-4 text-base font-semibold">
              Product images & specifications
            </h2>
            {active?.product ? (
              <>
                {selected.length > 1 && (
                  <label className="mb-4 block">
                    <span className="sr-only">Product to inspect</span>
                    <select
                      className={selectClass}
                      value={active.selection.productId}
                      onChange={event =>
                        setFocusedId(Number(event.target.value))
                      }
                    >
                      {selected.map(item => (
                        <option
                          key={item.selection.productId}
                          value={item.selection.productId}
                        >
                          {item.product?.name ?? "Unavailable product"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="group relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-white p-4">
                  {activeImage ? (
                    <>
                      <img
                        src={activeImage.url}
                        alt={activeImage.altText || active.product.name}
                        className="h-full min-h-0 w-full object-contain"
                      />
                      <button
                        type="button"
                        aria-label={"Enlarge " + active.product.name}
                        className="absolute bottom-2 right-2 rounded-lg border border-slate-200 bg-white p-2 text-slate-700"
                        onClick={() =>
                          setPreview({
                            url: activeImage.url,
                            name: active.product!.name,
                          })
                        }
                      >
                        <Maximize2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Choose another catalog image.
                    </p>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {active.product.images.map(image => (
                    <button
                      type="button"
                      key={image.id}
                      aria-pressed={active.selection.imageId === image.id}
                      aria-label={
                        "Use image " + image.id + " for " + active.product!.name
                      }
                      className={
                        "relative aspect-square overflow-hidden rounded-lg border bg-white p-1 " +
                        (active.selection.imageId === image.id
                          ? "border-primary ring-1 ring-primary"
                          : "border-border")
                      }
                      onClick={() => changeProduct({ imageId: image.id })}
                    >
                      <img
                        src={image.url}
                        alt={image.altText || active.product!.name}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                      {active.selection.imageId === image.id && (
                        <Check className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  <p className="font-medium">{active.product.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {active.product.sku || "No SKU"} · Approved catalog product
                  </p>
                </div>
                <h3 className="mb-2 mt-6 text-sm font-medium">
                  Specifications to feature
                </h3>
                <div className="divide-y divide-border">
                  {Object.entries(active.product.specifications)
                    .filter(([, value]) => value?.trim())
                    .map(([key, value]) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-start gap-3 py-3"
                      >
                        <input
                          type="checkbox"
                          className="mt-1 accent-primary"
                          checked={active.selection.featuredSpecKeys.includes(
                            key
                          )}
                          onChange={event =>
                            changeProduct({
                              featuredSpecKeys: event.target.checked
                                ? [...active.selection.featuredSpecKeys, key]
                                : active.selection.featuredSpecKeys.filter(
                                    item => item !== key
                                  ),
                            })
                          }
                        />
                        <span className="min-w-0 break-words">
                          <span className="block text-xs text-muted-foreground">
                            {key}
                          </span>
                          <span className="mt-0.5 block text-sm">{value}</span>
                        </span>
                      </label>
                    ))}
                </div>
                {!Object.keys(active.product.specifications).length && (
                  <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                    No specifications saved. Add and review them in the product
                    catalog.
                  </p>
                )}
                {active.product.price && active.product.currency && (
                  <label className="mt-3 flex items-center gap-3 rounded-lg bg-muted/60 p-3 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={active.selection.includePrice}
                      onChange={event =>
                        changeProduct({ includePrice: event.target.checked })
                      }
                    />
                    <span>
                      Show price{" "}
                      <span className="block text-xs text-muted-foreground">
                        {active.product.currency} {active.product.price}
                      </span>
                    </span>
                  </label>
                )}
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Checked specs appear in the creative. All catalog facts guide
                  AI. Edit incorrect facts in the catalog before generating.
                </p>
              </>
            ) : (
              <div className="py-12 text-center">
                <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Select a product to preview its images and choose
                  specifications.
                </p>
              </div>
            )}
          </section>
        </aside>
      </fieldset>
      <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-medium">
            {count} {count === 1 ? "image" : "images"} · one creative direction
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {setup.formatIds.length} sizes
            {setup.productMode === "separate"
              ? " × " + setup.products.length + " products"
              : " · products together"}
          </p>
          {issues.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">{issues[0]}</p>
          )}
        </div>
        <Button
          className="h-11 rounded-full px-6"
          disabled={!canEdit || busy || !!issues.length || refresh.isPending}
          onClick={() => setReviewOpen(true)}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Review & generate
        </Button>
      </div>
      {generate.isPending && (
        <div role="status" className="rounded-xl bg-primary/5 p-5 text-sm">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          Creating the master composition and adapting your selected sizes. This
          can take several minutes. Every result will need review.
        </div>
      )}
      <Dialog open={!!preview} onOpenChange={open => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>Selected catalog asset</DialogDescription>
          </DialogHeader>
          {preview && (
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[70vh] w-full rounded-xl bg-white object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-editorial text-3xl font-normal">
              Review your creative setup
            </DialogTitle>
            <DialogDescription>
              {count} images using{" "}
              {getCreativeTheme(setup.theme).name.toLowerCase()} direction. All
              results start pending review.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {selected.map(({ selection, product }) => (
              <div
                key={selection.productId}
                className="flex gap-3 rounded-xl border border-border p-3"
              >
                <img
                  src={
                    product?.images.find(
                      image => image.id === selection.imageId
                    )?.url
                  }
                  alt={product?.name ?? ""}
                  className="h-20 w-20 shrink-0 rounded-lg bg-white object-contain"
                />
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{product?.name}</p>
                  <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                    {selection.featuredSpecKeys
                      .map(key => key + ": " + product?.specifications[key])
                      .join(" · ") || "No visible specs"}
                    {selection.includePrice
                      ? " · " + product?.currency + " " + product?.price
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {logo && (
            <div className="flex items-center gap-3 text-sm">
              <img
                src={logo.url}
                alt={logo.name}
                className="h-12 w-16 rounded-lg bg-zinc-800 p-2 object-contain"
              />
              {logo.name}
            </div>
          )}
          <div className="rounded-xl bg-muted/60 p-4">
            <p className="font-medium">{setup.copy.headline}</p>
            <p className="mt-2 text-sm">{setup.copy.subheadline}</p>
            <p className="mt-2 text-sm font-medium">{setup.copy.cta}</p>
          </div>
          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Prompt layers used for generation
            </summary>
            <div className="mt-4 space-y-4 text-xs leading-5 text-muted-foreground">
              <div>
                <p className="font-semibold text-foreground">Main prompt</p>
                <p className="mt-1 whitespace-pre-wrap">{setup.basePrompt}</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Theme prompt</p>
                <p className="mt-1 whitespace-pre-wrap">
                  {setup.themePrompt || getCreativeTheme(setup.theme).direction}
                </p>
              </div>
            </div>
          </details>
          <p className="text-xs leading-5 text-muted-foreground">
            {setup.formatIds
              .map(id => {
                const format = formatDetails(id)!;
                return format.name + " " + format.width + "×" + format.height;
              })
              .join(" · ")}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            Review text, specifications, product likeness, and logo placement on
            every size before approval. Compact sizes may need shorter copy or
            fewer spec callouts.
          </p>
          <Button disabled={busy || !!issues.length} onClick={generateSet}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate with AI
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
