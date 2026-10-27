// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { googleChangeSchema } from "@shared/googleCampaigns";
import {
  GoogleValidationProvider,
  googleIssuePresentation,
} from "./GoogleValidation";
import { Field, ResourcePicker } from "./GoogleCampaignFields";
vi.mock("@/lib/trpc", () => ({
  trpc: {
    googleAds: { campaigns: { resources: { useQuery: () => ({ data: [] }) } } },
  },
}));
afterEach(cleanup);
it("associates inline errors with the actual field and retains existing descriptions", () => {
  render(
    <GoogleValidationProvider
      issues={[
        { path: ["dailyBudget"], message: "Enter a positive daily budget." },
      ]}
    >
      <Field path="dailyBudget" title="Daily budget">
        <input aria-describedby="budget-help" />
      </Field>
    </GoogleValidationProvider>
  );
  const input = screen.getByRole("textbox");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const ids = input.getAttribute("aria-describedby")!.split(" ");
  expect(ids[0]).toBe("budget-help");
  expect(document.getElementById(ids[1])?.textContent).toBe(
    "Enter a positive daily budget."
  );
  expect(input.getAttribute("data-google-field")).toBe("dailyBudget");
});
it("clears fixed errors and infers the existing ad field path", () => {
  const view = render(
    <GoogleValidationProvider
      issues={[
        { path: ["ad", "finalUrl"], message: "Enter an HTTPS landing page." },
      ]}
    >
      <Field title="Landing page">
        <input data-google-field="ad.finalUrl" />
      </Field>
    </GoogleValidationProvider>
  );
  expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
  view.rerender(
    <GoogleValidationProvider issues={[]}>
      <Field title="Landing page">
        <input data-google-field="ad.finalUrl" />
      </Field>
    </GoogleValidationProvider>
  );
  expect(screen.getByRole("textbox").hasAttribute("aria-invalid")).toBe(false);
  expect(screen.queryByRole("alert")).toBeNull();
});
it("targets location picker with its error rather than the search textbox", () => {
  render(
    <GoogleValidationProvider
      issues={[{ path: ["locationIds"], message: "Choose a location." }]}
    >
      <ResourcePicker
        organizationId={3}
        connectionId="test"
        kind="locations"
        title="Locations"
        value={[]}
        onChange={() => {}}
      />
    </GoogleValidationProvider>
  );
  const select = screen.getByRole("combobox");
  expect(select.getAttribute("data-google-field")).toBe("locationIds");
  expect(select.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(select.getAttribute("aria-describedby")!)
      ?.textContent
  ).toBe("Choose a location.");
});
it("routes nested copy and bid errors to precise editable sections", () => {
  expect(
    googleIssuePresentation({
      path: ["ad", "headlines", 2],
      message: "Too long",
    })
  ).toMatchObject({
    field: "ad.headlines",
    label: "Short headlines",
    section: "copy",
  });
  expect(
    googleIssuePresentation({ path: [], message: "Enter a bid target." })
  ).toMatchObject({ field: "bidding.target", section: "settings" });
  expect(
    googleIssuePresentation({
      path: ["keywords", 0, "text"],
      message: "Missing",
    })
  ).toMatchObject({ field: "keywords", section: "options" });
});
it("reports only missing Display marketing images when a business name and logo exist", () => {
  const result = googleChangeSchema.safeParse({
    kind: "campaign_create",
    type: "DISPLAY",
    name: "Display campaign",
    dailyBudget: 10,
    bidding: { strategy: "MAXIMIZE_CONVERSIONS" },
    politicalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    locationIds: ["2840"],
    languageIds: ["1000"],
    ad: {
      name: "Display ad",
      finalUrl: "https://example.com",
      businessName: "CLX Gaming",
      headlines: ["Play better"],
      descriptions: ["Discover your next gaming system."],
      longHeadline: "Find your next gaming system",
      assets: [
        { field: "LOGO", source: { kind: "library", key: "creative:95" } },
      ],
    },
  });
  expect(result.success).toBe(false);
  if (result.success) return;
  const issues = result.error.issues;
  expect(issues).toHaveLength(2);
  expect(issues.every(issue => issue.path.join(".") === "ad.assets")).toBe(
    true
  );
  expect(issues.some(issue => /business/i.test(issue.message))).toBe(false);
  for (const issue of issues)
    expect(googleIssuePresentation(issue)).toMatchObject({
      field: "ad.assets",
      section: "creative",
    });
});

it("preserves explicit child validation from shared copy groups", () => {
  render(
    <Field title="Headline">
      <input aria-invalid="true" aria-describedby="copy-error" />
    </Field>
  );
  expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("textbox").getAttribute("aria-describedby")).toBe(
    "copy-error"
  );
});
