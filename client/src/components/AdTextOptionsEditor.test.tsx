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
import { AdTextOptionsEditor } from "./AdTextOptionsEditor";
import { copyContentFromSets, type CopyContent } from "@shared/adCopy";
vi.mock("./ActionCredits", () => ({ ActionCredits: () => null }));
const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const options = Array.from({ length: 5 }, (_, i) => ({
  message: `Text ${i + 1}`,
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
  initial: CopyContent = { message: "", headline: "", description: "" }
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
  function Harness({
    assetKey = "asset:1",
    copyDirection,
    promotion,
    generationTarget,
    instructions,
    onGenerated,
  }: {
    generationTarget?: HTMLElement | null;
    instructions?: string;
    onGenerated?: () => void;
    assetKey?: string;
    copyDirection?: { messaging_style?: string[] };
    promotion?: { offer: string; audience: string; goal: string };
  }) {
    const [value, setValue] = useState(initial);
    return (
      <trpc.Provider client={client} queryClient={query}>
        <QueryClientProvider client={query}>
          <AdTextOptionsEditor
            generationTarget={generationTarget}
            instructions={instructions}
            onGenerated={onGenerated}
            organizationId={1}
            assetKeys={assetKey ? [assetKey] : []}
            copyDirection={copyDirection}
            promotion={promotion}
            callToAction="SIGN_UP"
            value={value}
            onChange={setValue}
          />
          <output data-testid="copy">{JSON.stringify(value)}</output>
        </QueryClientProvider>
      </trpc.Provider>
    );
  }
  const rendered = render(<Harness />);
  return { ...rendered, Harness };
}
const current = () => JSON.parse(screen.getByTestId("copy").textContent!);
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}
async function respond(options: unknown[]) {
  const request = requests.at(-1)!;
  await act(async () => {
    request.observer.next({ result: { data: { options } } });
    request.observer.complete();
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("region", { name: "Ad copy options" })
        .getAttribute("aria-busy")
    ).toBe("false")
  );
}
async function tab(name: RegExp) {
  await act(async () => {
    fireEvent.mouseDown(screen.getByRole("tab", { name }), {
      button: 0,
      ctrlKey: false,
    });
  });
}
it("stages generated suggestions and adds selected copy without replacing manual fields", async () => {
  const initial = {
    message: "Manual primary",
    headline: "Manual headline",
    description: "Manual description",
  };
  setup(initial);
  await click("Generate copy");
  await respond(options);
  expect(current()).toEqual(initial);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select primary text suggestion 2" })
  );
  await click("Add selected (1)");
  expect(current()).toMatchObject({
    ...initial,
    textVariants: { messages: ["Text 2"], headlines: [], descriptions: [] },
  });
  expect(
    screen.getByRole("checkbox", { name: "Select primary text suggestion 2" })
  ).toHaveProperty("checked", false);
});
it("adds only remaining slots, skips duplicates, and preserves other Meta fields", async () => {
  const initial = copyContentFromSets(options.slice(0, 4));
  setup(initial);
  await click("Generate copy");
  await respond(options);
  await click("Add all that fit");
  expect(current().textVariants.messages).toEqual([
    "Text 2",
    "Text 3",
    "Text 4",
    "Text 5",
  ]);
  expect(current().headline).toBe(initial.headline);
  expect(current().textVariants.headlines).toEqual(
    initial.textVariants?.headlines
  );
  await click("Add all that fit");
  expect(current().textVariants.messages).toHaveLength(4);
});
it("regenerates one proposed headline without changing any draft values", async () => {
  const initial = copyContentFromSets(options);
  setup(initial);
  await click("Generate copy");
  await respond(options);
  await tab(/Headline/);
  await click("Regenerate headline suggestion 3");
  expect(requests.at(-1)!.input.regeneration).toEqual({
    index: 2,
    field: "headline",
  });
  await respond([
    {
      ...options[2],
      message: "Must not overwrite",
      headline: "Fresh third headline",
    },
  ]);
  expect(current()).toEqual(initial);
  expect(screen.getByDisplayValue("Fresh third headline")).toBeTruthy();
});
it("discards delayed results after manual edits or image selection changes", async () => {
  const initial = copyContentFromSets(options);
  const view = setup(initial);
  await click("Generate copy");
  fireEvent.change(screen.getByLabelText("Primary text 1"), {
    target: { value: "My manual edit" },
  });
  await respond(options);
  expect(current().message).toBe("My manual edit");
  expect(toast.info).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("Primary text suggestion 1")).toBeNull();
  await click("Generate copy");
  view.rerender(<view.Harness assetKey="asset:2" />);
  await respond(options);
  expect(current().message).toBe("My manual edit");
  expect(toast.info).toHaveBeenCalledTimes(2);
});
it("protects manual edits during a repeat generation with existing suggestions", async () => {
  setup();
  await click("Generate copy");
  await respond(options);
  await click("Regenerate");
  fireEvent.change(screen.getByLabelText("Primary text 1"), {
    target: { value: "My latest edit" },
  });
  await respond(options.map(o => ({ ...o, message: "New result" })));
  expect(current().message).toBe("My latest edit");
  expect(screen.queryByDisplayValue("New result")).toBeNull();
  expect(
    screen.getByText(/Your draft changed while copy was generating/)
  ).toBeTruthy();
});
it("keeps copy on failure and prevents duplicate generation requests", async () => {
  const initial = copyContentFromSets(options);
  setup(initial);
  const button = screen.getByRole("button", { name: "Generate copy" });
  await click("Generate copy");
  fireEvent.click(button);
  expect(requests).toHaveLength(1);
  await act(async () =>
    requests[0].observer.error(new Error("Provider failed"))
  );
  expect(current()).toEqual(initial);
  expect(toast.error).toHaveBeenCalled();
});
it("passes selected direction and brief without an image and discards changed-context results", async () => {
  const view = setup();
  const promotion = {
    offer: "Directory membership",
    audience: "Tutors",
    goal: "Signups",
  };
  view.rerender(
    <view.Harness
      assetKey=""
      promotion={promotion}
      copyDirection={{ messaging_style: ["educational"] }}
    />
  );
  await click("Generate copy");
  expect(requests[0].input).toMatchObject({
    assetKeys: [],
    promotion,
    callToAction: "SIGN_UP",
    copyDirection: { messaging_style: ["educational"] },
  });
  view.rerender(
    <view.Harness
      assetKey=""
      promotion={promotion}
      copyDirection={{ messaging_style: ["playful"] }}
    />
  );
  await respond(options);
  expect(current().message).toBe("");
  expect(screen.queryByLabelText("Primary text suggestion 1")).toBeNull();
  expect(toast.info).toHaveBeenCalledOnce();
});
it("uses one Studio generation control and retains individual suggestion regeneration", async () => {
  const view = setup();
  const toolbar = document.createElement("div");
  document.body.appendChild(toolbar);
  const onGenerated = vi.fn();
  try {
    view.rerender(
      <view.Harness
        generationTarget={toolbar}
        instructions="Only verified claims"
        onGenerated={onGenerated}
      />
    );
    expect(
      screen.getAllByRole("button", { name: "Generate copy" })
    ).toHaveLength(1);
    expect(screen.queryByLabelText("AI copy direction")).toBeNull();
    await click("Generate copy");
    expect(requests.at(-1)!.input.direction).toBe("Only verified claims");
    await respond(options);
    expect(onGenerated).toHaveBeenCalledTimes(1);
    await click("Regenerate primary text suggestion 1");
    await respond([{ ...options[0], message: "Updated text" }]);
    expect(current().message).toBe("");
    expect(screen.getByDisplayValue("Updated text")).toBeTruthy();
    expect(onGenerated).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button", { name: "Regenerate" })).toHaveLength(
      1
    );
  } finally {
    view.unmount();
    toolbar.remove();
  }
});

it("uses an accessible vertical field rail with keyboard navigation on desktop", async () => {
  setup();
  expect(
    screen
      .getByRole("tablist", { name: "Meta copy fields" })
      .getAttribute("aria-orientation")
  ).toBe("vertical");
  const first = screen.getByRole("tab", { name: "Primary text" });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowDown" });
  await waitFor(() =>
    expect(
      screen
        .getByRole("tab", { name: "Headline" })
        .getAttribute("aria-selected")
    ).toBe("true")
  );
  expect(screen.getByRole("tabpanel")).toBeTruthy();
  expect(screen.getByLabelText("Headline 1")).toBeTruthy();
});
