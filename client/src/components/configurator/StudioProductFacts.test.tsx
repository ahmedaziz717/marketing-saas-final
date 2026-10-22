// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioProductFacts } from "./StudioProductFacts";
afterEach(cleanup);
it("explains stale website facts and previews an API counterpart without silently selecting unapproved claims", () => {
  const change = vi.fn();
  render(
    <StudioProductFacts
      products={[
        {
          id: 1,
          name: "Test PC",
          sku: "pc123",
          provenance: { source: "website" },
          specifications: { Benchmark: "200 FPS" },
          relatedSources: [
            {
              id: 2,
              sourceId: 8,
              name: "Test PC",
              sku: "api-pc123",
              source: "api",
              status: "pending",
              specifications: { Processor: "Core i9", Memory: "96 GB" },
            },
          ],
        },
      ]}
      selections={[]}
      onChange={change}
      onSources={vi.fn()}
    />
  );
  expect(screen.getByText(/WEBSITE/)).toBeTruthy();
  expect(screen.getByText(/API copy available/)).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Review this catalog copy →" })
      .getAttribute("href")
  ).toBe("/app/catalog?sourceId=8&search=api-pc123&status=pending");
  expect(screen.getByText("Core i9")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Feature Processor: Core i9" })
  ).toBeNull();
  expect(change).not.toHaveBeenCalled();
});
