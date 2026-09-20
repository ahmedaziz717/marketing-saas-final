// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AssetReviewActions, type AssetReviewActionsProps } from "./AssetReviewActions";

afterEach(cleanup);
const props = (overrides: Partial<AssetReviewActionsProps> = {}): AssetReviewActionsProps => ({
  state: "draft", canCreate: true, canReview: true, busy: false, note: "",
  onNoteChange: vi.fn(), onSubmit: vi.fn(), onReview: vi.fn(), onComment: vi.fn(), onUploadVersion: vi.fn(), ...overrides,
});
const button = (name: string) => screen.getByRole("button", { name, exact: true }) as HTMLButtonElement;

describe("asset review actions", () => {
  it("shows a disabled Approve on drafts and explains submission", () => {
    const input = props(); render(<AssetReviewActions {...input} />);
    expect(button("Approve").disabled).toBe(true);
    expect(button("Submit for review").disabled).toBe(false);
    expect(button("Approve").getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/This asset is a draft/)).toBeTruthy();
    fireEvent.click(button("Approve")); expect(input.onReview).not.toHaveBeenCalled();
    fireEvent.click(button("Submit for review")); expect(input.onSubmit).toHaveBeenCalledTimes(1);
  });
  it("enables approval after the server returns Needs Review", () => {
    const input = props(); const { rerender } = render(<AssetReviewActions {...input} />);
    rerender(<AssetReviewActions {...input} state="needs_review" />);
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
    expect(button("Approve").disabled).toBe(false);
    fireEvent.click(button("Approve")); expect(input.onReview).toHaveBeenCalledWith("approved");
    expect(button("Upload a new version")).not.toBe(button("Approve"));
  });
  it("requires feedback for changes while permitting rejection", () => {
    const input = props({ state: "needs_review" }); const { rerender } = render(<AssetReviewActions {...input} />);
    expect(button("Request changes").disabled).toBe(true);
    expect(button("Reject").disabled).toBe(false);
    rerender(<AssetReviewActions {...input} note="Use a different headline" />);
    fireEvent.click(button("Request changes")); expect(input.onReview).toHaveBeenCalledWith("changes_requested");
    fireEvent.click(button("Reject")); expect(input.onReview).toHaveBeenCalledWith("rejected");
  });
  it.each(["changes_requested", "rejected"] as const)("requires resubmission for %s", state => {
    render(<AssetReviewActions {...props({ state })} />);
    expect(button("Submit for review").disabled).toBe(false);
    expect(button("Approve").disabled).toBe(true);
  });
  it("explains creator permissions without exposing reviewer actions", () => {
    render(<AssetReviewActions {...props({ canReview: false, state: "needs_review" })} />);
    expect(screen.queryByRole("button", { name: "Approve", exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject", exact: true })).toBeNull();
    expect(screen.getByText(/Only workspace owners/)).toBeTruthy();
  });
  it("lets a reviewer approve a submitted asset but not upload or submit", () => {
    render(<AssetReviewActions {...props({ canCreate: false, state: "needs_review" })} />);
    expect(button("Approve").disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Upload a new version" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });
  it("explains how a reviewer can get a draft submitted", () => {
    render(<AssetReviewActions {...props({ canCreate: false })} />);
    expect(button("Approve").disabled).toBe(true);
    expect(screen.getByText(/must submit this version/)).toBeTruthy();
  });
  it("disables actions during a pending request", () => {
    render(<AssetReviewActions {...props({ state: "needs_review", busy: true, note: "Feedback" })} />);
    screen.getAllByRole("button").forEach(element => expect((element as HTMLButtonElement).disabled).toBe(true));
  });
  it("shows an approved indicator without allowing repeated approval", () => {
    render(<AssetReviewActions {...props({ state: "approved" })} />);
    expect(button("Approved").disabled).toBe(true);
    expect(button("Reject").disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });
  it("keeps notes, comments, and upload actions separate", () => {
    const input = props({ note: "Review note" }); render(<AssetReviewActions {...input} />);
    fireEvent.change(screen.getByLabelText("Review note"), { target: { value: "Updated note" } });
    expect(input.onNoteChange).toHaveBeenCalledWith("Updated note");
    fireEvent.click(button("Add comment")); expect(input.onComment).toHaveBeenCalledTimes(1);
    fireEvent.click(button("Upload a new version")); expect(input.onUploadVersion).toHaveBeenCalledTimes(1);
    expect(input.onReview).not.toHaveBeenCalled();
  });
});
