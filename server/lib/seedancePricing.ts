import { generationModels } from "../../shared/modelCatalog";
import type { ProviderRate } from "../../shared/platformAdmin";
import type { VideoReference, VideoSetup } from "../../shared/videoCreation";

// Manufacturer output canvases, not a short-edge interpretation of “480p”.
// https://docs.volcengine.com/docs/ark/seedance-2-5 (output specifications)
const ratios = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
const canvases: Record<string, [number, number][]> = {
  "480p": [
    [854, 480],
    [752, 560],
    [640, 640],
    [560, 752],
    [480, 854],
    [992, 432],
  ],
  "720p": [
    [1280, 720],
    [1112, 834],
    [960, 960],
    [834, 1112],
    [720, 1280],
    [1470, 630],
  ],
  "1080p": [
    [1920, 1080],
    [1664, 1248],
    [1440, 1440],
    [1248, 1664],
    [1080, 1920],
    [2206, 946],
  ],
};
export function seedanceCanvas(
  endpoint: string,
  resolution: string,
  ratio: string
) {
  if (!endpoint.includes("seedance-2.")) return null;
  const index = ratios.indexOf(ratio);
  // 4K is a nominal 2×1080p canvas for estimation; measured output replaces
  // this wholesale estimate after completion without changing retail credits.
  if (
    resolution.toLowerCase() === "4k" &&
    endpoint.includes("seedance-2.0") &&
    index >= 0
  )
    return canvases["1080p"][index].map(n => n * 2) as [number, number];
  const canvas = canvases[resolution]?.[index];
  if (!canvas) return null;
  // Seedance 2.0 uses a different widescreen 480p canvas.
  if (endpoint.includes("seedance-2.0") && resolution === "480p") {
    if (ratio === "16:9") return [864, 496] as const;
    if (ratio === "9:16") return [496, 864] as const;
  }
  return canvas;
}

/** Metadata is resolved by the server, never accepted as a client cost override. */
export type VideoPricingContext = {
  sourceSeconds?: number;
  sourceRatio?: number;
  imageRatio?: number;
};
export function videoPricingContext(
  setup: VideoSetup,
  refs: VideoReference[]
): VideoPricingContext {
  const source = refs.find(r => r.key === setup.sourceVideoKey);
  const image = refs.find(r => r.mimeType.startsWith("image/"));
  return {
    sourceSeconds: source?.durationSeconds,
    sourceRatio:
      source?.width && source.height ? source.width / source.height : undefined,
    imageRatio:
      image?.width && image.height ? image.width / image.height : undefined,
  };
}

export function providerDiscount(rate: ProviderRate, now = Date.now()) {
  const discount = rate.providerDiscountPercent ?? 0;
  if (!discount) return 0;
  if (
    !Number.isFinite(discount) ||
    discount < 0 ||
    discount >= 100 ||
    !rate.providerDiscountEvidence?.trim() ||
    !rate.providerDiscountVerifiedAt ||
    !rate.providerDiscountValidUntil ||
    rate.providerDiscountValidUntil <= now
  )
    throw new Error(
      "The provider discount needs administrator verification before a new credit quote can be issued."
    );
  return discount;
}

/** Only reviewed billing grammar is accepted. Prices can change dynamically;
 * a changed formula/unit must be reviewed, never interpreted by an LLM. */
