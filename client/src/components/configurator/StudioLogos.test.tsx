// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LibraryAsset } from "@shared/assetLibrary";
import { StudioLogos } from "./StudioLogos";

vi.mock("wouter", () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
afterEach(cleanup);
const logo: LibraryAsset = {
  key: "asset:4",
  name: "Website logo",
  url: "/logo.png",
  sourceType: "logo",
  mediaType: "image",
  state: "draft",
  revision: "a".repeat(64),
  origin: "uploaded",
  mimeType: "image/png",
  purpose: "source",
  isUgc: false,
  fingerprint: "a".repeat(64),
  parentKey: null,
  createdAtMs: 1,
  reviewedAtMs: null,
  reviewedByUserId: null,
};
function setup(
  overrides: Partial<React.ComponentProps<typeof StudioLogos>> = {}
) {
  const props = {
    assets: [logo],
    role: "owner",
    selectedId: null,
    search: "",
    onChange: vi.fn(),
    onAction: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<StudioLogos {...props} />);
  return props;
}
it("shows an imported draft logo beside No logo without silently approving or selecting it", async () => {
  const props = setup();
  expect(
    screen.getByRole("img", { name: "Website logo" }).getAttribute("src")
  ).toBe("/logo.png");
  expect(screen.getByText("Draft")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Select Website logo",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    screen
      .getByRole("button", { name: "Select No logo" })
      .getAttribute("aria-pressed")
  ).toBe("true");
  expect(props.onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Approve & use logo" }));
  await waitFor(() => expect(props.onChange).toHaveBeenCalledWith(4));
  expect(props.onAction).toHaveBeenCalledWith(logo, "approve");
});
it("lets creators submit a draft but never approve it or select it before approval", async () => {
  const props = setup({ role: "creator" });
  expect(
    screen.queryByRole("button", { name: "Approve & use logo" })
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  await waitFor(() =>
    expect(props.onAction).toHaveBeenCalledWith(logo, "submit")
  );
  expect(props.onChange).not.toHaveBeenCalled();
});
it("keeps the previous selection when approval fails", async () => {
  const props = setup({
    onAction: vi
      .fn()
      .mockRejectedValue(
        new Error("This version changed. Refresh before continuing.")
      ),
  });
  fireEvent.click(screen.getByRole("button", { name: "Approve & use logo" }));
  await screen.findByRole("alert");
  expect(props.onChange).not.toHaveBeenCalled();
});
it("selects approved logos without another approval and filters out non-logo images", () => {
  const props = setup({
    assets: [
      { ...logo, state: "approved" },
      { ...logo, key: "asset:5", name: "Product photo", sourceType: "product" },
    ],
  });
  expect(screen.queryByRole("img", { name: "Product photo" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Select Website logo" }));
  expect(props.onChange).toHaveBeenCalledWith(4);
  expect(props.onAction).not.toHaveBeenCalled();
});
