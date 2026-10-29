// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  AdCopyWorkspace,
  planCopyAdditions,
  type AdCopyWorkspaceField,
} from "./AdCopyWorkspace";
afterEach(cleanup);
const field = (
  overrides: Partial<AdCopyWorkspaceField> = {}
): AdCopyWorkspaceField => ({
  id: "headlines",
  label: "Headlines",
  singular: "headline",
  characters: 30,
  maximum: 5,
  occupied: 1,
  drafts: [{ id: "manual", text: "Manual copy" }],
  suggestions: ["First", "Second", "Third"],
  ...overrides,
});
const props = () => ({
  busy: false,
  generationKey: "generation-1",
  onEditSuggestion: vi.fn(),
  onAdd: vi.fn(),
  onEditDraft: vi.fn(),
  onRemoveDraft: vi.fn(),
  onWrite: vi.fn(),
});

it("adds selected suggestions in proposal order, preserves manual copy and clears selection", () => {
  const handlers = props();
  render(<AdCopyWorkspace {...handlers} fields={[field()]} />);
  fireEvent.click(screen.getByLabelText("Select headline suggestion 3"));
  fireEvent.click(screen.getByLabelText("Select headline suggestion 1"));
  fireEvent.click(screen.getByRole("button", { name: "Add selected (2)" }));
  expect(handlers.onAdd).toHaveBeenCalledWith("headlines", ["First", "Third"]);
  expect(screen.getByDisplayValue("Manual copy")).toBeTruthy();
  expect(
    (screen.getByLabelText("Select headline suggestion 1") as HTMLInputElement)
      .checked
  ).toBe(false);
  expect(screen.getByRole("status").textContent).toContain(
    "Existing draft copy was kept"
  );
  expect(handlers.onEditDraft).not.toHaveBeenCalled();
});

it("fills only remaining slots and reports invalid, duplicate and full suggestions", () => {
  const handlers = props();
  render(
    <AdCopyWorkspace
      {...handlers}
      fields={[
        field({
          occupied: 4,
          suggestions: [
            " manual COPY ",
            "",
            "x".repeat(31),
            "Fits",
            "Fits",
            "Too late",
          ],
        }),
      ]}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Add all that fit" }));
  expect(handlers.onAdd).toHaveBeenCalledWith("headlines", ["Fits"]);
  expect(screen.getByRole("status").textContent).toContain(
    "2 empty or over limit, 2 duplicate, 1 with no remaining slot"
  );
  expect(
    screen.getByText("Over 30 characters; shorten before adding.")
  ).toBeTruthy();
});

it.each([1, 5, 15])(
  "uses adapter capacity %s without hardcoded channel counts",
  maximum => {
    const result = planCopyAdditions(
      field({ maximum, occupied: maximum - 1 }),
      [2, 1, 0]
    );
    expect(result.texts).toEqual(["First"]);
    expect(result.skipped.full).toBe(2);
  }
);

it("never calls an append callback when all slots are full", () => {
  const handlers = props();
  render(<AdCopyWorkspace {...handlers} fields={[field({ occupied: 5 })]} />);
  fireEvent.click(screen.getByRole("button", { name: "Add all that fit" }));
  expect(handlers.onAdd).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain(
    "3 with no remaining slot"
  );
});

it("resets checked proposals on regeneration or changed context", () => {
  const handlers = props();
  const { rerender } = render(
    <AdCopyWorkspace {...handlers} fields={[field()]} />
  );
  fireEvent.click(screen.getByLabelText("Select headline suggestion 1"));
  rerender(
    <AdCopyWorkspace
      {...handlers}
      generationKey="generation-2"
      fields={[field({ suggestions: ["Different"] })]}
    />
  );
  expect(
    (screen.getByLabelText("Select headline suggestion 1") as HTMLInputElement)
      .checked
  ).toBe(false);
  expect(
    (screen.getByRole("button", { name: "Add selected" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  expect(handlers.onAdd).not.toHaveBeenCalled();
});

it("disables proposal mutations during generation but allows manual draft editing", () => {
  const handlers = props();
  render(
    <AdCopyWorkspace
      {...handlers}
      busy
      fields={[field()]}
      onRegenerate={vi.fn()}
    />
  );
  expect(
    (screen.getByLabelText("Select headline suggestion 1") as HTMLInputElement)
      .disabled
  ).toBe(true);
  expect(
    (screen.getByLabelText("Headlines suggestion 1") as HTMLTextAreaElement)
      .disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Add all that fit" }));
  expect(handlers.onAdd).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Headlines 1"), {
    target: { value: "Manual edit during generation" },
  });
  expect(handlers.onEditDraft).toHaveBeenCalledWith(
    "headlines",
    "manual",
    "Manual edit during generation"
  );
});

it("exposes manual editing, writing and removal while keeping remote rows read-only", () => {
  const handlers = props();
  render(
    <AdCopyWorkspace
      {...handlers}
      fields={[
        field({
          drafts: [
            { id: "kept", text: "Existing channel text", readOnly: true },
            { id: "manual", text: "Manual copy" },
          ],
          occupied: 2,
        }),
      ]}
    />
  );
  expect(
    (screen.getByDisplayValue("Existing channel text") as HTMLTextAreaElement)
      .readOnly
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Remove draft headline 1" })
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove draft headline 2" })
  );
  expect(handlers.onRemoveDraft).toHaveBeenCalledWith("headlines", "manual");
  fireEvent.click(screen.getByRole("button", { name: "Write headline" }));
  expect(handlers.onWrite).toHaveBeenCalledWith("headlines");
});

it("keeps field-level selection and draft errors independent", () => {
  const handlers = props();
  render(
    <AdCopyWorkspace
      {...handlers}
      fields={[
        field(),
        field({
          id: "descriptions",
          label: "Descriptions",
          singular: "description",
          characters: 90,
          invalid: true,
          errorId: "description-error",
          validationPath: "ad.descriptions",
          error: <p id="description-error">Add another description.</p>,
        }),
      ]}
    />
  );
  fireEvent.click(screen.getByLabelText("Select description suggestion 1"));
  const region = screen.getByRole("region", {
    name: "Descriptions AI suggestions",
  });
  fireEvent.click(
    within(region).getByRole("button", { name: "Add selected (1)" })
  );
  expect(handlers.onAdd).toHaveBeenCalledWith("descriptions", ["First"]);
  expect(
    screen.getByLabelText("Descriptions 1").getAttribute("aria-invalid")
  ).toBe("true");
  expect(
    screen.getByLabelText("Descriptions 1").getAttribute("aria-describedby")
  ).toContain("description-error");
  expect(
    screen
      .getByText("Add another description.")
      .closest("[data-google-field]")
      ?.getAttribute("data-google-field")
  ).toBe("ad.descriptions");
});

it("repeated acceptance cannot duplicate text once the adapter updates draft state", () => {
  function Stateful() {
    const [drafts, setDrafts] = useState([
      { id: "manual", text: "Manual copy" },
    ]);
    return (
      <AdCopyWorkspace
        {...props()}
        fields={[field({ drafts, occupied: drafts.length })]}
        onAdd={(_, texts) =>
          setDrafts(old => [...old, ...texts.map(text => ({ id: text, text }))])
        }
      />
    );
  }
  render(<Stateful />);
  fireEvent.click(screen.getByRole("button", { name: "Add all that fit" }));
  fireEvent.click(screen.getByRole("button", { name: "Add all that fit" }));
  expect(screen.getByRole("status").textContent).toContain("0 headlines added");
  expect(screen.getByRole("status").textContent).toContain("3 duplicate");
});
