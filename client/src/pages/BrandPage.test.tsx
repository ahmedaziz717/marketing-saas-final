// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  role: "owner",
  scan: vi.fn(),
  save: vi.fn(),
  kit: {
    name: "Existing brand",
    colors: ["#15141A"],
    fonts: ["Manrope"],
    voice: "Existing voice",
    requiredClaims: "Keep this claim",
    prohibitedContent: "Keep this restriction",
    status: "draft",
    businessProfile: { website: "learnlikethis.com" },
  },
  result: {
    sourceUrl: "https://learnlikethis.com",
    name: "Learn Like This",
    colors: ["#0F414C"],
    fonts: ["Montserrat"],
    voice: "Welcoming and practical.",
    logoUrls: ["https://learnlikethis.com/logo.png"],
    warnings: [] as string[],
  },
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 7, membership: { role: api.role } }),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("wouter", () => ({ useLocation: () => ["/app/brand", vi.fn()] }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/trpc", async () => {
  const React = await import("react");
  return {
    trpc: {
      useUtils: () => ({
        brand: {
          get: { invalidate: async () => {} },
          assets: { invalidate: async () => {} },
        },
        assetLibrary: { list: { invalidate: async () => {} } },
      }),
      brand: {
        get: { useQuery: () => ({ data: api.kit }) },
        scanWebsite: {
          useMutation: (options: any) => {
            const [data, setData] = React.useState<any>(null);
            return {
              data,
              isPending: false,
              reset: () => setData(null),
              mutate: (input: any) => {
                api.scan(input);
                setData(api.result);
                options.onSuccess(api.result);
              },
            };
          },
        },
        update: { useMutation: () => ({ isPending: false, mutate: api.save }) },
      },
      assetLibrary: { list: { useQuery: () => ({ data: [] }) } },
    },
  };
});
import BrandPage from "./BrandPage";
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  api.role = "owner";
  api.result.colors = ["#0F414C"];
  api.result.fonts = ["Montserrat"];
  api.result.voice = "Welcoming and practical.";
});
it("previews a website scan, preserves rules, and saves selected logos only on explicit save", async () => {
  render(<BrandPage />);
  fireEvent.click(screen.getByRole("button", { name: "Scan website" }));
  expect(
    (screen.getByLabelText("Website address") as HTMLInputElement).value
  ).toBe("learnlikethis.com");
  fireEvent.submit(screen.getByLabelText("Website address").closest("form")!);
  expect(api.scan).toHaveBeenCalledWith({
    organizationId: 7,
    website: "learnlikethis.com",
  });
  expect((screen.getByLabelText("Brand name") as HTMLInputElement).value).toBe(
    "Existing brand"
  );
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Use scanned details" }));
  expect((screen.getByLabelText("Brand name") as HTMLInputElement).value).toBe(
    "Learn Like This"
  );
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({
      organizationId: 7,
      name: "Learn Like This",
      colors: ["#0F414C"],
      fonts: ["Montserrat"],
      voice: "Welcoming and practical.",
      requiredClaims: "Keep this claim",
      prohibitedContent: "Keep this restriction",
      websiteLogoUrls: ["https://learnlikethis.com/logo.png"],
      activate: false,
    })
  );
});
it("keeps current colors, fonts and voice when the scan cannot find them", () => {
  api.result.colors = [];
  api.result.fonts = [];
  api.result.voice = "";
  render(<BrandPage />);
  fireEvent.click(screen.getByRole("button", { name: "Scan website" }));
  fireEvent.submit(screen.getByLabelText("Website address").closest("form")!);
  fireEvent.click(screen.getByRole("button", { name: "Use scanned details" }));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({
      colors: ["#15141A"],
      fonts: ["Manrope"],
      voice: "Existing voice",
    })
  );
});
it("does not expose scan or save controls to a creator", () => {
  api.role = "creator";
  render(<BrandPage />);
  expect(screen.queryByRole("button", { name: "Scan website" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
});
it("preserves unsaved brand edits when the shared business profile query refreshes", () => {
  const original = api.kit;
  const view = render(<BrandPage />);
  fireEvent.change(screen.getByLabelText("Brand voice"), {
    target: { value: "My unsaved voice" },
  });
  api.kit = {
    ...api.kit,
    businessProfile: { website: "updated.example.test" },
  };
  view.rerender(<BrandPage />);
  expect(
    (screen.getByLabelText("Brand voice") as HTMLTextAreaElement).value
  ).toBe("My unsaved voice");
  api.kit = original;
});
