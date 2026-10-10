import { describe, expect, it } from "vitest";
import { categorizeGenerationError, selectGenerationSources } from "./lib/generation";

describe("creative generation source safety", () => {
  it("uses raster product and brand sources while excluding SVG inputs", () => {
    const result = selectGenerationSources(
      [
        { storageKey: "brand/logo.svg", mimeType: "image/svg+xml", kind: "brand" },
        { storageKey: "brand/photo.png", mimeType: "image/png", kind: "brand" },
      ],
      [{ storageKey: "catalog/printer.jpg", mimeType: "image/jpeg", kind: "product" }],
    );
    expect(result.supported.map(source => source.storageKey)).toEqual(["catalog/printer.jpg", "brand/photo.png"]);
    expect(result.unsupportedCount).toBe(1);
  });

  it("turns the live 403 source-image failure into safe corrective guidance", () => {
    const result = categorizeGenerationError("HTTP 403: Forbidden for image https://signed.example/logo.svg");
    expect(result.category).toBe("source_image");
    expect(result.userMessage).toContain("PNG, JPEG, or WebP");
    expect(result.userMessage).not.toContain("https://signed.example");
  });

  it("explains direct Sunburst access failures without exposing provider details", () => {
    const result = categorizeGenerationError(
      "GPT Image 2.5 Sunburst request failed (403): model_not_found: account detail"
    );
    expect(result.category).toBe("model_access");
    expect(result.userMessage).toContain("AI generation");
    expect(result.userMessage).not.toMatch(/GPT|Sunburst|OpenAI/i);
    expect(result.userMessage).toContain("owner");
    expect(result.userMessage).not.toContain("account detail");
  });
});
