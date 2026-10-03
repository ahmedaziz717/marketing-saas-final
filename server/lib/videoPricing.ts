import { and, eq } from "drizzle-orm";
import { providerRates } from "../../drizzle/platformSchema";
import type { ProviderRate } from "../../shared/platformAdmin";
import {
  videoModelKey,
  type VideoSetup,
  type VideoReference,
} from "../../shared/videoCreation";
import type { LibraryDatabase, LibraryTransaction } from "./assetLibrary";

export const defaultVideoRates: ProviderRate[] = [
  "seedance-2.5",
  "genjutsu",
].flatMap(model =>
  ["480p", "720p", "1080p"].map((resolution, i) => ({
    provider: "higgsfield",
    model: `${model}/${resolution}`,
    kind: "video" as const,
    credits: (model === "genjutsu" ? [32, 69, 164] : [21, 47, 114])[i],
    inputPerMillion: null,
    cachedInputPerMillion: null,
    outputPerMillion: model === "genjutsu" ? null : i === 2 ? 23.4 : 21.4,
    perRequestUsd: null,
    perSecondUsd: model === "genjutsu" ? [0.318, 0.681, 1.632][i] : null,
    videoInputMultiplier: model === "genjutsu" ? 1 : 0.6,
    sourceUrl:
      model === "genjutsu"
        ? "https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/playground"
        : "https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/playground",
    automaticPricing: false,
    pricingCheckedAt: Date.UTC(2026, 9, 3),
    pricingVerifiedAt: Date.UTC(2026, 9, 3),
    pricingVersion: "higgsfield-published-2026-10-03",
    note: "Estimated list-price cost, excluding promotions and contract discounts. Credits are per second (source + output for Seedance; source for motion). Video tokens are pixel/time units, not LLM tokens. Verify provider pricing before changing rates.",
  }))
);
export async function videoRate(
  db: LibraryDatabase | LibraryTransaction,
  setup: VideoSetup
) {
  const model = videoModelKey(setup);
  const [row] = await db
    .select()
    .from(providerRates)
    .where(
      and(
        eq(providerRates.provider, "higgsfield"),
        eq(providerRates.model, model),
        eq(providerRates.kind, "video")
      )
    );
  return row?.config ?? defaultVideoRates.find(rate => rate.model === model)!;
}
export function videoSeconds(setup: VideoSetup, refs: VideoReference[]) {
  const source =
    setup.mode === "create"
      ? 0
      : (refs.find(r => r.key === setup.sourceVideoKey)?.durationSeconds ?? 0);
  const output = ["edit", "motion"].includes(setup.mode)
    ? source
    : setup.duration;
  return {
    source,
    output,
    billed:
      setup.mode === "motion" ? Math.ceil(source) : Math.ceil(source + output),
  };
}
export function videoQuote(
  setup: VideoSetup,
  refs: VideoReference[],
  rate: ProviderRate,
  measured?: { durationSeconds: number; width: number; height: number }
) {
  const seconds = videoSeconds(setup, refs);
  const [a, b] = (setup.mode === "create" ? setup.aspectRatio : "16:9")
    .split(":")
    .map(Number);
  const short = Number.parseInt(setup.resolution),
    ratio = a / b;
  const sourceVideo = refs.find(r => r.key === setup.sourceVideoKey);
  const outputRatio =
    setup.mode !== "create" && sourceVideo?.width && sourceVideo.height
      ? sourceVideo.width / sourceVideo.height
      : ratio;
  // Quotes use nominal dimensions; final estimates use the measured MP4 dimensions.
  const width =
    measured?.width ??
    (outputRatio >= 1 ? Math.round(short * outputRatio) : short);
  const height =
    measured?.height ??
    (outputRatio >= 1 ? short : Math.round(short / outputRatio));
  const totalSeconds =
    seconds.source + (measured?.durationSeconds ?? seconds.output);
  const videoTokens = Math.ceil((width * height * totalSeconds * 24) / 1024);
  const costMicros =
    rate.perRequestUsd != null
      ? Math.round(rate.perRequestUsd * 1e6)
      : setup.mode === "motion"
        ? rate.perSecondUsd == null
          ? null
          : Math.round(seconds.billed * rate.perSecondUsd * 1e6)
        : rate.outputPerMillion == null
          ? null
          : Math.round(
              videoTokens *
                rate.outputPerMillion *
                (seconds.source ? (rate.videoInputMultiplier ?? 0.6) : 1)
            );
  return {
    credits: Math.ceil(rate.credits * seconds.billed),
    costMicros,
    durationSeconds: seconds.output,
    sourceSeconds: seconds.source,
    videoTokens: setup.mode === "motion" ? null : videoTokens,
    estimated: true as const,
  };
}
