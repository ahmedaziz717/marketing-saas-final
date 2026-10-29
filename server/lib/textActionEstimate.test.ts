import { expect, it } from "vitest";
import { estimatedActionCredits } from "../../shared/aiCredits";
import {
  textActionRate,
  textActionForOperation,
} from "../../shared/textActionEstimate";
import type { ProviderRate } from "../../shared/platformAdmin";

const rate: ProviderRate = {
  provider: "openai",
  model: "gpt-5.5",
  kind: "text",
  credits: 1,
  inputPerMillion: 5,
  cachedInputPerMillion: 0.5,
  outputPerMillion: 30,
  perRequestUsd: null,
  billingMode: "cost",
  markupPercent: 100,
  creditValueMicros: 10000,
  estimatedCostMicros: 50000,
  note: "Test rates",
};

it.each([
  ["workflow.assistant", 2],
  ["video.draftPrompt", 5],
  ["channels.draftAssetCopy", 6],
  ["workflow.optimize_copy", 12],
  ["workflows.assistInput", 3],
  ["brand.suggestProfile", 5],
] as const)(
  "quotes %s from its representative token usage",
  (operation, credits) => {
    expect(
      estimatedActionCredits(
        textActionRate(rate, textActionForOperation(operation))
      )
    ).toBe(credits);
  }
);

it("updates estimates with model rates, markup and credit value without changing token rates", () => {
  const changed = {
    ...rate,
    outputPerMillion: 60,
    markupPercent: 50,
    creditValueMicros: 20000,
  };
  const estimated = textActionRate(changed, "video_prompt");
  expect(estimated.estimatedCostMicros).toBe(34000);
  expect(estimatedActionCredits(estimated)).toBe(3);
  expect(estimated.outputPerMillion).toBe(60);
  expect(changed.estimatedCostMicros).toBe(50000);
});

it("retains explicit fallback estimates when token pricing is unavailable", () => {
  expect(
    textActionRate({ ...rate, inputPerMillion: null }, "short_response")
      .estimatedCostMicros
  ).toBe(50000);
});
