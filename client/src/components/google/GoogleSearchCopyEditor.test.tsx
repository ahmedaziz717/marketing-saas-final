// @vitest-environment jsdom
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    googleAds: {
      campaigns: {
        draftSearchCopy: {
          useMutation: () => ({ mutateAsync: api.generate, isPending: false }),
        },
      },
    },
  },
}));
import { GoogleSearchCopyEditor } from "./GoogleSearchCopyEditor";
import { GoogleValidationProvider } from "./GoogleValidation";
import {
  googleChangeSchema,
  type GoogleAdContent,
} from "@shared/googleCampaigns";
const initial: GoogleAdContent = {
  name: "Ad",
  finalUrl: "https://example.com",
  headlines: ["Manual headline"],
  descriptions: ["Manual description"],
  assets: [],
  path1: "manual",
  path2: "",
};
const suggestions = {
  headlines: ["Suggested headline", "Another headline"],
  descriptions: ["Suggested description"],
  path1: ["collection"],
  path2: ["details"],
};
function Harness({ start = initial }: { start?: GoogleAdContent }) {
  const [ad, setAd] = useState(start);
  const parsed = googleChangeSchema.safeParse({
    kind: "ad_create",
    campaignId: "1",
    adGroupId: "2",
    type: "SEARCH",
    ad,
  });
  return (
    <GoogleValidationProvider
      issues={parsed.success ? [] : parsed.error.issues}
    >
      <button
        onClick={() =>
          setAd(previous => ({
            ...previous,
            finalUrl: "https://other.example.com",
          }))
        }
      >
        Change URL
      </button>
      <button onClick={() => setAd(JSON.parse(JSON.stringify(ad)))}>
        Reload saved draft
      </button>
      <output data-testid="saved">{JSON.stringify(ad)}</output>
      <GoogleSearchCopyEditor
        organizationId={1}
        connectionId="google"
        ad={ad}
        onChange={setAd}
      />
    </GoogleValidationProvider>
  );
}
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const region = (name: string) => within(screen.getByRole("region", { name }));
beforeEach(() => {
  api.generate.mockReset().mockResolvedValue(suggestions);
});
afterEach(cleanup);
async function generate() {
  click("AI generate all copy");
  await screen.findByDisplayValue("Suggested headline");
}
it("moves selected editable suggestions into correct fields and preserves manually edited copy across save/load", async () => {
  render(<Harness />);
  await generate();
  fireEvent.change(screen.getByLabelText("Headlines suggestion 1"), {
    target: { value: "Edited suggestion" },
  });
  fireEvent.click(screen.getByLabelText("Select headline suggestion 1"));
  fireEvent.click(
    region("Headlines AI suggestions").getByRole("button", {
      name: "Add selected (1)",
    })
  );
  expect(screen.getByLabelText("Headlines 1")).toHaveProperty(
    "value",
    "Manual headline"
  );
  expect(screen.getByLabelText("Headlines 2")).toHaveProperty(
    "value",
    "Edited suggestion"
  );
  fireEvent.click(screen.getByLabelText("Select display path 2 suggestion 1"));
  fireEvent.click(
    region("Display path 2 AI suggestions").getByRole("button", {
      name: "Add selected (1)",
    })
  );
  click("Reload saved draft");
  expect(screen.getByLabelText("Display path 2 1")).toHaveProperty(
    "value",
    "details"
  );
  expect(
    JSON.parse(screen.getByTestId("saved").textContent!).headlines
  ).toEqual(["Manual headline", "Edited suggestion"]);
});
it("requires explicit replacement of populated display paths, supports cancel and rejects stale confirmation", async () => {
  render(<Harness />);
  await generate();
  const path = region("Display path 1 AI suggestions");
  fireEvent.click(screen.getByLabelText("Select display path 1 suggestion 1"));
  fireEvent.click(path.getByRole("button", { name: "Add selected (1)" }));
  expect(screen.getByLabelText("Display path 1 1")).toHaveProperty(
    "value",
    "manual"
  );
  fireEvent.click(path.getByRole("button", { name: "Replace with selected" }));
  click("Cancel");
  fireEvent.click(path.getByRole("button", { name: "Replace with selected" }));
  fireEvent.change(screen.getByLabelText("Display path 1 1"), {
    target: { value: "new-manual" },
  });
  click("Confirm replacement");
  expect(screen.getByLabelText("Display path 1 1")).toHaveProperty(
    "value",
    "new-manual"
  );
  fireEvent.click(path.getByRole("button", { name: "Replace with selected" }));
  click("Confirm replacement");
  expect(screen.getByLabelText("Display path 1 1")).toHaveProperty(
    "value",
    "collection"
  );
});
it("selects all without partial overwrite at capacity and explicitly replaces only that field", async () => {
  render(
    <Harness
      start={{
        ...initial,
        headlines: Array.from({ length: 14 }, (_, i) => `Manual ${i}`),
      }}
    />
  );
  await generate();
  const headlines = region("Headlines AI suggestions");
  fireEvent.click(headlines.getByRole("button", { name: "Select all" }));
  fireEvent.click(headlines.getByRole("button", { name: "Add selected (2)" }));
  expect(
    JSON.parse(screen.getByTestId("saved").textContent!).headlines
  ).toHaveLength(14);
  fireEvent.click(
    headlines.getByRole("button", { name: "Replace with selected" })
  );
  click("Confirm replacement");
  const saved = JSON.parse(screen.getByTestId("saved").textContent!);
  expect(saved.headlines).toEqual(suggestions.headlines);
  expect(saved.descriptions).toEqual(initial.descriptions);
});
it("invalidates suggestions and in-flight responses when the campaign URL changes", async () => {
  render(<Harness />);
  await generate();
  click("Change URL");
  expect(screen.queryByDisplayValue("Suggested headline")).toBeNull();
  expect(screen.getByLabelText("Headlines 1")).toHaveProperty(
    "value",
    "Manual headline"
  );
});
it("keeps manual edits made while generation is running", async () => {
  let resolve!: (copy: typeof suggestions) => void;
  api.generate.mockImplementation(
    () =>
      new Promise(r => {
        resolve = r;
      })
  );
  render(<Harness />);
  click("AI generate all copy");
  fireEvent.change(screen.getByLabelText("Headlines 1"), {
    target: { value: "Latest manual edit" },
  });
  await act(async () => resolve(suggestions));
  expect(screen.getByLabelText("Headlines 1")).toHaveProperty(
    "value",
    "Latest manual edit"
  );
});
it("ignores a late response from the previous URL and retains copy after a generation failure", async () => {
  let resolve!: (copy: typeof suggestions) => void;
  api.generate.mockImplementationOnce(
    () =>
      new Promise(r => {
        resolve = r;
      })
  );
  render(<Harness />);
  click("AI generate all copy");
  click("Change URL");
  await act(async () => resolve(suggestions));
  expect(screen.queryByDisplayValue("Suggested headline")).toBeNull();
  api.generate.mockRejectedValueOnce(
    new Error("The landing page could not be read.")
  );
  click("AI generate all copy");
  await screen.findByText("The landing page could not be read.");
  expect(screen.getByLabelText("Headlines 1")).toHaveProperty(
    "value",
    "Manual headline"
  );
});
it("imports separate lines, updates validation from current values, removes entries and retains over-limit text", async () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("Headlines 1"), {
    target: { value: "First\nSecond\nThird\n" },
  });
  expect(screen.getByLabelText("Headlines 3")).toHaveProperty("value", "Third");
  expect(screen.queryByText("Search needs 3–15 headlines.")).toBeNull();
  fireEvent.change(screen.getByLabelText("Descriptions 1"), {
    target: { value: "First description\nSecond description" },
  });
  await waitFor(() =>
    expect(screen.queryByText("Search needs 2–4 descriptions.")).toBeNull()
  );
  fireEvent.change(screen.getByLabelText("Headlines 1"), {
    target: { value: "x".repeat(31) },
  });
  expect(screen.getByLabelText("Headlines 1")).toHaveProperty(
    "value",
    "x".repeat(31)
  );
  click("Remove draft headline 1");
  expect(screen.getByText("Search needs 3–15 headlines.")).toBeTruthy();
});
it("does not generate from a missing URL", () => {
  render(<Harness start={{ ...initial, finalUrl: "" }} />);
  click("AI generate all copy");
  expect(api.generate).not.toHaveBeenCalled();
  expect(screen.getByText(/Add a public HTTPS landing page/)).toBeTruthy();
});
