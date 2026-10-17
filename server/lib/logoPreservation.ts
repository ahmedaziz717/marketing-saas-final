import sharp from "sharp";
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
