import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { EvokeLoopLogo, MarketingLoop } from "../shared/brand";
import { publicDocument } from "./public/routes";
import { emptyWebsiteProfile, PUBLIC_PATHS } from "../shared/publicWebsite";
const asset = (file: string) =>
  readFileSync("client/public/website/" + file, "utf8");
const primary = asset("evokeloop-wordmark.svg");
const paths = (svg: string) => {
  const $ = load(svg, { xmlMode: true });
  return $("path")
    .map((_i, p) => $(p).attr("d"))
    .get();
};
function luminance(hex: string) {
  const c = hex
    .match(/[a-f0-9]{2}/gi)!
    .map(v => parseInt(v, 16) / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
}
const contrast = (a: string, b: string) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
describe("EvokeLoop source-of-truth brand contract", () => {
  it("preserves the supplied primary SVG byte for byte", () => {
    expect(createHash("sha256").update(primary).digest("hex")).toBe(
      "5d1287ee6c10c0e0fd8751501503baed86bd967176064961bf09ee3908a2e32e"
    );
    expect(primary).not.toMatch(/<script|onload=|<image|<text/i);
  });
  it("only changes approved lettering colors in the reversed wordmark", () => {
    const reversed = asset("evokeloop-wordmark-reversed.svg");
    expect(paths(reversed)).toEqual(paths(primary));
    expect(reversed).toContain("#FFFFFF");
    expect(reversed).toContain("#00B5A7");
    const a = load(primary, { xmlMode: true }),
      b = load(reversed, { xmlMode: true });
    expect(
      a("g")
        .map((_i, g) => a(g).attr("transform") || "")
        .get()
    ).toEqual(
      b("g")
        .map((_i, g) => b(g).attr("transform") || "")
        .get()
    );
  });
  it("reuses the exact connected-oo artwork for symbols and favicon", () => {
    const $ = load(primary, { xmlMode: true });
    const originals = $("#connected-oo path")
      .map((_i, p) => $(p).attr("d"))
      .get();
    expect(originals.length).toBeGreaterThan(0);
    expect(paths(asset("evokeloop-symbol.svg"))).toEqual(originals);
    expect(paths(asset("favicon.svg"))).toEqual(originals);
  });
  it("uses the seven supplied brand colors and accessible button/link pairings", () => {
    const css = asset("brand.css").toLowerCase();
    for (const color of [
      "#0a1c26",
      "#00b5a7",
      "#ffffff",
      "#c7f5ee",
      "#f1f7f7",
      "#526b76",
      "#007f76",
    ])
      expect(css).toContain(color);
    expect(contrast("0A1C26", "00B5A7")).toBeGreaterThan(4.5);
    expect(contrast("007F76", "FFFFFF")).toBeGreaterThan(4.5);
    expect(contrast("526B76", "F1F7F7")).toBeGreaterThan(4.5);
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("animation-play-state: paused");
  });
  it.each(["public", "app"] as const)(
    "renders a closed, semantic four-stage loop with real %s destinations",
    context => {
      const $ = load(
        renderToStaticMarkup(createElement(MarketingLoop, { context }))
      );
      expect(
        $(".loop-stage strong")
          .map((_i, e) => $(e).text())
          .get()
      ).toEqual(["Create", "Activate", "Measure", "Optimize"]);
      expect($(".loop-stage a").length).toBe(4);
      for (const a of $(".loop-stage a").toArray())
        expect($(a).attr("href")).toMatch(
          context === "app" ? /^\/app\// : /^\/product\//
        );
      expect($("figcaption").text()).toContain("Repeat.");
      expect($(".stage-4 small").text()).toBe(
        context === "app" ? "Roadmap" : "Better decisions"
      );
      expect($(".loop-orbit circle").length).toBe(2);
      expect($("input[type=checkbox]").length).toBe(1);
    }
  );
  it("uses real image artwork instead of retyping the custom logo", () => {
    const html = renderToStaticMarkup(createElement(EvokeLoopLogo, {}));
    expect(html).toContain('src="/website/evokeloop-wordmark.svg"');
    expect(html).toContain('alt="EvokeLoop"');
  });
  it.each(PUBLIC_PATHS)(
    "keeps %s public and branded with operator approval tracked separately",
    path => {
      const { html, noindex } = publicDocument(path, emptyWebsiteProfile);
      expect(html).toContain("EvokeLoop");
      expect(html).not.toMatch(/\bFrame\b/);
      expect(html).toContain("family=Manrope");
      expect(html).toContain("/website/brand.css");
      expect(noindex).toBe(true);
      expect(html).not.toContain("googletagmanager");
      if (path === "/product/optimize")
        expect(html).toContain("Your team makes the optimization decisions");
    }
  );
});
