// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrandPromptContext } from "./BrandPromptContext";
vi.mock("wouter", () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
afterEach(cleanup);
it("renders the exact prepared summary fields without substituting a source excerpt", () => {
  const voice = JSON.stringify({
    identity: "Independent IT provider",
    audience: "Small businesses",
    tone: "Clear and practical",
  });
  const brand = Object.freeze({
    name: "Example",
    voice,
    status: "ready" as const,
    summarized: true,
  });
  render(<BrandPromptContext brand={brand} />);
  expect(
    screen.getByText("Saved summary used for image generation")
  ).toBeTruthy();
  expect(screen.getByText("Independent IT provider")).toBeTruthy();
  expect(screen.getByText("Small businesses")).toBeTruthy();
  expect(screen.getByText("Clear and practical")).toBeTruthy();
  expect(brand.voice).toBe(voice);
});
it("shows a pending state instead of displaying the original long guide", () => {
  render(
    <BrandPromptContext
      brand={{
        name: "Example",
        voice: null,
        status: "pending",
        summarized: true,
      }}
    />
  );
  expect(
    screen.getByText(/No summary is available to preview yet/)
  ).toBeTruthy();
  expect(
    screen.queryByText("Saved summary used for image generation")
  ).toBeNull();
});
it("clears brand context when a different workspace has no brand", () => {
  const view = render(
    <BrandPromptContext
      brand={{
        name: "Private Brand",
        voice: "Private guidance",
        status: "ready",
        summarized: false,
      }}
    />
  );
  view.rerender(<BrandPromptContext brand={null} />);
  expect(screen.queryByText("Private guidance")).toBeNull();
  expect(screen.getByText(/No saved brand voice/)).toBeTruthy();
});
