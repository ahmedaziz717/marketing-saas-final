import * as cheerio from "cheerio";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { marketingJson } from "./marketingDrafts";
import { extractPageEvidence, safeFetchText, sameSite } from "./websiteCrawler";

function publicLink(value: unknown, base: string) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value, base);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
const genericFont =
  /^(inherit|initial|unset|sans-serif|serif|system-ui|monospace|cursive|fantasy|Arial|Helvetica|Times New Roman|-apple-system|BlinkMacSystemFont|Segoe UI)$/i;
export function brandStyleEvidence(css: string) {
  const colors = new Map<string, number>(),
    fonts = new Map<string, number>();
  const add = (map: Map<string, number>, value: string, score: number) =>
    map.set(value, (map.get(value) ?? 0) + score);
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of Array.from(clean.matchAll(/([^{}]+)\{([^{}]*)\}/g))) {
    const selector = block[1],
      body = block[2];
    const weight = /brand|header|site-logo|^\s*(?:body|:root|h1)\b/i.test(
      selector
    )
      ? 5
      : 1;
    for (const declaration of body.split(";")) {
      const match = declaration.match(/^\s*([\w-]+)\s*:\s*([\s\S]+)$/);
      if (!match) continue;
      const [, property, value] = match;
      if (/color|background|border|fill|stroke|^--/i.test(property)) {
        const priority =
          weight *
          (/^--.*(?:brand|primary|secondary|accent)/i.test(property) ? 8 : 1);
        const tokens =
          value.match(/#[\da-f]{6}\b|#[\da-f]{3}\b|rgba?\([^)]*\)/gi) ?? [];
        for (let token of tokens) {
          if (token.startsWith("rgb")) {
            const channels = token.match(/[\d.]+/g)?.map(Number) ?? [];
            if (
              channels.length < 3 ||
              channels.slice(0, 3).some(n => n > 255) ||
              /%/.test(token) ||
              (channels.length === 4 && channels[3] < 1)
            )
              continue;
            token =
              "#" +
              channels
                .slice(0, 3)
                .map(n => Math.round(n).toString(16).padStart(2, "0"))
                .join("");
          }
          if (token.length === 4)
            token =
              "#" +
              token
                .slice(1)
                .split("")
                .map(c => c + c)
                .join("");
          add(colors, token.toUpperCase(), priority);
        }
      }
      if (property === "font-family" || /^--.*font.*family/i.test(property)) {
        const first = value
          .replace(/!important/g, "")
          .split(",")[0]
          .trim()
          .replace(/["']/g, "");
        if (
          first &&
          first.length <= 80 &&
          !genericFont.test(first) &&
          !/var\(|font.?awesome|icons|dashicons/i.test(first)
        )
          add(fonts, first, weight);
      }
    }
  }
  const rank = (map: Map<string, number>) =>
    Array.from(map)
      .sort((a, b) => b[1] - a[1])
      .map(([value]) => value);
  return { colors: rank(colors).slice(0, 10), fonts: rank(fonts).slice(0, 5) };
}

export function extractBrandWebsiteEvidence(
  html: string,
  url: string,
  linkedStyles = ""
) {
  const $ = cheerio.load(html),
    page = extractPageEvidence(html, url);
  const logos: string[] = [],
    names: string[] = [];
  const addLogo = (value: unknown) => {
    const link = publicLink(value, url);
    if (link && !logos.includes(link)) logos.push(link);
  };
  const walk = (node: any, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 15) return;
    if (Array.isArray(node)) {
      node.forEach(n => walk(n, depth + 1));
      return;
    }
    const types = Array.isArray(node["@type"])
      ? node["@type"]
      : [node["@type"]];
    if (
      types.some((t: string) =>
        /^(Organization|WebSite|Corporation|LocalBusiness)$/.test(t)
      ) &&
      (!node.url ||
        (publicLink(node.url, url) &&
          sameSite(publicLink(node.url, url)!, url)))
    ) {
      if (typeof node.name === "string") names.push(node.name);
      const logo = node.logo;
      addLogo(typeof logo === "string" ? logo : logo?.contentUrl || logo?.url);
    }
    if (node["@graph"]) walk(node["@graph"], depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {}
  });
  $("img").each((_, el) => {
    const img = $(el),
      src =
        img.attr("data-src") ||
        img.attr("src") ||
        img.attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0];
    const marker = `${src} ${img.attr("alt")} ${img.attr("class")} ${img.parent().attr("class")}`;
    const brandToken = (names[0] || page.siteName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const namedForBrand =
      brandToken.length >= 5 &&
      String(src)
        .split("/")
        .pop()!
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .includes(brandToken);
    const inBrandArea =
      img.closest(
        "header,nav,[role=banner],.site-branding,.site-logo,.custom-logo-link"
      ).length > 0;
    if (
      /logo|brandmark|wordmark/i.test(marker) &&
      (inBrandArea || namedForBrand || /custom-logo|site-logo/.test(marker))
    )
      addLogo(src);
  });
  const icons = $('link[rel~="icon"],link[rel="apple-touch-icon"]')
    .map((_, el) => publicLink($(el).attr("href"), url))
    .get()
    .filter(Boolean) as string[];
  const styles =
    $("style")
      .map((_, el) => $(el).text())
      .get()
      .join("\n") +
    "\n" +
    $("[style]")
      .map((_, el) => `inline{${$(el).attr("style")}}`)
      .get()
      .join("\n") +
    "\n" +
    linkedStyles;
  const stylesheets = $('link[rel~="stylesheet"][href]')
    .map((_, el) => publicLink($(el).attr("href"), url))
    .get()
    .filter(Boolean) as string[];
  const priority = (u: string) =>
    /themes|fonts.googleapis/i.test(u)
      ? 3
      : /plugins|wp-includes|bootstrap|fontawesome/i.test(u)
        ? -1
        : /brand|custom|global|\/assets\/|\/static\/|\/_next\//i.test(u)
          ? 2
          : 0;
  return {
    name: names[0] || page.siteName || page.title,
    text: page.text,
    description: page.description,
    ...brandStyleEvidence(styles),
    logoUrls: (logos.length ? logos : icons).slice(0, 6),
    iconFallback: !logos.length && !!icons.length,
    stylesheetUrls: Array.from(new Set(stylesheets))
      .sort((a, b) => priority(b) - priority(a))
      .slice(0, 4),
  };
}

const suggestionSchema = z.object({
  name: z.string().max(160),
  voice: z.string().max(4000),
  colors: z.array(z.string()).max(10),
  fonts: z.array(z.string()).max(5),
});
export async function scanBrandWebsite(website: string) {
  const home = await safeFetchText(website);
  if (home.status >= 400 || !/html|^$/.test(home.contentType))
    throw new Error("Website could not be read");
  let evidence = extractBrandWebsiteEvidence(home.text, home.finalUrl);
  const warnings: string[] = [];
  const sheets = await Promise.allSettled(
    evidence.stylesheetUrls.map(url => safeFetchText(url))
  );
  const css = sheets.flatMap(r =>
    r.status === "fulfilled" && r.value.status < 400
      ? [r.value.text.slice(0, 150_000)]
      : []
  );
  if (css.length < sheets.length)
    warnings.push(
      "Some website styles could not be read. Review the detected colors and fonts."
    );
  evidence = extractBrandWebsiteEvidence(
    home.text,
    home.finalUrl,
    css.join("\n")
  );
  let name = evidence.name.slice(0, 160),
    voice = "",
    colors = evidence.colors,
    fonts = evidence.fonts;
  if (evidence.text.length > 80 || evidence.description.length > 80) {
    try {
      const suggestion = await marketingJson(
        "Suggest this website operator's brand identity for review. Return {name, voice, colors, fonts}. Voice is an inferred concise writing guide: tone, audience, vocabulary, and wording to avoid, grounded in the supplied website copy. Distinguish a directory operator from third-party providers. Select only supplied detected color codes and font names; do not invent a palette or fonts. Prefer the actual brand name over SEO titles. Do not add legal claims, guarantees, or marketing promises.",
        {
          ...evidence,
          text: evidence.text.slice(0, 14000),
          stylesheetUrls: undefined,
          logoUrls: undefined,
        },
        suggestionSchema
      );
      name = suggestion.name || name;
      voice = suggestion.voice;
      const matchedColors = suggestion.colors
        .map(c => c.toUpperCase())
        .filter(c => evidence.colors.includes(c));
      const matchedFonts = suggestion.fonts.filter(f =>
        evidence.fonts.includes(f)
      );
      if (matchedColors.length) colors = Array.from(new Set(matchedColors));
      if (matchedFonts.length) fonts = Array.from(new Set(matchedFonts));
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      warnings.push(
        "Visual details were detected, but brand voice could not be suggested. Retry the scan or edit the voice manually."
      );
    }
  } else
    warnings.push(
      "This page exposes very little readable text. Brand voice needs manual review; try a public About page if necessary."
    );
  if (!colors.length)
    warnings.push(
      "No reliable colors were detected; your current palette will be kept."
    );
  if (!fonts.length)
    warnings.push(
      "No font names were detected; your current fonts will be kept."
    );
  if (!evidence.logoUrls.length)
    warnings.push("No logo was detected. You can upload it in Source assets.");
  if (evidence.iconFallback)
    warnings.push(
      "Only site icons were found. Check whether one is suitable as your logo."
    );
  return {
    sourceUrl: home.finalUrl,
    name,
    voice,
    colors,
    fonts,
    logoUrls: evidence.logoUrls,
    warnings,
  };
}
