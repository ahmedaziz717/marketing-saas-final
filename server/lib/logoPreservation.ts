import { systemPromptContract } from "../../shared/promptContracts";
import sharp from "sharp";
import { z } from "zod";
import { invokeLLM, listLLMModels } from "../_core/llm";
import { requireLatestGptTextModel } from "./models";
import type { CreativeSetup } from "../../shared/creativeBuilder";
import type { LogoPlacement } from "../../shared/logoPreservation";
import {
  readTransparentArtwork,
  type ProductCutout,
} from "./productPreservation";

export async function loadPreservedLogo(
  setup: CreativeSetup,
  resolved: { logo: { storageKey: string } | null }
) {
  if (!setup.preserveLogo) return null;
  if (!resolved.logo)
    throw new Error(
      "Choose an approved logo to preserve its original artwork."
    );
  return readTransparentArtwork(resolved.logo.storageKey, "logo");
}

/** Only transparent padding is removed; color, shape and aspect remain original. */
export async function prepareLogoPlacement(
  logo: ProductCutout,
  canvas: { width: number; height: number },
  position: CreativeSetup["logoPosition"] = "top-left"
) {
  const ratio = Math.min(
    1,
    (canvas.width * 0.22) / logo.width,
    (canvas.height * 0.14) / logo.height
  );
  const width = Math.max(1, Math.floor(logo.width * ratio));
  const height = Math.max(1, Math.floor(logo.height * ratio));
  const margin = Math.max(
    1,
    Math.round(Math.min(canvas.width, canvas.height) * 0.04)
  );
  const placement: LogoPlacement = {
    left: position.endsWith("right") ? canvas.width - margin - width : margin,
    top: position.startsWith("bottom")
      ? canvas.height - margin - height
      : margin,
    width,
    height,
  };
  return { placement };
}

/** Never trust the image generator to honor a reserved area exactly. */
export async function findSafeLogoPlacement(
  design: Buffer,
  preferred: LogoPlacement
): Promise<LogoPlacement> {
  const image = sharp(design, { limitInputPixels: 16_000_000 });
  const info = await image.metadata();
  if (!info.width || !info.height)
    throw new Error("The creative canvas is unavailable for logo placement.");
  const preview = await image
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const result = await invokeLLM({
    model: requireLatestGptTextModel((await listLLMModels()).data),
    maxTokens: 6000,
    reasoning: { effort: "low" },
    includedInAction: true,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "protected_creative_regions",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["confidence", "regions"],
          properties: {
            confidence: { type: "number", minimum: 0, maximum: 1 },
            regions: {
              type: "array",
              minItems: 1,
              maxItems: 60,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["left", "top", "width", "height"],
                properties: Object.fromEntries(
                  ["left", "top", "width", "height"].map(key => [
                    key,
                    { type: "number", minimum: 0, maximum: 1000 },
                  ])
                ),
              },
            },
          },
        },
      },
    },
    messages: [
      {
        role: "system",
        content: systemPromptContract("contract.logoPreservation.1"),
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${preview.toString("base64")}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });
  if (result.choices[0]?.finish_reason === "length")
    throw new Error(
      "The logo placement inspection did not finish. Please retry this creative."
    );
  const content = result.choices[0]?.message?.content;
  let payload: unknown;
  try {
    payload = JSON.parse(typeof content === "string" ? content : "{}");
  } catch {
    throw new Error(
      "The creative's text and product positions could not be verified for the original logo."
    );
  }
  const detected = z
    .object({
      confidence: z.number().min(0.8).max(1),
      regions: z
        .array(
          z
            .object({
              left: z.number().min(0).max(1000),
              top: z.number().min(0).max(1000),
              width: z.number().positive().max(1000),
              height: z.number().positive().max(1000),
            })
            .refine(r => r.left + r.width <= 1000 && r.top + r.height <= 1000)
        )
        .min(1)
        .max(60),
    })
    .safeParse(payload);
  if (!detected.success)
    throw new Error(
      "The creative's text and product positions could not be verified for the original logo."
    );
  const regions = detected.data.regions.map(r => ({
    left: (r.left * info.width!) / 1000,
    top: (r.top * info.height!) / 1000,
    width: (r.width * info.width!) / 1000,
    height: (r.height * info.height!) / 1000,
  }));
  return chooseSafeLogoPlacement(
    { width: info.width, height: info.height },
    preferred,
    regions
  );
}

