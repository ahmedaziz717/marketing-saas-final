// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ extract: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    brand: {
      extractGuidelines: { useMutation: () => ({ mutateAsync: api.extract }) },
    },
  },
}));
import { BrandGuidelineImport } from "./BrandGuidelineImport";
afterEach(cleanup);
beforeEach(() => {
  api.extract.mockReset();
  api.extract.mockResolvedValue({
    text: "Clear, practical language.",
    pages: 2,
  });
});
async function upload() {
  changeField(screen.getByLabelText("Brand guidelines PDF"), {
    target: {
      files: [
        new File(["%PDF-1.7"], "guidelines.pdf", { type: "application/pdf" }),
      ],
    },
  });
  await screen.findByLabelText("Extracted brand guidelines");
}
it("extracts into an editable preview and applies only after explicit review", async () => {
  const apply = vi.fn();
  render(
    <BrandGuidelineImport
      organizationId={7}
      voice="Our current voice."
      onApply={apply}
    />
  );
  await upload();
  expect(apply).not.toHaveBeenCalled();
  expect(api.extract).toHaveBeenCalledWith(
    expect.objectContaining({
      organizationId: 7,
      mimeType: "application/pdf",
      name: "guidelines.pdf",
    })
  );
  changeField(screen.getByLabelText("Extracted brand guidelines"), {
    target: { value: "Reviewed voice." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Use reviewed text" }));
  expect(apply).toHaveBeenCalledWith("Our current voice.\n\nReviewed voice.");
});
it("lets the user replace instead of append and blocks oversized results", async () => {
  const apply = vi.fn();
  render(
    <BrandGuidelineImport
      organizationId={7}
      voice={"x".repeat(30000)}
      onApply={apply}
    />
  );
  await upload();
  expect(
    (
      screen.getByRole("button", {
        name: "Use reviewed text",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("Shorten");
  changeField(screen.getByLabelText("How to apply PDF text"), {
    target: { value: "replace" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Use reviewed text" }));
  expect(apply).toHaveBeenCalledWith("Clear, practical language.");
});
it("discards imports and reports extraction failures without touching brand voice", async () => {
  const apply = vi.fn();
  render(
    <BrandGuidelineImport organizationId={7} voice="Original" onApply={apply} />
  );
  await upload();
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(screen.queryByLabelText("Extracted brand guidelines")).toBeNull();
  api.extract.mockRejectedValue(new Error("This PDF is password protected."));
  changeField(screen.getByLabelText("Brand guidelines PDF"), {
    target: {
      files: [new File(["%PDF"], "locked.pdf", { type: "application/pdf" })],
    },
  });
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("password")
  );
  expect(apply).not.toHaveBeenCalled();
});
