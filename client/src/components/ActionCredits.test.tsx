// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/trpc", () => ({
  trpc: {
    models: {
      credits: {
        useQuery: () => ({
          data: {
            textEstimate: 5,
            textEstimates: {
              standard: 5,
              short_response: 2,
              video_prompt: 5,
              ad_copy: 6,
              copy_optimization: 12,
              field_assistance: 3,
            },
          },
        }),
      },
    },
  },
}));
import { ActionCredits } from "./ActionCredits";
afterEach(cleanup);
it.each([
  ["workflow.assistant", 2],
  ["video.draftPrompt", 5],
  ["channels.draftAssetCopy", 6],
  ["workflow.optimize_copy", 12],
] as const)("shows the quoted estimate for %s", (operation, credits) => {
  render(<ActionCredits organizationId={1} operation={operation} />);
  expect(screen.getByText(`≈ ${credits} credits`)).toBeTruthy();
});
