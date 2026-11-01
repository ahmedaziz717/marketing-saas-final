// @vitest-environment jsdom
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observable } from "@trpc/server/observable";
import { trpc } from "@/lib/trpc";
import { contentSchema, type Channel } from "@shared/channels";
import { StudioCopyComposer } from "./StudioCopyComposer";
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: "owner" } }),
}));
vi.mock("@/hooks/usePromptDefaults", async () => {
  const { PROMPT_REGISTRY } = await import("@shared/promptRegistry");
  const data = PROMPT_REGISTRY.map(p => ({
    ...p,
    value: p.baseline,
    revision: 0,
    source: "system",
  }));
  return { usePromptDefaults: () => ({ data }), announcePromptChange: vi.fn() };
});
vi.mock("../ActionCredits", () => ({ ActionCredits: () => null }));
const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const options = Array.from({ length: 5 }, (_, i) => ({
  message: `Caption ${i + 1}`,
  headline: `Headline ${i + 1}`,
  description: `Description ${i + 1}`,
}));
let requests: { input: any; observer: any }[] = [];
afterEach(() => {
  cleanup();
  requests = [];
  vi.clearAllMocks();
});
function setup(
  channel: Channel = "facebook",
  initial: Record<string, unknown> = {}
) {
  const client = trpc.createClient({
    links: [
      () =>
        ({ op }) =>
          observable(observer => {
            requests.push({ input: op.input, observer });
          }),
    ],
  });
  const query = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function Harness() {
    const [content, onChange] = useState(
      contentSchema.parse({
        title: "Draft",
        promotion: {
          offer: "Membership",
          audience: "Designers",
          goal: "Signups",
        },
        copyDirection: { messaging_style: ["playful"] },
        copyInstructions: "Only verified claims",
        ...initial,
      })
    );
    const [shown, setShown] = useState(true);
    return (
      <trpc.Provider client={client} queryClient={query}>
        <QueryClientProvider client={query}>
          {shown && (
            <StudioCopyComposer
              organizationId={1}
              channel={channel}
              assetKeys={[]}
              hasMedia
              content={content}
              onChange={onChange}
              errors={{}}
              onEditChoices={() =>
                onChange({
                  ...content,
                  copyDirection: { messaging_style: ["educational"] },
                })
              }
              onEditBrief={() => {}}
              preview={<p>{content.message}</p>}
            />
          )}
          <button onClick={() => setShown(!shown)}>Toggle composer</button>
          <output data-testid="copy">{JSON.stringify(content)}</output>
        </QueryClientProvider>
      </trpc.Provider>
    );
  }
  return render(<Harness />);
}
const current = () => JSON.parse(screen.getByTestId("copy").textContent!);
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}
async function respond(data = options) {
  await act(async () => {
    const request = requests.at(-1)!;
    request.observer.next({ result: { data: { options: data } } });
    request.observer.complete();
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("region", { name: "Compose copy" })
        .getAttribute("aria-busy")
    ).toBe("false")
  );
}
it("fills social caption immediately, preserves links, saves alternatives and restores them after navigation", async () => {
  setup("facebook", {
    message: "Old caption https://example.com",
    copyDefaultInstructions: "My saved copy task instructions",
  });
  await click("Regenerate copy");
  expect(requests[0].input).toMatchObject({
    channel: "facebook",
    defaultInstructions: "My saved copy task instructions",
    direction: "Only verified claims",
    copyDirection: { messaging_style: ["playful"] },
    promotion: { offer: "Membership", audience: "Designers", goal: "Signups" },
  });
  await respond();
  expect(current().copyDefaultInstructions).toBe(
    "My saved copy task instructions"
  );
  expect(current().message).toContain("Caption 1");
  expect(current().message).toContain("https://example.com");
  expect(current().headline).toBe("");
  expect(current().textVariants).toBeUndefined();
  expect(current().copyAlternatives).toHaveLength(4);
  expect(screen.getByLabelText("Post caption")).toHaveProperty(
    "value",
    current().message
  );
  await click("Toggle composer");
  await click("Toggle composer");
  fireEvent.click(screen.getByText("Other AI versions (4)"));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Apply this version" })[0]
  );
  expect(current().message).toContain("Caption 2");
  expect(current().message).toContain("https://example.com");
});
it("stages Meta suggestions in the unified editor and adds only explicitly selected copy", async () => {
  setup("meta_ads", {
    message: "Manual primary",
    headline: "Manual headline",
    description: "Manual description",
  });
  await click("Generate copy");
  await respond();
  expect(current()).toMatchObject({
    message: "Manual primary",
    headline: "Manual headline",
    description: "Manual description",
  });
  expect(
    screen.getByRole("region", { name: "Primary text AI suggestions" })
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select primary text suggestion 1" })
  );
  await click("Add selected (1)");
  expect(current()).toMatchObject({
    message: "Manual primary",
    headline: "Manual headline",
    description: "Manual description",
    textVariants: { messages: ["Caption 1"] },
  });
  expect(screen.getByDisplayValue("Manual primary")).toBeTruthy();
});
it("keeps text when directions change and shows the warning after reopening", async () => {
  setup();
  await click("Create copy with AI");
  await respond();
  await click("Edit choices");
  expect(screen.getByText(/Your directions changed/)).toBeTruthy();
  expect(current().message).toBe("Caption 1");
  await click("Toggle composer");
  await click("Toggle composer");
  expect(screen.getByText(/Your directions changed/)).toBeTruthy();
  await click("Regenerate copy");
  await respond();
  expect(screen.queryByText(/Your directions changed/)).toBeNull();
});
it("rejects stale AI results after a manual edit and preserves copy on failure", async () => {
  setup();
  await click("Create copy with AI");
  fireEvent.change(screen.getByLabelText("Post caption"), {
    target: { value: "My edit" },
  });
  await respond();
  expect(current().message).toBe("My edit");
  expect(toast.info).toHaveBeenCalledOnce();
  await click("Regenerate copy");
  await act(async () => {
    requests.at(-1)!.observer.error(new Error("Provider failed"));
  });
  expect(current().message).toBe("My edit");
  expect(toast.error).toHaveBeenCalled();
});
it("preserves saved Meta variants and only fills the remaining copy slots", async () => {
  setup("meta_ads", {
    message: "Saved text",
    textVariants: {
      messages: ["Alternative text"],
      headlines: [],
      descriptions: [],
    },
  });
  expect(screen.getByDisplayValue("Alternative text")).toBeTruthy();
  await click("Generate copy");
  await respond();
  expect(current().textVariants.messages).toEqual(["Alternative text"]);
  await click("Add all that fit");
  expect(current().message).toBe("Saved text");
  expect(current().textVariants.messages).toEqual([
    "Alternative text",
    "Caption 1",
    "Caption 2",
    "Caption 3",
  ]);
});
it("rejects stale Meta generation after editing the draft or direction", async () => {
  setup("meta_ads", {
    message: "Manual copy",
    copyDefaultInstructions: "Use verified facts",
  });
  await click("Generate copy");
  expect(requests.at(-1)!.input.defaultInstructions).toBe("Use verified facts");
  fireEvent.change(screen.getByLabelText("Primary text 1"), {
    target: { value: "Edited copy" },
  });
  await respond();
  expect(current().message).toBe("Edited copy");
  expect(screen.queryByLabelText("Primary text suggestion 1")).toBeNull();
  await click("Generate copy");
  await click("Edit choices");
  await respond();
  expect(current().message).toBe("Edited copy");
  expect(screen.queryByLabelText("Primary text suggestion 1")).toBeNull();
});

it("retains saved Meta direction warnings and old alternatives as read-only reference", async () => {
  setup("meta_ads", {
    message: "Keep this",
    copyGenerationContext: "older-context",
    copyAlternatives: [options[0]],
  });
  expect(
    screen.getByText(/Your directions changed since this draft/)
  ).toBeTruthy();
  fireEvent.click(screen.getByText("Previously saved AI alternatives"));
  expect(screen.getByText("Caption 1")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Apply this version" })
  ).toBeNull();
  expect(current().message).toBe("Keep this");
});
