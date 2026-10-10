import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { generationModel, generationModels } from "@shared/modelCatalog";
import {
  actionPriceBreakdown,
  defaultCreditPolicy,
  retailCredits,
} from "@shared/aiCredits";
import type { ProviderRate } from "@shared/platformAdmin";
import {
  defaultImageActionAssumptions,
  imageActionAssumptionsSchema,
  type ImageActionAssumptions,
} from "@shared/imageActionEstimate";
import {
  defaultVideoActionAssumptions,
  videoActionAssumptionsSchema,
  type VideoActionAssumptions,
} from "@shared/videoActionEstimate";
const videoChoices = (key: string) =>
  Array.from(
    new Set(
      generationModels
        .filter(m => m.kind === "video")
        .flatMap(m => m.inputSchema.properties[key]?.enum ?? [])
        .map(String)
    )
  )
    .filter(v => v !== "default")
    .sort();
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(n);
const creditNumber = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);
function ImageTokenRates({
  rate,
  multiplier = 1,
}: {
  rate?: ProviderRate;
  multiplier?: number;
}) {
  return (
    <div className="min-w-[150px] space-y-1">
      <p className="text-xs font-medium">Per 1M tokens</p>
      <dl className="space-y-1 text-xs">
        {(
          [
            ["Text input", rate?.inputPerMillion],
            ["Image input", rate?.imageInputPerMillion],
            ["Image output", rate?.imageOutputPerMillion],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">
              {value == null ? "Not verified" : money(value * multiplier)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
export function ModelPricingAdmin() {
  const [imageEstimate, setImageEstimate] = useState(
    defaultImageActionAssumptions
  );
  const [estimateForm, setEstimateForm] = useState(
    defaultImageActionAssumptions
  );
  const [videoEstimate, setVideoEstimate] = useState(
    defaultVideoActionAssumptions
  );
  const [videoForm, setVideoForm] = useState(defaultVideoActionAssumptions);
  const catalog = trpc.models.adminCatalog.useQuery({
      imageEstimate,
      videoEstimate,
    }),
    utils = trpc.useUtils();
  const [search, setSearch] = useState(""),
    [kind, setKind] = useState("image"),
    [provider, setProvider] = useState("all"),
    [edit, setEdit] = useState<string | null>(null);
  const [policy, setPolicy] = useState<{
    markupPercent: number;
    creditValueMicros: number;
  } | null>(null);
  const [form, setForm] = useState({
    routeId: "",
    markup: "",
    estimate: "",
    request: "",
    second: "",
    discount: "",
    discountEvidence: "",
    discountUntil: "",
  });
  const refresh = () => {
    void utils.models.invalidate();
    void utils.platformAdmin.config.invalidate();
  };
  const savePolicy = trpc.models.savePolicy.useMutation({
    onSuccess: () => {
      toast.success(
        "Pricing defaults saved. Existing usage keeps its original rate."
      );
      setPolicy(null);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const saveModel = trpc.models.saveModel.useMutation({
    onSuccess: () => {
      toast.success("Model settings saved");
      setEdit(null);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const setEnabled = trpc.models.setEnabled.useMutation({
    onSuccess: async data => {
      toast.success(
        data.enabled
          ? "Model offered to customers"
          : "Model hidden from customers"
      );
      await utils.models.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const sync = trpc.models.syncAvailability.useMutation({
    onSuccess: data => {
      toast.success(`${data.available.length} OpenAI image models available`);
      refresh();
    },
    onError: e => toast.error(e.message),
  });
  const currentPolicy = policy ?? catalog.data?.policy ?? defaultCreditPolicy;
  function open(id: string) {
    const m = catalog.data!.models.find(x => x.id === id)!,
      definition = generationModel(m.routeId)!;
    const rate = catalog.data!.rates.find(
      r =>
        r.provider === definition.provider &&
        r.model === definition.providerModel
    )?.config;
    setForm({
      routeId: m.routeId,
      markup: rate?.markupPercent == null ? "" : String(rate.markupPercent),
      estimate:
        rate?.estimatedCostMicros == null
          ? ""
          : String(rate.estimatedCostMicros / 1e6),
      request: rate?.perRequestUsd == null ? "" : String(rate.perRequestUsd),
      second: rate?.perSecondUsd == null ? "" : String(rate.perSecondUsd),
      discount:
        rate?.providerDiscountPercent == null
          ? ""
          : String(rate.providerDiscountPercent),
      discountEvidence: rate?.providerDiscountEvidence ?? "",
      discountUntil: rate?.providerDiscountValidUntil
        ? new Date(rate.providerDiscountValidUntil).toISOString().slice(0, 10)
        : "",
    });
    setEdit(id);
  }
  const edited = generationModel(edit ?? "");
  const routes = edited
    ? edited.id.includes("sunburst") || edited.id.includes("flare")
      ? generationModels.filter(m =>
          m.providerModel.endsWith(
            edited.id.includes("sunburst") ? "sunburst" : "flare"
          )
        )
      : [edited]
    : [];
  const visibleModels =
    catalog.data?.models.filter(
      m =>
        m.kind === kind &&
        (provider === "all" ||
          generationModel(m.routeId)?.provider === provider) &&
        `${m.name} ${m.maker} ${generationModel(m.routeId)?.provider} ${m.variant}`
          .toLowerCase()
          .includes(search.toLowerCase())
    ) ?? [];
  return (
    <div className="space-y-6">
      <section className="surface p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Models & credit pricing</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Manage provider routes, wholesale cost estimates, and retail
              markup. Packages allocate credits; these rates determine how many
              each action uses.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? "Checking…" : "Sync OpenAI availability & rates"}
          </Button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm">
            <span>Default markup (%)</span>
            <Input
              type="number"
              min={0}
              max={1000}
              value={currentPolicy.markupPercent}
              onChange={e =>
                setPolicy({
                  ...currentPolicy,
                  markupPercent: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Retail value of one credit (USD)</span>
            <Input
              type="number"
              min={0.0001}
              max={1}
              step={0.0001}
              value={currentPolicy.creditValueMicros / 1e6}
              onChange={e =>
                setPolicy({
                  ...currentPolicy,
                  creditValueMicros: Math.round(Number(e.target.value) * 1e6),
                })
              }
            />
          </label>
          <div className="rounded-xl bg-violet-500/10 p-3 text-sm">
            <p>Example: $0.20 provider cost</p>
            <strong>
              {money(0.2 * (1 + currentPolicy.markupPercent / 100))} retail ·{" "}
              {currentPolicy.creditValueMicros > 0
                ? retailCredits(200000, currentPolicy)
                : "—"}{" "}
              credits
            </strong>
          </div>
        </div>
        <Button
          className="mt-4"
          disabled={
            !policy ||
            currentPolicy.creditValueMicros < 100 ||
            savePolicy.isPending
          }
          onClick={() => savePolicy.mutate(currentPolicy)}
        >
          Save pricing defaults
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          100% markup doubles cost (50% gross margin before other expenses).
          Individual models can override the default. Credit rounding occurs
          once per action.
        </p>
      </section>
      <section className="surface p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <h3 className="font-semibold">Package allowances & AI writing</h3>
          <a className="text-sm text-primary underline" href="/admin/tiers">
            Manage package credits
          </a>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Assign a package or grant extra credits in Accounts. Existing
          unassigned workspaces keep their current access.
        </p>
        <div className="mt-3 space-y-2">
          {catalog.data?.rates
            .filter(r => r.kind === "text")
            .map(r => (
              <div key={r.id} className="rounded-xl border p-3 text-sm">
                <strong>{r.model}</strong> · {r.provider}
                <p className="mt-1 text-xs text-muted-foreground">
                  Provider:{" "}
                  {r.config.inputPerMillion == null
                    ? "Unpriced"
                    : money(r.config.inputPerMillion)}{" "}
                  input /{" "}
                  {r.config.outputPerMillion == null
                    ? "Unpriced"
                    : money(r.config.outputPerMillion)}{" "}
                  output per million tokens. Retail uses{" "}
                  {r.config.markupPercent ?? currentPolicy.markupPercent}%
                  markup.
                </p>
              </div>
            ))}
        </div>
        <a
          href="/admin/pricing"
          className="mt-3 inline-block text-xs text-primary underline"
        >
          Manage token rates and request estimates
        </a>
      </section>
      <div className="flex flex-wrap gap-3">
        <Input
          className="min-w-[200px] flex-1"
          aria-label="Search models"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search models, makers, or providers…"
        />
        <select
          aria-label="Model type"
          className="h-10 rounded-xl border bg-background px-3"
          value={kind}
          onChange={e => setKind(e.target.value)}
        >
          <option value="image">Images</option>
          <option value="video">Videos</option>
        </select>
        <select
          aria-label="Provider"
          className="h-10 rounded-xl border bg-background px-3"
          value={provider}
          onChange={e => setProvider(e.target.value)}
        >
          <option value="all">All providers</option>
          <option value="openai">OpenAI</option>
          <option value="higgsfield">Higgsfield</option>
        </select>
      </div>
      <p className="text-sm text-muted-foreground">
        Offer this model: turn it on to include it in apps and workflows. Turn
        it off to hide it from customer choices and block new generation
        requests. Changes save immediately.
      </p>
      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">
          Per-action pricing · 1 credit ={" "}
          {money(currentPolicy.creditValueMicros / 1e6)}
        </p>
        <p>
          Each row shows the estimated provider cost and retail price for one
          image or one complete video at the settings listed. Cost credits are
          the dollar equivalent before markup. Retail credits round up once per
          action; their dollar equivalent is shown when rounding changes the
          price.
        </p>
        {kind === "image" ? (
          <p>
            OpenAI comparisons use each model’s token rates and output estimate
            for the image settings below. Final cost uses actual reported
            tokens. Other image providers use their model defaults and published
            action rates.
          </p>
        ) : (
          <p>
            Video estimates use duration and supported model settings. Models
            that do not support your choices are marked unavailable for this
            comparison.
          </p>
        )}
        {kind === "image" ? (
          <details className="rounded-lg border bg-background p-3">
            <summary className="cursor-pointer text-foreground">
              <span className="font-medium">Image estimate settings</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {imageEstimate.size.replace("x", " × ")} ·{" "}
                {imageEstimate.quality} ·{" "}
                {creditNumber(imageEstimate.textInputTokens)} text +{" "}
                {creditNumber(imageEstimate.imageInputTokens)} image input
                tokens
              </span>
            </summary>
            <form
              className="mt-4 space-y-3"
              onSubmit={e => {
                e.preventDefault();
                const parsed =
                  imageActionAssumptionsSchema.safeParse(estimateForm);
                if (parsed.success) setImageEstimate(parsed.data);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1 text-xs">
                  <span>Image quality</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-2"
                    value={estimateForm.quality}
                    onChange={e =>
                      setEstimateForm({
                        ...estimateForm,
                        quality: e.target
                          .value as ImageActionAssumptions["quality"],
                      })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="xhigh">Extra high · Image 2.5</option>
                    <option value="max">Maximum · Image 2.5</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span>Image dimensions</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-2"
                    value={estimateForm.size}
                    onChange={e =>
                      setEstimateForm({
                        ...estimateForm,
                        size: e.target.value as ImageActionAssumptions["size"],
                      })
                    }
                  >
                    <option value="1024x1024">Square · 1024 × 1024</option>
                    <option value="1024x1536">Portrait · 1024 × 1536</option>
                    <option value="1536x1024">Landscape · 1536 × 1024</option>
                    <option value="1536x1536">
                      Large square · 1536 × 1536
                    </option>
                    <option value="1232x1536">
                      Feed 4:5 canvas · 1232 × 1536
                    </option>
                    <option value="864x1536">
                      Vertical 9:16 canvas · 864 × 1536
                    </option>
                    <option value="1536x864">
                      Wide 16:9 canvas · 1536 × 864
                    </option>
                  </select>
                </label>
                {(
                  [
                    ["textInputTokens", "Text input tokens"],
                    ["imageInputTokens", "Reference image input tokens"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="space-y-1 text-xs">
                    <span>{label}</span>
                    <Input
                      type="number"
                      min={0}
                      max={1000000}
                      step={1}
                      value={estimateForm[field]}
                      onChange={e =>
                        setEstimateForm({
                          ...estimateForm,
                          [field]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs">
                Input counts are comparison assumptions, not measured usage. The
                default is a 1,000-token prompt with no reference image. These
                settings affect only this admin comparison; provider rates,
                customer reservations, and completed usage are unchanged.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !imageActionAssumptionsSchema.safeParse(estimateForm)
                    .success || catalog.isFetching
                }
              >
                {catalog.isFetching
                  ? "Calculating…"
                  : "Apply estimate settings"}
              </Button>
            </form>
          </details>
        ) : (
          <details className="rounded-lg border bg-background p-3" open>
            <summary className="cursor-pointer text-foreground">
              <span className="font-medium">Video estimate settings</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {videoEstimate.duration === "default"
                  ? "Model duration"
                  : `${videoEstimate.duration}s`}{" "}
                ·{" "}
                {videoEstimate.resolution === "default"
                  ? "Model resolution"
                  : videoEstimate.resolution}
              </span>
            </summary>
            <form
              className="mt-4 space-y-3"
              onSubmit={e => {
                e.preventDefault();
                const parsed =
                  videoActionAssumptionsSchema.safeParse(videoForm);
                if (parsed.success) setVideoEstimate(parsed.data);
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <label className="space-y-1 text-xs">
                  <span>Video duration</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-2"
                    value={videoForm.duration}
                    onChange={e =>
                      setVideoForm({
                        ...videoForm,
                        duration:
                          e.target.value === "default"
                            ? "default"
                            : Number(e.target.value),
                      })
                    }
                  >
                    <option value="default">Model default</option>
                    {[3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 30, 60].map(n => (
                      <option key={n} value={n}>
                        {n} seconds
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ["resolution", "resolution", "Video resolution"],
                    ["aspectRatio", "aspect_ratio", "Aspect ratio"],
                  ] as const
                ).map(([field, key, label]) => (
                  <label key={field} className="space-y-1 text-xs">
                    <span>{label}</span>
                    <select
                      className="h-10 w-full rounded-lg border bg-background px-2"
                      value={videoForm[field]}
                      onChange={e =>
                        setVideoForm({ ...videoForm, [field]: e.target.value })
                      }
                    >
                      <option value="default">Model default</option>
                      {videoChoices(key).map(value => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="space-y-1 text-xs">
                  <span>Audio</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-2"
                    value={videoForm.sound}
                    onChange={e =>
                      setVideoForm({
                        ...videoForm,
                        sound: e.target
                          .value as VideoActionAssumptions["sound"],
                      })
                    }
                  >
                    <option value="default">Model default</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs">
                  <span>Source clip (seconds)</span>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={videoForm.sourceSeconds}
                    onChange={e =>
                      setVideoForm({
                        ...videoForm,
                        sourceSeconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <p className="text-xs">
                Source length applies to models that edit, extend, or use a
                reference video (assumed 1280 × 720). Model default uses each
                model’s supported preset. These controls change this comparison
                only.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !videoActionAssumptionsSchema.safeParse(videoForm).success ||
                  catalog.isFetching
                }
              >
                {catalog.isFetching ? "Calculating…" : "Apply video settings"}
              </Button>
            </form>
          </details>
        )}
        {policy && (
          <p className="font-medium text-primary">
            Previewing unsaved pricing defaults. Save above to apply them.
          </p>
        )}
      </div>
      <section className="surface overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {[
                "Model",
                "Provider",
                "Offer",
                "Cost / action (USD)",
                "Cost in credits",
                "Retail / action (USD)",
                "Retail credits",
                "Markup",
                "Availability",
                "",
              ].map((v, i) => (
                <th key={i} className="p-3 font-medium">
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleModels.map(m => {
              const definition = generationModel(m.routeId)!,
                rate = catalog.data!.rates.find(
                  r =>
                    r.provider === definition.provider &&
                    r.model === definition.providerModel
                )?.config;
              const tokenPricing =
                definition.provider === "openai" &&
                definition.kind === "image" &&
                rate?.perRequestUsd == null;
              const markup = rate?.markupPercent ?? currentPolicy.markupPercent;
              const estimate = m.actionEstimate;
              const prices =
                estimate?.costMicros != null &&
                currentPolicy.creditValueMicros > 0
                  ? actionPriceBreakdown(estimate.costMicros, {
                      ...currentPolicy,
                      markupPercent: markup,
                    })
                  : null;
              return (
                <tr key={m.id} className="border-b align-top last:border-0">
                  <td className="p-3 min-w-[230px] max-w-[320px]">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.maker} · {m.variant} · {m.kind}
                    </p>
                    <p className="mt-2 text-xs font-medium">
                      {estimate?.basis ?? "Estimate unavailable"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {estimate?.settings ?? m.estimateProblem}
                    </p>
                    {tokenPricing && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-primary">
                          Calculation & token rates
                        </summary>
                        <div className="mt-2 space-y-2">
                          {estimate?.calculation && (
                            <div className="space-y-2 border-b pb-2">
                              <dl className="space-y-1">
                                {(
                                  [
                                    [
                                      `Text input · ${creditNumber(estimate.calculation.assumptions.textInputTokens)} tokens`,
                                      estimate.calculation.textInputMicros,
                                    ],
                                    [
                                      `Image input · ${creditNumber(estimate.calculation.assumptions.imageInputTokens)} tokens`,
                                      estimate.calculation.imageInputMicros,
                                    ],
                                    [
                                      `Image output · ${estimate.calculation.approximateOutputTokens ? "≈ " : ""}${creditNumber(estimate.calculation.outputTokens)} tokens`,
                                      estimate.calculation.imageOutputMicros,
                                    ],
                                  ] as const
                                ).map(([label, micros]) => (
                                  <div
                                    key={label}
                                    className="flex justify-between gap-3"
                                  >
                                    <dt className="text-muted-foreground">
                                      {label}
                                    </dt>
                                    <dd className="tabular-nums">
                                      {money(micros / 1e6)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                              <a
                                href={estimate.calculation.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-[11px] text-primary underline"
                              >
                                {estimate.calculation.source}
                              </a>
                            </div>
                          )}
                          <ImageTokenRates rate={rate} />
                          <p className="text-[11px] text-muted-foreground">
                            {rate?.pricingVerifiedAt
                              ? `Verified ${new Date(rate.pricingVerifiedAt).toLocaleDateString()}`
                              : "Pricing verification required"}
                          </p>
                          {rate?.sourceUrl && (
                            <a
                              className="text-[11px] text-primary underline"
                              href={rate.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Pricing source
                            </a>
                          )}
                        </div>
                      </details>
                    )}
                    {rate?.pricingError && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        {rate.pricingError}
                      </p>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <p className="font-medium">
                      {definition.provider === "openai"
                        ? "OpenAI"
                        : "Higgsfield"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {definition.provider === "openai"
                        ? "Direct API"
                        : "API provider"}
                    </p>
                  </td>
                  <td className="p-3">
                    <label className="flex items-center gap-2 whitespace-nowrap">
                      <Switch
                        aria-label={`Offer ${m.name} · ${m.variant}`}
                        checked={m.enabled}
                        disabled={setEnabled.isPending}
                        onCheckedChange={enabled =>
                          setEnabled.mutate({ id: m.id, enabled })
                        }
                      />
                      <span className="text-xs text-muted-foreground">
                        {setEnabled.isPending &&
                        setEnabled.variables?.id === m.id
                          ? "Saving…"
                          : m.enabled
                            ? "On"
                            : "Off"}
                      </span>
                    </label>
                  </td>
                  <td className="p-3 tabular-nums">
                    <p className="text-base font-semibold">
                      {prices ? money(prices.providerUsd) : "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Estimated provider cost
                    </p>
                  </td>
                  <td className="p-3 tabular-nums">
                    <p className="text-base font-semibold">
                      {prices ? creditNumber(prices.providerCredits) : "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Credit equivalent
                    </p>
                  </td>
                  <td className="p-3 tabular-nums bg-violet-500/5">
                    <p className="text-base font-semibold">
                      {prices ? money(prices.retailUsd) : "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      After {markup}% markup
                    </p>
                  </td>
                  <td className="p-3 tabular-nums bg-violet-500/5">
                    <p className="text-base font-semibold">
                      {prices ? creditNumber(prices.retailCredits) : "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Credits / action
                    </p>
                    {prices &&
                      Math.abs(prices.chargedUsd - prices.retailUsd) >
                        0.0000005 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {money(prices.chargedUsd)} after rounding
                        </p>
                      )}
                  </td>
                  <td className="p-3">
                    {markup}%
                    {rate?.markupPercent == null && (
                      <p className="text-xs text-muted-foreground">Default</p>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {m.available ? "Available" : m.reason}
                  </td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open(m.id)}
                    >
                      Configure
                    </Button>
                  </td>
                </tr>
              );
            })}
            {visibleModels.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="p-8 text-center text-muted-foreground"
                >
                  {catalog.isPending
                    ? "Loading models…"
                    : catalog.error
                      ? catalog.error.message
                      : "No models match these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {catalog.isLoading && (
          <p className="p-5 text-sm">Loading model pricing…</p>
        )}
        {catalog.error && (
          <p className="p-5 text-sm text-destructive">
            {catalog.error.message}
          </p>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        OpenAI rates are checked against official pricing daily; actual tokens
        are recorded per request. Higgsfield checks its estimate API for every
        generation. Numeric account quotes take priority; supported token models
        use the API’s current formula and a verified account discount, if
        configured. This comparison table uses reference rates. Review your
        provider bill before treating estimates as final costs. Routing changes
        affect new actions only.
      </p>
      <Dialog open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle>{edited?.name}</DialogTitle>
          <DialogDescription>
            Set pricing and routing for new requests. Blank overrides use the
            global or published rate.
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              if (edit)
                saveModel.mutate({
                  id: edit,
                  routeId: form.routeId,
                  markupPercent:
                    form.markup === "" ? null : Number(form.markup),
                  estimatedCostUsd:
                    form.estimate === "" ? null : Number(form.estimate),
                  perRequestUsd:
                    form.request === "" ? null : Number(form.request),
                  perSecondUsd: form.second === "" ? null : Number(form.second),
                  providerDiscountPercent:
                    form.discount === "" ? null : Number(form.discount),
                  providerDiscountEvidence: form.discountEvidence,
                  providerDiscountValidUntil: form.discountUntil
                    ? Date.parse(`${form.discountUntil}T23:59:59Z`)
                    : null,
                });
            }}
          >
            <label className="block space-y-1 text-sm">
              <span>Provider route</span>
              <select
                className="h-10 w-full rounded-lg border bg-background px-2"
                value={form.routeId}
                onChange={e => {
                  const route = generationModel(e.target.value)!,
                    rate = catalog.data!.rates.find(
                      r =>
                        r.provider === route.provider &&
                        r.model === route.providerModel
                    )?.config;
                  setForm({
                    ...form,
                    routeId: e.target.value,
                    markup:
                      rate?.markupPercent == null
                        ? ""
                        : String(rate.markupPercent),
                    estimate:
                      rate?.estimatedCostMicros == null
                        ? ""
                        : String(rate.estimatedCostMicros / 1e6),
                    request:
                      rate?.perRequestUsd == null
                        ? ""
                        : String(rate.perRequestUsd),
                    second:
                      rate?.perSecondUsd == null
                        ? ""
                        : String(rate.perSecondUsd),
                    discount:
                      rate?.providerDiscountPercent == null
                        ? ""
                        : String(rate.providerDiscountPercent),
                    discountEvidence: rate?.providerDiscountEvidence ?? "",
                    discountUntil: rate?.providerDiscountValidUntil
                      ? new Date(rate.providerDiscountValidUntil)
                          .toISOString()
                          .slice(0, 10)
                      : "",
                  });
                }}
              >
                {routes.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.provider === "openai" ? "OpenAI direct" : "Higgsfield"} ·{" "}
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["markup", "Markup override (%)"],
                ["request", "Provider cost per image/request override (USD)"],
                ["second", "Provider cost per second override (USD)"],
              ] as const
            )
              .filter(([key]) => key !== "second" || edited?.kind === "video")
              .map(([key, label]) => (
                <label key={key} className="block space-y-1 text-sm">
                  <span>{label}</span>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    value={form[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    placeholder="Use default"
                  />
                </label>
              ))}
            {generationModel(form.routeId)?.provider === "higgsfield" && (
              <fieldset className="space-y-3 rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">
                  Verified account discount
                </legend>
                <p className="text-xs text-muted-foreground">
                  Applies to formula estimates only. Numeric account quotes
                  already include provider pricing and are never discounted
                  twice. Verify this endpoint’s discount in your provider
                  account; advertised maximum discounts may not apply.
                </p>
                <label className="block space-y-1 text-sm">
                  <span>Provider discount (%)</span>
                  <Input
                    type="number"
                    min={0}
                    max={99.99}
                    step="any"
                    value={form.discount}
                    onChange={e =>
                      setForm({ ...form, discount: e.target.value })
                    }
                    placeholder="No verified discount"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span>Verification source</span>
                  <Input
                    value={form.discountEvidence}
                    onChange={e =>
                      setForm({ ...form, discountEvidence: e.target.value })
                    }
                    placeholder="Account pricing page or contract reference"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span>Review discount by (UTC)</span>
                  <Input
                    type="date"
                    value={form.discountUntil}
                    onChange={e =>
                      setForm({ ...form, discountUntil: e.target.value })
                    }
                  />
                </label>
              </fieldset>
            )}
            <p className="text-xs text-muted-foreground">
              Per-request cost takes precedence over per-second pricing. The
              image credit estimate is calculated from the model’s token rates,
              quality, and provider canvas. Final token costs use reported
              usage. Missing usage stays marked awaiting cost. Provider rate
              changes apply to every model routed through that provider
              endpoint.
            </p>
            <a
              className="block text-xs text-primary underline"
              href={edited?.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Official model documentation
            </a>
            <Button disabled={saveModel.isPending}>Save model settings</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
