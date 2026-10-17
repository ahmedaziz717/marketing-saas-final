import sharp from "sharp";
import { createRequire } from "node:module";
import type { CreativeSetup } from "../../shared/creativeBuilder";
import type { BuilderBrandKit, ResolvedBuilderInputs } from "./creativeBuilder";
import {
  layoutPreservedProducts,
  preservationRegions,
  type ProductCutout,
  type ImageRegion,
} from "./productPreservation";

const require = createRequire(import.meta.url);
// Ship the existing dependency's font; do not rely on a host-installed font.
const fontfile = require.resolve(
  "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2"
);
const boldFontfile = require.resolve(
  "@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2"
);
type Foreground = ImageRegion & { png: Buffer; role: string; text?: string };
const escapeMarkup = (value: string) =>
  value.replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!
  );

function rectangle(width: number, height: number, color: string, opacity = 1) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${Math.min(14, height * 0.12)}" fill="${color}" fill-opacity="${opacity}"/></svg>`
  );
}

async function textImage(
  text: string,
  width: number,
  fontSize: number,
  color: string,
  bold = false,
  height?: number
) {
  return sharp({
    text: {
      text: `<span foreground="${color}">${escapeMarkup(text)}</span>`,
      font: `Noto Sans ${bold ? "Bold " : ""}${fontSize}`,
      fontfile: bold ? boldFontfile : fontfile,
      width,
      rgba: true,
      wrap: "word-char",
      ...(height ? { height } : { dpi: 72 }),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

export async function preparePreservedComposition(input: {
  setup: CreativeSetup;
  brand: BuilderBrandKit;
  products: ResolvedBuilderInputs["products"];
  canvas: { width: number; height: number; name?: string };
  cutouts: ProductCutout[];
  logo?: Buffer;
}) {
  const { setup, brand, products, canvas } = input;
  const layers = await layoutPreservedProducts(
    input.cutouts,
    canvas,
    setup.placement
  );
  const regions = preservationRegions(canvas, setup.placement, layers.length);
  const box = regions.copy;
  const short = Math.min(canvas.width, canvas.height);
  const gap = Math.max(3, Math.round(short * 0.018));
  const inset = Math.max(3, Math.round(short * 0.014));
  const contentWidth = box.width - 2 * inset;
  const foreground: Foreground[] = [];
  const dark = ["dark", "vibrant", "bold", "premium"].includes(setup.mood);
  const ink = dark ? "#ffffff" : "#111827";
  const panel = dark ? "#10111b" : "#ffffff";
  const accent =
    brand.colors.find(
      c => /^#[a-f\d]{6}$/i.test(c) && !/^#(ffffff|000000)$/i.test(c)
    ) ?? "#6c3cff";
  const accentBrightness = [1, 3, 5].reduce(
    (v, start, i) =>
      v +
      parseInt(accent.slice(start, start + 2), 16) * [0.299, 0.587, 0.114][i],
    0
  );
  const ctaInk = accentBrightness > 150 ? "#111827" : "#ffffff";
  let y = box.top + inset;
  if (input.logo) {
    const { data, info } = await sharp(input.logo, {
      limitInputPixels: 16_000_000,
    })
      .resize({
        width: Math.max(1, Math.floor(contentWidth * 0.6)),
        height: Math.max(
          1,
          Math.floor(Math.min(box.height * 0.13, short * 0.1))
        ),
        fit: "inside",
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    const { data: pixels } = await sharp(data)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let luminance = 0,
      visible = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3] / 255;
      luminance +=
        (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) *
        alpha;
      visible += alpha;
    }
    // Preserve the original logo colors and choose a contrasting backing.
    foreground.push({
      png: rectangle(
        info.width + inset,
        info.height + inset,
        luminance / Math.max(1, visible) > 150 ? "#10111b" : "#ffffff"
      ),
      left: box.left + inset,
      top: y,
      width: info.width + inset,
      height: info.height + inset,
      role: "logo-backing",
    });
    foreground.push({
      png: data,
      left: box.left + inset + Math.floor(inset / 2),
      top: y + Math.floor(inset / 2),
      width: info.width,
      height: info.height,
      role: "logo",
    });
    y += info.height + inset + gap;
  }
  const details = products
    .map(p => {
      const lines = Object.entries(p.featuredSpecifications ?? {}).map(
        ([key, value]) => `${key}: ${value}`
      );
      if (p.includePrice) lines.push(`${p.price} ${p.currency}`);
      return lines.length
        ? (products.length > 1 ? `${p.name}\n` : "") + lines.join("\n")
        : "";
    })
    .filter(Boolean)
    .join("\n\n");
  const blocks = [
    {
      role: "headline",
      text: setup.copy.headline.trim(),
      size: Math.max(16, Math.round(short * 0.065)),
      bold: true,
      color: ink,
    },
    {
      role: "subheadline",
      text: setup.copy.subheadline.trim(),
      size: Math.max(12, Math.round(short * 0.027)),
      bold: false,
      color: ink,
    },
    {
      role: "specifications",
      text: details,
      size: Math.max(11, Math.round(short * 0.023)),
      bold: false,
      color: ink,
    },
    {
      role: "required-claims",
      text: brand.requiredClaims?.trim() ?? "",
      size: Math.max(10, Math.round(short * 0.018)),
      bold: false,
      color: ink,
    },
    {
      role: "cta",
      text: setup.copy.cta.trim(),
      size: Math.max(11, Math.round(short * 0.025)),
      bold: true,
      color: ctaInk,
    },
  ].filter(block => block.text);
  const ctaPadding = Math.max(3, Math.round(short * 0.013));
  const measured = [];
  for (const block of blocks) {
    const width = contentWidth - (block.role === "cta" ? 2 * ctaPadding : 0);
    measured.push({
      ...block,
      width,
      image: await textImage(
        block.text,
        width,
        block.size,
        block.color,
        block.bold
      ),
    });
  }
  const available =
    box.top +
    box.height -
    inset -
    y -
    Math.max(0, blocks.length - 1) * gap -
    (setup.copy.cta.trim() ? 2 * ctaPadding : 0);
  const naturalHeight = measured.reduce(
    (sum, b) => sum + b.image.info.height,
    0
  );
  if (measured.length && available < measured.length * 7)
    throw new Error(
      `Product preservation layout cannot fit the selected copy in ${canvas.name ?? "this size"}. Shorten the copy/specs or choose a larger format. No generation has started.`
    );
  const scale = Math.min(1, available / Math.max(1, naturalHeight));
  for (const block of measured) {
    const maxHeight = Math.max(1, Math.floor(block.image.info.height * scale));
    const rendered =
      scale < 1
        ? await textImage(
            block.text,
            block.width,
            block.size,
            block.color,
            block.bold,
            maxHeight
          )
        : block.image;
    const fontSize = (block.size * (rendered.info.textAutofitDpi ?? 72)) / 72;
    if (
      fontSize < Math.min(block.size, short >= 600 ? 16 : 8) ||
      rendered.info.width > block.width ||
      rendered.info.height > maxHeight
    ) {
      throw new Error(
        `Product preservation layout cannot keep the selected copy readable in ${canvas.name ?? "this size"}. Shorten the copy/specs or choose a larger format. No generation has started.`
      );
    }
    const isCta = block.role === "cta";
    if (isCta) {
      foreground.push({
        png: rectangle(
          rendered.info.width + 2 * ctaPadding,
          rendered.info.height + 2 * ctaPadding,
          accent
        ),
        left: box.left + inset,
        top: y,
        width: rendered.info.width + 2 * ctaPadding,
        height: rendered.info.height + 2 * ctaPadding,
        role: "cta-backing",
      });
      y += ctaPadding;
    }
    foreground.push({
      png: rendered.data,
      left: box.left + inset + (isCta ? ctaPadding : 0),
      top: y,
      width: rendered.info.width,
      height: rendered.info.height,
      role: block.role,
      text: block.text,
    });
    y += rendered.info.height + gap + (isCta ? ctaPadding : 0);
  }
  if (foreground.length)
    foreground.unshift({
      png: rectangle(
        box.width,
        Math.min(box.height, y - box.top - gap + inset),
        panel,
        0.9
      ),
      left: box.left,
      top: box.top,
      width: box.width,
      height: Math.min(box.height, y - box.top - gap + inset),
      role: "copy-backing",
    });
  return { layers, foreground, regions };
}

export async function compositePreservedCreative(
  background: Buffer,
  composition: Awaited<ReturnType<typeof preparePreservedComposition>>
) {
  // All foreground pixels are added once, after the final AI call. The copy,
  // logo and product regions are disjoint; the model cannot move them.
  return sharp(background, { limitInputPixels: 16_000_000 })
    .composite(
      [...composition.foreground, ...composition.layers].map(
        ({ png, left, top }) => ({
          input: png,
          left,
          top,
          blend: "over" as const,
        })
      )
    )
    .png()
    .toBuffer();
}
