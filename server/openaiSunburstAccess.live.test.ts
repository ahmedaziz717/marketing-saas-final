import { describe, expect, it } from "vitest";

const runLive = process.env.RUN_OPENAI_SUNBURST_LIVE_TEST === "1";
const liveIt = runLive ? it : it.skip;

describe("OpenAI GPT Image 2.5 Sunburst access", () => {
  liveIt(
    "authenticates and exposes the required Sunburst model",
    async () => {
      const apiKey = process.env.OPENAI_API_KEY;
      expect(apiKey, "OPENAI_API_KEY must be configured server-side").toBeTruthy();
      const response = await fetch(
        "https://api.openai.com/v1/models/gpt-image-2.5-sunburst",
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const body = await response.text();
      expect(
        response.status,
        `OpenAI model-access check failed with HTTP ${response.status}: ${body.slice(0, 240)}`
      ).toBe(200);
      expect(JSON.parse(body)).toMatchObject({ id: "gpt-image-2.5-sunburst" });
    },
    30_000
  );
});
