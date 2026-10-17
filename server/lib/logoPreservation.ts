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
  const { data, info } = await sharp(logo.png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let luminance = 0,
    weight = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const alpha = data[i + 3] / 255;
    luminance +=
      (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) * alpha;
    weight += alpha;
  }
  return {
    placement,
    background: luminance / Math.max(1, weight) < 140 ? "light" : "dark",
  };
}

/** Composite once at final resolution; all pixels outside the logo stay intact. */
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
  return image
    .composite([{ input: png, left: placement.left, top: placement.top }])
    .png()
    .toBuffer();
}
