// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const state = vi.hoisted(() => ({
  role: "owner",
  rename: vi.fn(),
  upload: vi.fn(),
  invalidate: vi.fn(),
  renamed: null as any,
  logos: [
    {
      id: 12,
      name: "Company logo",
      type: "logo",
      status: "approved",
      url: "https://example.test/logo.png",
    },
  ],
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    organizationId: 7,
    organization: { name: "Demo workspace" },
    membership: { role: state.role },
  }),
}));
vi.mock("@/components/BusinessProfileForm", () => ({
  BusinessProfileForm: () => (
    <label>
      Business summary
      <input defaultValue="Our business" />
    </label>
  ),
}));
vi.mock("@/pages/BrandPage", () => ({
  BrandContent: () => (
    <label>
      Brand voice
      <input defaultValue="Friendly" />
    </label>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workspace: {
        mine: { invalidate: state.invalidate },
        current: { invalidate: vi.fn() },
      },
      brand: { assets: { invalidate: vi.fn() } },
      assetLibrary: { list: { invalidate: vi.fn() } },
      activity: { list: { invalidate: vi.fn() } },
    }),
    workspace: {
      rename: {
        useMutation: (options: any) => {
          state.renamed = options.onSuccess;
          return { mutate: state.rename, isPending: false };
        },
      },
    },
    brand: {
      assets: { useQuery: () => ({ data: state.logos }) },
      uploadAsset: {
        useMutation: () => ({ mutate: state.upload, isPending: false }),
      },
    },
  },
}));
import { CompanyBrandSettings } from "./CompanyBrandSettings";
const setup = (path = "/app/brand") => {
  const location = memoryLocation({ path });
  const view = render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <CompanyBrandSettings />
    </Router>
  );
  return { ...view, location };
};
beforeEach(() => {
  vi.clearAllMocks();
  state.role = "owner";
});
afterEach(cleanup);

it("shows the saved logo and saves a workspace name with an immediate switcher refresh", async () => {
  setup();
  expect(
    screen.getByRole("img", { name: "Company logo" }).getAttribute("src")
  ).toBe("https://example.test/logo.png");
  expect(
    (screen.getByRole("button", { name: "Save name" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Workspace name"), {
    target: { value: "  New workspace  " },
  });
  fireEvent.submit(screen.getByLabelText("Workspace name").closest("form")!);
  expect(state.rename).toHaveBeenCalledWith({
    organizationId: 7,
    name: "New workspace",
  });
  await state.renamed();
  expect(state.invalidate).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("link", { name: /Manage logos/ }).getAttribute("href")
  ).toContain("asset=asset%3A12");
});

it("keeps unsaved profile and brand edits when switching tabs", () => {
  setup();
  fireEvent.change(screen.getByLabelText("Business summary"), {
    target: { value: "New summary" },
  });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Brand identity" }), {
    button: 0,
  });
  expect(
    screen
      .getByRole("tab", { name: "Brand identity" })
      .getAttribute("aria-selected")
  ).toBe("true");
  fireEvent.change(screen.getByLabelText("Brand voice"), {
    target: { value: "New voice" },
  });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Business profile" }), {
    button: 0,
  });
  expect(
    (screen.getByLabelText("Business summary") as HTMLInputElement).value
  ).toBe("New summary");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Brand identity" }), {
    button: 0,
  });
  expect((screen.getByLabelText("Brand voice") as HTMLInputElement).value).toBe(
    "New voice"
  );
});

it("uploads only supported logo files through the existing brand asset endpoint", async () => {
  setup();
  const input = screen.getByLabelText("Upload company logo");
  fireEvent.change(input, {
    target: {
      files: [new File(["text"], "notes.txt", { type: "text/plain" })],
    },
  });
  expect(state.upload).not.toHaveBeenCalled();
  fireEvent.change(input, {
    target: {
      files: [
        new File(["example-logo-content"], "logo.png", { type: "image/png" }),
      ],
    },
  });
  await waitFor(() =>
    expect(state.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 7,
        name: "logo.png",
        type: "logo",
        mimeType: "image/png",
        base64: expect.any(String),
      })
    )
  );
});

it("keeps company settings read-only for creators", () => {
  state.role = "creator";
  setup("/app/brand?tab=brand");
  expect(
    (screen.getByLabelText("Workspace name") as HTMLInputElement).disabled
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Save name" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Upload logo" })).toBeNull();
  expect(
    screen
      .getByRole("tab", { name: "Brand identity" })
      .getAttribute("aria-selected")
  ).toBe("true");
});
