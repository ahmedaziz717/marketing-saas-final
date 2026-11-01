vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 10 } }),
}));
// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
const api = vi.hoisted(() => ({
  publication: null as any,
  accounts: [] as any[],
  assets: [] as any[],
  role: "owner",
  composer: vi.fn(),
  connections: vi.fn(),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 42, membership: { role: api.role } }),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/components/google/GoogleCampaignComposer", () => ({
  GoogleCampaignComposer: ({ channelChoices }: any) => {
    const [text, setText] = useState("");
    return (
      <>
        <label>
          Google draft
          <input value={text} onChange={e => setText(e.target.value)} />
        </label>
        {channelChoices}
      </>
    );
  },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channels: {
      connections: {
        useQuery: (scope: any) => {
          api.connections(scope);
          return { data: { items: api.accounts } };
        },
      },
    },
    assetLibrary: { list: { useQuery: () => ({ data: api.assets }) } },
    publishing: { get: { useQuery: () => ({ data: api.publication }) } },
  },
}));
vi.mock("@/components/PublicationComposer", () => ({
  PublicationComposer: (props: any) => {
    api.composer(props);
    const [text, setText] = useState("");
    return (
      <>
        <p>Composer ready</p>
        <label>
          Draft text
          <input value={text} onChange={event => setText(event.target.value)} />
        </label>
        <button onClick={props.onChangeChannel}>Channel</button>
        <button onClick={props.onClose}>Cancel</button>
        <button
          onClick={() =>
            props.onSaved("saved-id", undefined, props.initialChannel, {
              id: "saved-id",
              revision: 1,
              channel: props.initialChannel,
              state: "draft",
              content: { title: "Saved" },
            })
          }
        >
          Save mock draft
        </button>
      </>
    );
  },
  PublicationDetails: ({ onEdit }: any) => (
    <button onClick={onEdit}>Review delivery settings</button>
  ),
  PublicationStatus: () => null,
}));
import ActivationStudioPage from "./ActivationStudioPage";
function setup(query = "") {
  const router = memoryLocation({ path: `/app/activate/studio${query}` });
  return render(
    <Router hook={router.hook} searchHook={router.searchHook}>
      <ActivationStudioPage />
    </Router>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.role = "owner";
  api.publication = null;
  api.accounts = [
    {
      id: "ad",
      channel: "meta_ads",
      name: "Ad account",
      status: "connected",
      expired: false,
      details: { capabilities: ["publish"] },
    },
    {
      id: "page",
      channel: "facebook",
      name: "Page",
      status: "connected",
      expired: false,
      details: { capabilities: ["publish"] },
    },
  ];
  api.assets = [
    {
      key: "asset:1",
      name: "Photo",
      state: "approved",
      purpose: "finished",
      mediaType: "image",
      url: "/photo.png",
    },
  ];
});
afterEach(cleanup);
it("keeps independent Google and Meta drafts while switching within Activation Studio", () => {
  api.accounts.push({
    id: "google",
    channel: "google_ads",
    name: "Google",
    status: "connected",
    details: { capabilities: ["report"] },
  });
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Select Google Ads" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Google draft" }), {
    target: { value: "PMax draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Select Meta Ads" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Draft text" }), {
    target: { value: "Meta draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Channel" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Google Ads" }));
  expect(
    (screen.getByRole("textbox", { name: "Google draft" }) as HTMLInputElement)
      .value
  ).toBe("PMax draft");
  fireEvent.click(screen.getByRole("button", { name: "Select Meta Ads" }));
  expect(
    (screen.getByRole("textbox", { name: "Draft text" }) as HTMLInputElement)
      .value
  ).toBe("Meta draft");
  expect(
    screen.getByRole("heading", { name: /Activation Studio/ })
  ).toBeTruthy();
});
it("only presents connected channels and carries an approved creative into the scoped composer", () => {
  api.accounts = api.accounts.filter(a => a.channel === "meta_ads");
  setup("?asset=asset%3A1");
  expect(screen.queryByRole("button", { name: "Select Facebook" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Select Meta Ads" }));
  expect(api.composer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      studio: true,
      initialChannel: "meta_ads",
      initialAssetKey: "asset:1",
    })
  );
  expect(api.connections).toHaveBeenCalledWith({
    organizationId: 42,
    includeGoogle: true,
  });
});
it("gates unavailable assets and lets the user choose a different creative", () => {
  setup("?asset=draft%3A1");
  expect(
    screen.getByText(/This asset is not approved or available/)
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Select Meta Ads",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    screen
      .getByRole("link", { name: "Open asset in Library" })
      .getAttribute("href")
  ).toContain("view=drafts");
  fireEvent.click(screen.getByRole("button", { name: "Choose another asset" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Facebook" }));
  expect(api.composer).toHaveBeenLastCalledWith(
    expect.objectContaining({ initialAssetKey: undefined })
  );
});
it("routes an awaiting-approval asset to its review tab", () => {
  api.assets[0].state = "needs_review";
  setup("?asset=asset%3A1");
  expect(
    screen
      .getByRole("link", { name: "Open asset in Library" })
      .getAttribute("href")
  ).toContain("view=needs_review");
});
it("offers an incoming video only to the supported organic flow", () => {
  api.assets[0].mediaType = "video";
  setup("?asset=asset%3A1");
  expect(
    (
      screen.getByRole("button", {
        name: "Select Meta Ads",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Select Facebook",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Choose another asset" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Select Meta Ads",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(false);
});
it("omits expired channels and prevents choosing a read-only channel", () => {
  api.accounts[0].expired = true;
  api.accounts[1].details.capabilities = ["read"];
  setup();
  expect(screen.queryByRole("button", { name: "Select Meta Ads" })).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Select Facebook",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
});
it("offers connection setup when no accounts are connected", () => {
  api.accounts = [];
  setup();
  expect(screen.getByText("Connect your first channel")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: /Manage channel connections/ })
      .getAttribute("href")
  ).toBe("/app/settings/integrations");
});
it("does not expose composing controls to a viewer", () => {
  api.role = "viewer";
  setup();
  expect(screen.getByRole("alert").textContent).toContain(
    "creator or publisher role"
  );
  expect(screen.queryByRole("button", { name: "Select Meta Ads" })).toBeNull();
});
it("provides a calendar link if a saved publication no longer exists", () => {
  setup("?publication=missing");
  expect(screen.getByRole("alert").textContent).toContain(
    "no longer available"
  );
  expect(screen.getByRole("link", { name: "Open your calendar" })).toBeTruthy();
});

it("revisits channels without a reset dialog and preserves independent channel drafts", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Select Meta Ads" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Draft text" }), {
    target: { value: "My paid ad" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Channel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Select Facebook" }));
  expect(
    (screen.getByRole("textbox", { name: "Draft text" }) as HTMLInputElement)
      .value
  ).toBe("");
  fireEvent.change(screen.getByRole("textbox", { name: "Draft text" }), {
    target: { value: "My organic post" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Channel" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Meta Ads" }));
  expect(
    (screen.getByRole("textbox", { name: "Draft text" }) as HTMLInputElement)
      .value
  ).toBe("My paid ad");
  fireEvent.click(screen.getByRole("button", { name: "Channel" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Facebook" }));
  expect(
    (screen.getByRole("textbox", { name: "Draft text" }) as HTMLInputElement)
      .value
  ).toBe("My organic post");
});
it("still confirms explicitly discarding unsaved drafts", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Select Meta Ads" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Start new activation" }));
  expect(screen.queryByText("Composer ready")).toBeNull();
  expect(screen.getByRole("button", { name: "Select Meta Ads" })).toBeTruthy();
});
it("preselects a channel and preserves incoming account, ad set and timing context", () => {
  setup(
    "?channel=meta_ads&connection=ad&adset=set-2&plan=7&time=2099-01-01T12:00&timezone=UTC"
  );
  expect(api.composer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      initialChannel: "meta_ads",
      initialConnectionId: "ad",
      initialAdSetId: "set-2",
      initialPlanId: 7,
      initialTime: "2099-01-01T12:00",
      initialTimezone: "UTC",
    })
  );
});
it("opens saved posts in Compose with their content instead of mounting an empty draft first", () => {
  api.publication = {
    id: "saved-id",
    revision: 3,
    channel: "facebook",
    state: "draft",
    content: { title: "Existing" },
  };
  setup("?channel=facebook&publication=saved-id");
  expect(
    api.composer.mock.calls.every(([props]) => props.item?.id === "saved-id")
  ).toBe(true);
  expect(api.composer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      studioEntry: expect.objectContaining({
        section: "copy",
        category: "compose",
      }),
    })
  );
});
it("saving stays in the same mounted editor and preserves local input", () => {
  setup("?channel=facebook");
  fireEvent.change(screen.getByLabelText("Draft text"), {
    target: { value: "Keep my position and text" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save mock draft" }));
  expect(screen.getByLabelText("Draft text")).toHaveProperty(
    "value",
    "Keep my position and text"
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens a scheduled activation in review and still allows explicitly editing its timing", () => {
  api.publication = {
    id: "saved-id",
    revision: 3,
    channel: "facebook",
    state: "scheduled",
    content: { title: "Scheduled post" },
  };
  setup("?publication=saved-id");
  expect(
    screen.getByRole("button", { name: "Review delivery settings" })
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Review delivery settings" })
  );
  expect(
    screen.queryByRole("button", { name: "Review delivery settings" })
  ).toBeNull();
  expect(api.composer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      studioEntry: expect.objectContaining({ section: "delivery" }),
    })
  );
});
