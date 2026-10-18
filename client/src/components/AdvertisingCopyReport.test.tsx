// @vitest-environment jsdom
import { changeField } from "@/test/choiceControls";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  mutate: vi.fn(),
  data: undefined as any,
  error: undefined as any,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: { optimization: { copyReport: { useMutation: () => api } } },
}));
vi.mock("./CopyEvidenceResult", () => ({
  CopyEvidenceResult: () => <div>Loaded copy results</div>,
}));
import { AdvertisingCopyReport } from "./AdvertisingCopyReport";
afterEach(cleanup);
beforeEach(() => {
  api.mutate.mockReset();
  api.data = undefined;
  api.error = undefined;
});
const props = {
  organizationId: 7,
  connectionId: "chosen-account",
  range: { since: "2026-10-01", until: "2026-10-07" },
};
it("requires an explicit fetch and submits the account, dates, dimensions and thresholds", () => {
  render(<AdvertisingCopyReport {...props} />);
  expect(api.mutate).not.toHaveBeenCalled();
  changeField(screen.getByLabelText("Copy report objective"), {
    target: { value: "roas" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Analyze copy" }));
  expect(api.mutate).toHaveBeenCalledWith({
    ...props,
    settings: expect.objectContaining({
      objective: "roas",
      dimensions: expect.arrayContaining([
        "emotional_tone",
        "copy_length",
        "offer",
      ]),
      minimumPurchases: 5,
    }),
  });
});
it("hides stale results when comparison settings change", () => {
  api.data = {
    settings: {
      objective: "cpa",
      minimumImpressions: 1000,
      minimumPurchases: 5,
    },
  };
  render(<AdvertisingCopyReport {...props} />);
  expect(screen.getByText("Loaded copy results")).toBeTruthy();
  changeField(screen.getByLabelText("Copy report minimum purchases"), {
    target: { value: "10" },
  });
  expect(screen.queryByText("Loaded copy results")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Settings changed");
});
