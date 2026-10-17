import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChoiceArt } from "./ChoiceArt";
import {
  generationModel,
  referenceCapacity,
  requiresVideo,
  modelDefaults,
} from "@shared/modelCatalog";
import {
  CREATIVE_ART_STYLES,
  CREATIVE_FORMATS,
  CREATIVE_MOODS,
  outputCount,
} from "@shared/creativeBuilder";
import { getCreativeTheme } from "@shared/creativeThemes";
import { findLifestylePerson } from "@shared/lifestylePeople";
import { defaultVideoDirection } from "@shared/videoCreation";
import {
  modelCompatibility,
  type ConfiguratorState,
  type ConfigurationSnapshot,
} from "@shared/creativeConfigurator";

export type CatalogChoice = {
  id: string;
  routeId: string;
  name: string;
  maker: string;
  variant: string;
  kind: "image" | "video";
  available: boolean;
  reason?: string | null;
  estimatedCredits?: number | null;
  estimatedSeconds?: number | null;
};
type Row = { label: string; values: ReactNode[]; different?: boolean };
function CompareTable({
  titles,
  rows,
  visuals,
}: {
  titles: ReactNode[];
  rows: Row[];
  visuals?: ReactNode[];
}) {
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const visible = rows.filter(r => !differencesOnly || r.different);
  return (
    <>
      <label className="cfg-differences">
        <input
          type="checkbox"
          checked={differencesOnly}
          onChange={e => setDifferencesOnly(e.target.checked)}
        />{" "}
        Show differences only
      </label>
      <div
        className="cfg-compare-scroll"
        tabIndex={0}
        aria-label="Side-by-side comparison"
      >
        <table className="cfg-compare-table">
          <thead>
            <tr>
              <th scope="col">Your choices</th>
              {titles.map((t, i) => (
                <th scope="col" key={i}>
                  {visuals?.[i]}
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.label} className={r.different ? "cfg-different" : ""}>
                <th scope="row">{r.label}</th>
                {r.values.map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="p-5">
            These choices have no differences in the compared fields.
          </p>
        )}
      </div>
    </>
  );
}
function row(label: string, values: string[]): Row {
  return { label, values, different: new Set(values).size > 1 };
}

export function ModelComparison({
  choices,
  references,
  hasVideo,
  selectedId,
  onChoose,
  onClose,
}: {
  choices: CatalogChoice[];
  references: number;
  hasVideo: boolean;
  selectedId?: string;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const definitions = choices.map(c => generationModel(c.routeId)!);
  const reasons = choices.map((c, i) =>
    !c.available
      ? c.reason || "Currently unavailable"
      : modelCompatibility(definitions[i], references, hasVideo)
  );
  const schemaValue = (key: string) =>
    definitions.map(m => {
      const p = m.inputSchema.properties[key];
      return !p
        ? "Not exposed by this model"
        : (p.enum?.join(" · ") ??
            p.description ??
            (p.default !== undefined ? String(p.default) : "Model controlled"));
    });
  const rows = [
    row(
      "Model maker",
      choices.map(c => c.maker)
    ),
    row(
      "Mode",
      choices.map(c => c.variant)
    ),
    row(
      "Starting estimate",
      choices.map(c =>
        c.estimatedCredits == null
          ? "Estimate unavailable"
          : `≈ ${c.estimatedCredits} credits / ${c.kind === "image" ? "image" : `${c.estimatedSeconds ?? "default"} seconds`}`
      )
    ),
    row(
      "Fits your current sources",
      reasons.map(r => r ?? "Compatible")
    ),
    row(
      "Image references",
      definitions.map(m => `Up to ${referenceCapacity(m)}`)
    ),
    row(
      "Required input",
      definitions.map(m =>
        requiresVideo(m)
          ? "Source video"
          : m.inputSchema.required?.some(k => /image|frame/.test(k))
            ? "Reference image"
            : "Can start with a text prompt"
      )
    ),
    ...[
      "quality",
      "resolution",
      "aspect_ratio",
      ...(choices[0]?.kind === "video" ? ["duration"] : []),
    ].map(key => row(key.replaceAll("_", " "), schemaValue(key))),
    row(
      "Audio controls",
      definitions.map(
        m =>
          Object.entries(m.inputSchema.properties)
            .filter(([k, p]) => /audio|sound/.test(k) && p.type === "boolean")
            .map(([k, p]) => p.title || k.replaceAll("_", " "))
            .join(" · ") || "No audio control exposed"
      )
    ),
  ];
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="cfg-modal cfg-compare-modal sm:max-w-6xl">
        <DialogTitle>Compare {choices[0]?.kind} models</DialogTitle>
        <DialogDescription>
          Compare supported capabilities and starting estimates. Final credits
          depend on your complete setup. Illustrations are visual guides, not
          model samples; no generation is performed here.
        </DialogDescription>
        <CompareTable
          titles={choices.map((c, i) => (
            <div className="cfg-compare-name">
              <strong>{c.name}</strong>
              <small>{c.maker}</small>
              <button
                className="cfg-compare-select"
                disabled={!!reasons[i] || c.id === selectedId}
                onClick={() => {
                  onChoose(c.id);
                  onClose();
                }}
              >
                {c.id === selectedId ? "Selected" : "Use this model"}
              </button>
            </div>
          ))}
          rows={rows}
        />
      </DialogContent>
    </Dialog>
  );
}

type Context = {
  products: {
    id: number;
    name: string;
    images: { id: number; url: string }[];
  }[];
  assets: { key: string; name?: string; url?: string | null }[];
  references: { id: number; name: string; url: string }[];
  logos: { id: number; name: string }[];
  models: CatalogChoice[];
};
function sourceReference(key: string, context: Context) {
  const asset = context.assets.find(a => a.key === key);
  if (asset)
    return { name: asset.name || "Uploaded reference", url: asset.url };
  const imageId = key.startsWith("product_image:")
    ? Number(key.slice(14))
    : NaN;
  const product = context.products.find(p =>
    p.images.some(i => i.id === imageId)
  );
  return product
    ? {
        name: `${product.name} · Photo ${product.images.findIndex(i => i.id === imageId) + 1}`,
        url: product.images.find(i => i.id === imageId)?.url,
      }
    : { name: "Unavailable reference", url: null };
}
function describe(
  c: ConfiguratorState,
  context: Context
): Record<string, string> {
  const image = c.kind === "image",
    s = image ? c.image : c.video;
  const d = image ? c.image : (c.video.direction ?? defaultVideoDirection);
  const model = context.models.find(m => m.id === s.modelId);
  const definition = generationModel(model?.routeId ?? s.modelId ?? "");
  const settings = {
    ...(definition ? modelDefaults(definition) : {}),
    ...s.modelOptions,
  };
  const people = image
    ? (c.image.people ?? (c.image.person ? [c.image.person] : []))
    : c.video.people;
  return {
    "Creative type": image ? "Image" : "Video",
    Subject: image
      ? c.image.promotionMode === "platform"
        ? `${c.image.promotion?.title || "Business promotion"} · ${c.image.promotion?.description || "Brand profile"}`
        : c.image.products
            .map(
              p =>
                context.products.find(x => x.id === p.productId)?.name ??
                "Unavailable catalog item"
            )
            .join(" · ") ||
          (c.image.sourceAssetKeys ?? [])
            .map(k => sourceReference(k, context).name)
            .join(" · ") ||
          "No subject selected"
      : c.video.imageKeys
          .map(k => sourceReference(k, context).name)
          .join(" · ") || "Prompt only",
    "Source images": image
      ? [
          ...c.image.products
            .filter(p => p.imageId !== null)
            .map(
              p => sourceReference(`product_image:${p.imageId}`, context).name
            ),
          ...(c.image.sourceAssetKeys ?? []).map(
            k => sourceReference(k, context).name
          ),
          ...(c.image.referenceAssetIds ?? []).map(
            id =>
              context.references.find(a => a.id === id)?.name ??
              "Unavailable reference"
          ),
        ].join("\n") || "No source images"
      : c.video.imageKeys
          .map(k => sourceReference(k, context).name)
          .join("\n") || "No source images",
    "Source video": image
      ? "Not applicable"
      : c.video.sourceVideoKey
        ? sourceReference(c.video.sourceVideoKey, context).name
        : "No source video",
    "Product arrangement": image
      ? c.image.productMode === "together"
        ? "Together in one composition"
        : "Separate creative per product"
      : "Not applicable",
    "Product details": image
      ? c.image.products
          .map(
            p =>
              `${context.products.find(x => x.id === p.productId)?.name ?? "Catalog item"}: ${p.includePrice ? "Include price" : "No price"}${p.featuredSpecKeys.length ? " · " + p.featuredSpecKeys.join(", ") : ""}`
          )
          .join("\n") || "Not applicable"
      : "Not applicable",
    Scene: image
      ? c.image.shot === "product"
        ? "Subject only"
        : c.image.shot === "lifestyle"
          ? "Lifestyle · no people"
          : "Lifestyle · with people"
      : c.video.direction?.setting === "product"
        ? "Subject only"
        : c.video.direction?.setting === "people"
          ? "Lifestyle · with people"
          : "Lifestyle · no people",
    People: people.length
      ? people
          .map(p =>
            p.kind === "library"
              ? (findLifestylePerson(p.id)?.name ?? "Library person")
              : (context.assets.find(a => a.key === `asset:${p.assetId}`)
                  ?.name ?? "Uploaded person")
          )
          .join(" · ")
      : "No people",
    Theme: getCreativeTheme(d.theme).name,
    "Art style":
      CREATIVE_ART_STYLES.find(a => a.id === d.artStyle)?.name ?? d.artStyle,
    Mood: CREATIVE_MOODS.find(a => a.id === d.mood)?.name ?? d.mood,
    Composition: d.placement,
    "Product preservation": image
      ? c.image.preserveProduct
        ? "Complete design + editable product overlay"
        : "AI composition"
      : "Not applicable",
    Font: image ? c.image.fontFamily || "Art-directed" : "Not applicable",
    "Preserve font": image
      ? c.image.preserveFont
        ? "On"
        : "Off"
      : "Not applicable",
    "Brand logo": image
      ? (context.logos.find(l => l.id === c.image.logoAssetId)?.name ??
        "No logo")
      : "Via source reference / prompt",
    Headline: image ? c.image.copy.headline || "Not set" : "Not applicable",
    Subheadline: image
      ? c.image.copy.subheadline || "Not set"
      : "Not applicable",
    "Call to action": image ? c.image.copy.cta || "Not set" : "Not applicable",
    Prompt: image ? c.image.basePrompt : c.video.prompt || "Not set",
    "Creative direction":
      [d.themePrompt, d.extraDirection].filter(Boolean).join("\n") || "Not set",
    "AI model": model?.name ?? definition?.name ?? "Model unavailable",
    "Model settings":
      Object.entries(settings)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`)
        .join("\n") || "Model defaults",
    Output: image
      ? c.image.formatIds
          .map(id => {
            const f = CREATIVE_FORMATS.find(f => f.id === id);
            return f ? `${f.name} (${f.width} × ${f.height})` : id;
          })
          .join(" · ")
      : `${c.video.aspectRatio} · ${c.video.resolution} · ${c.video.duration}s`,
    Quantity: image ? `${outputCount(c.image)} images` : "1 video",
    Audio: image
      ? "Not applicable"
      : Object.entries(settings)
          .filter(([k, v]) => /audio|sound/.test(k) && typeof v === "boolean")
          .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v ? "On" : "Off"}`)
          .join(" · ") || "No audio control exposed",
    Subtitles: image ? "Not applicable" : "Not available in this prototype",
  };
}
export function ConfigurationComparison({
  baseline,
  current,
  credits,
  baselineQuote,
  context,
  onSwap,
  onClose,
}: {
  baseline: ConfigurationSnapshot;
  current: ConfiguratorState;
  credits?: number;
  baselineQuote?: { credits?: number; pending?: boolean; error?: string };
  context: Context;
  onSwap: () => void;
  onClose: () => void;
}) {
  const configs = [baseline.config, current],
    values = configs.map(c => describe(c, context));
  const [before, now] = values;
  const rows = Object.keys(before).map(label =>
    row(label, [before[label], now[label]])
  );
  rows.unshift({
    label: "Generation total",
    values: [
      baselineQuote?.pending
        ? "Updating credits…"
        : !baselineQuote?.error && baselineQuote?.credits !== undefined
          ? `${baselineQuote.credits.toLocaleString()} credits · current total`
          : baseline.credits == null
            ? baselineQuote?.error
              ? `Credits unavailable: ${baselineQuote.error}`
              : "No saved estimate"
            : `${baseline.credits.toLocaleString()} credits · saved estimate (${new Date(baseline.capturedAt).toLocaleString()}); current total unavailable`,
      credits === undefined
        ? "Complete setup for current total"
        : `${credits.toLocaleString()} credits · current total`,
    ],
    different:
      (baselineQuote?.pending || baselineQuote?.error
        ? null
        : (baselineQuote?.credits ?? baseline.credits)) !== (credits ?? null),
  });
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="cfg-modal cfg-compare-modal sm:max-w-5xl">
        <DialogTitle>Compare creative configurations</DialogTitle>
        <DialogDescription>
          Your saved comparison and current build. The saved build's credit
          total refreshes when you compare. Generation always checks the current
          price. Comparing does not use credits.
        </DialogDescription>
        <CompareTable
          titles={configs.map((c, i) => (
            <div className="cfg-compare-name">
              <small>{i ? "CURRENT BUILD" : "SAVED COMPARISON"}</small>
              <strong>
                {c.kind === "image" ? c.image.name : c.video.title}
              </strong>
            </div>
          ))}
          rows={rows}
          visuals={configs.map(c => {
            const d =
              c.kind === "image"
                ? c.image
                : (c.video.direction ?? defaultVideoDirection);
            const theme = getCreativeTheme(d.theme);
            const source =
              c.kind === "image"
                ? ((c.image.promotionMode === "platform"
                    ? null
                    : c.image.products[0]?.imageId
                      ? sourceReference(
                          `product_image:${c.image.products[0].imageId}`,
                          context
                        ).url
                      : null) ??
                  (c.image.sourceAssetKeys?.[0]
                    ? sourceReference(c.image.sourceAssetKeys[0], context).url
                    : null) ??
                  context.references.find(
                    a => a.id === c.image.referenceAssetIds?.[0]
                  )?.url)
                : c.video.imageKeys[0]
                  ? sourceReference(c.video.imageKeys[0], context).url
                  : null;
            return (
              <div className="cfg-compare-art">
                {source ? (
                  <img src={source} alt="Source reference" />
                ) : (
                  <ChoiceArt
                    name={theme.name}
                    type={c.kind}
                    palette={theme.palette}
                  />
                )}
                <small>
                  {source ? "Source reference" : "Direction illustration"}
                </small>
              </div>
            );
          })}
        />
        <div className="cfg-compare-actions">
          <p>
            Keep exploring your current build, or swap it with the saved
            comparison. Both setups are retained.
          </p>
          <button
            className="cfg-compare-select"
            onClick={() => {
              onSwap();
              onClose();
            }}
          >
            Swap builds
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