export function seedanceDescriptionEstimate(
  endpoint: string,
  request: Record<string, unknown>,
  description: string,
  rate: ProviderRate,
  context: VideoPricingContext = {}
) {
  if (!/^bytedance\/seedance-2\.[05]\//.test(endpoint)) return null;
  const model = generationModels.find(m => m.providerModel === endpoint);
  const template = model?.pricingNote;
  const normalize = (s: string) =>
    s
      .replace(/\$\d+(?:\.\d+)?/g, "$RATE")
      .replace(/\s+/g, " ")
      .trim();
  if (!template || normalize(description) !== normalize(template)) return null;
  const resolution = String(request.resolution ?? "720p");
  const videos = Array.isArray(request.video_urls)
    ? request.video_urls.length
    : request.video_url
      ? 1
      : 0;
  if (videos > 1) return null; // Add per-reference metadata before enabling multiple input videos.
  const hasVideo = videos > 0;
  if (
    (endpoint.endsWith("/video-edit") || endpoint.endsWith("/video-extend")) &&
    !hasVideo
  )
    return null;
  const source = hasVideo ? context.sourceSeconds : 0;
  if (hasVideo && (!source || !Number.isFinite(source) || source <= 0))
    return null;
  const edit = endpoint.endsWith("/video-edit");
  const duration = edit ? source : Number(request.duration);
  if (!duration || !Number.isFinite(duration) || duration <= 0 || duration > 30)
    return null;
  let ratio = String(request.aspect_ratio ?? "16:9");
  const adaptiveRatio = endpoint.endsWith("/image-to-video")
    ? context.imageRatio
    : edit || endpoint.endsWith("/video-extend")
      ? context.sourceRatio
      : undefined;
  if (
    (endpoint.endsWith("/image-to-video") ||
      edit ||
      endpoint.endsWith("/video-extend")) &&
    (!adaptiveRatio || !Number.isFinite(adaptiveRatio) || adaptiveRatio <= 0)
  )
    return null;
  if (adaptiveRatio != null) {
    ratio =
      ratios.find(r => {
        const [w, h] = r.split(":").map(Number);
        return Math.abs(w / h - adaptiveRatio) / adaptiveRatio < 0.025;
      }) ?? "adaptive";
  }
  let canvas = seedanceCanvas(endpoint, resolution, ratio);
  // Free-aspect source media uses the resolution's target pixel area. This is
  // explicitly an estimate, not a promise about the generated MP4 dimensions.
  if (!canvas && adaptiveRatio && canvases[resolution]) {
    const targetArea = canvases[resolution][0][0] * canvases[resolution][0][1];
    canvas = [
      Math.round(Math.sqrt(targetArea * adaptiveRatio)),
      Math.round(Math.sqrt(targetArea / adaptiveRatio)),
    ];
  }
  if (!canvas) return null;
  let perThousand: number;
  if (endpoint.includes("seedance-2.5")) {
    const tokenRates = description.match(
      /Each 1,000 video tokens costs \$(\d+(?:\.\d+)?) at 480p or 720p and \$(\d+(?:\.\d+)?) at 1080p/
    );
    if (!tokenRates) return null;
    perThousand = Number(tokenRates[resolution === "1080p" ? 2 : 1]);
    // Edit/extend descriptions already quote the reduced video-input rate.
    if (hasVideo && endpoint.endsWith("/reference-to-video"))
      perThousand *= 0.6;
  } else {
    const tokenRates = Array.from(
      description.matchAll(
        /480p\/720p\/1080p \$(\d+(?:\.\d+)?), 4K \$(\d+(?:\.\d+)?)/g
      )
    );
    const selected = tokenRates[hasVideo ? 1 : 0];
    if (!selected) return null;
    perThousand = Number(selected[resolution.toLowerCase() === "4k" ? 2 : 1]);
  }
  if (!Number.isFinite(perThousand) || perThousand <= 0 || perThousand > 100)
    return null;
  const tokens = Math.ceil(
    (canvas[0] * canvas[1] * ((source ?? 0) + duration) * 24) / 1024
  );
  const listCostMicros = Math.round(tokens * perThousand * 1000);
  const discount = providerDiscount(rate);
  return {
    costMicros: Math.round(listCostMicros * (1 - discount / 100)),
    listCostMicros,
    tokens,
    width: canvas[0],
    height: canvas[1],
    outputSeconds: duration,
    sourceSeconds: source ?? 0,
    discount,
    perThousand,
  };
}