/** Keep the requested corner when clear; otherwise move the mark, never the artwork. */
export function chooseSafeLogoPlacement(
  canvas: { width: number; height: number },
  preferred: LogoPlacement,
  protectedRegions: LogoPlacement[]
): LogoPlacement {
  const margin = Math.max(
    1,
    Math.round(Math.min(canvas.width, canvas.height) * 0.04)
  );
  const right = preferred.left + preferred.width / 2 > canvas.width / 2;
  const bottom = preferred.top + preferred.height / 2 > canvas.height / 2;
  for (const scale of [1, 0.85, 0.7, 0.55]) {
    const width = Math.max(1, Math.floor(preferred.width * scale));
    const height = Math.max(1, Math.floor(preferred.height * scale));
    const padding =
      Math.max(6, Math.ceil(Math.max(width, height) * 0.35)) +
      Math.max(3, Math.round(Math.min(canvas.width, canvas.height) * 0.012));
    const xs = new Set([margin, canvas.width - margin - width]);
    const ys = new Set([margin, canvas.height - margin - height]);
    for (let i = 1; i < 20; i++) {
      xs.add(
        Math.round(margin + ((canvas.width - 2 * margin - width) * i) / 20)
      );
      ys.add(
        Math.round(margin + ((canvas.height - 2 * margin - height) * i) / 20)
      );
    }
    const anchor = {
      left: right ? canvas.width - margin - width : margin,
      top: bottom ? canvas.height - margin - height : margin,
    };
    const candidates = Array.from(xs).flatMap(left =>
      Array.from(ys).map(top => ({ left, top, width, height }))
    );
    candidates.sort(
      (a, b) =>
        Math.hypot(
          (a.left - anchor.left) / canvas.width,
          (a.top - anchor.top) / canvas.height
        ) -
        Math.hypot(
          (b.left - anchor.left) / canvas.width,
          (b.top - anchor.top) / canvas.height
        )
    );
    const clear = candidates.find(
      p =>
        p.left >= 0 &&
        p.top >= 0 &&
        p.left + width <= canvas.width &&
        p.top + height <= canvas.height &&
        protectedRegions.every(
          r =>
            p.left + width + padding <= r.left ||
            p.left - padding >= r.left + r.width ||
            p.top + height + padding <= r.top ||
            p.top - padding >= r.top + r.height
        )
    );
    if (clear) return clear;
  }
  throw new Error(
    "There is no clear space for the original logo without covering text or the subject. Try a less crowded composition."
  );
}

function luminance(r: number, g: number, b: number) {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return linear(r) * 0.2126 + linear(g) * 0.7152 + linear(b) * 0.0722;
}

/** Choose the least background adjustment that separates the original artwork. */
function contrastSupport(mark: Buffer, scene: Buffer) {
  const samples: Array<{
    foreground: number;
    r: number;
    g: number;
    b: number;
  }> = [];
  for (let i = 0; i < mark.length; i += 4) {
    if (mark[i + 3] < 192) continue;
    samples.push({
      foreground: luminance(mark[i], mark[i + 1], mark[i + 2]),
      r: scene[i],
      g: scene[i + 1],
      b: scene[i + 2],
    });
  }
  if (!samples.length) return null;
  function score(color: number, opacity: number) {
    let readable = 0;
    for (const sample of samples) {
      const background = luminance(
        sample.r * (1 - opacity) + color * opacity,
        sample.g * (1 - opacity) + color * opacity,
        sample.b * (1 - opacity) + color * opacity
      );
      const contrast =
        (Math.max(sample.foreground, background) + 0.05) /
        (Math.min(sample.foreground, background) + 0.05);
      if (contrast >= 3) readable++;
    }
    return readable / samples.length;
  }
  const initial = score(0, 0);
  if (initial >= 0.98) return null;
  let best = { color: 0, opacity: 0, score: initial };
  for (let step = 1; step <= 16; step++) {
    const opacity = step * 0.05;
    for (const color of [255, 0]) {
      const value = score(color, opacity);
      if (value > best.score) best = { color, opacity, score: value };
      if (value >= 0.98) return best;
    }
  }
  return best.opacity ? best : null;
}

/** Original artwork on a complete creative, with local feathered contrast only if needed. */
export async function renderOriginalLogo(
  design: Buffer,
  logo: ProductCutout,
  placement: LogoPlacement
) {
  const image = sharp(design, { limitInputPixels: 16_000_000 });
  const metadata = await image.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    placement.left < 0 ||
    placement.top < 0 ||
    placement.left + placement.width > metadata.width ||
    placement.top + placement.height > metadata.height
  )
    throw new Error("The original logo does not fit this creative's canvas.");
  const png = await sharp(logo.png)
    .resize({ width: placement.width, height: placement.height, fit: "fill" })
    .png()
    .toBuffer();
  const mark = await sharp(png).ensureAlpha().raw().toBuffer();
  const scene = await sharp(design)
    .extract(placement)
    .ensureAlpha()
    .raw()
    .toBuffer();
  const support = contrastSupport(mark, scene);
  const composites: sharp.OverlayOptions[] = [];
  if (support) {
    // A smooth light/shade falloff preserves scene texture and avoids a hard badge.
    const feather = Math.max(
      6,
      Math.ceil(Math.max(placement.width, placement.height) * 0.35)
    );
    const left = Math.max(0, placement.left - feather);
    const top = Math.max(0, placement.top - feather);
    const width =
      Math.min(metadata.width, placement.left + placement.width + feather) -
      left;
    const height =
      Math.min(metadata.height, placement.top + placement.height + feather) -
      top;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const dx = Math.max(
          placement.left - (left + x),
          0,
          left + x - (placement.left + placement.width - 1)
        );
        const dy = Math.max(
          placement.top - (top + y),
          0,
          top + y - (placement.top + placement.height - 1)
        );
        const distance = Math.min(1, Math.hypot(dx, dy) / feather);
        const fade = 1 - distance * distance * (3 - 2 * distance);
        const i = (y * width + x) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = support.color;
        rgba[i + 3] = Math.round(support.opacity * fade * 255);
      }
    composites.push({
      input: await sharp(rgba, { raw: { width, height, channels: 4 } })
        .png()
        .toBuffer(),
      left,
      top,
    });
  }
  return image
    .composite([
      ...composites,
      { input: png, left: placement.left, top: placement.top },
    ])
    .png()
    .toBuffer();
}
