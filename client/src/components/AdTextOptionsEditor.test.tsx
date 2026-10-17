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
it("applies all five sets, allows manual editing and undoes regeneration", async () => {
  setup();
  await click("Generate 5 copy sets");
  await respond(options);
  expect(current()).toEqual(copyContentFromSets(options));
  expect(
    screen.getAllByRole("textbox", { name: /Primary text option/ })
  ).toHaveLength(5);
  expect(
    screen.queryByRole("button", { name: "Add primary text option" })
  ).toBeNull();
  await click("Regenerate all 5 sets");
  const fresh = options.map(o => ({
    message: o.message + " new",
    headline: o.headline + " new",
    description: o.description + " new",
  }));
  await respond(fresh);
  expect(current()).toEqual(copyContentFromSets(fresh));
  await click("Undo last generation");
  expect(current()).toEqual(copyContentFromSets(options));
});
it("regenerates one headline and retains the other 14 values", async () => {
  const initial = copyContentFromSets(options);
  setup(initial);
  await tab(/Headlines/);
  await click("Regenerate headline option 3");
  expect(requests[0].input.regeneration).toEqual({
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
  expect(current()).toEqual({
    ...initial,
    textVariants: {
      ...initial.textVariants,
      headlines: [
        "Headline 2",
        "Fresh third headline",
        "Headline 4",
        "Headline 5",
      ],
    },
  });
  await click("Undo last generation");
  expect(current()).toEqual(initial);
});
it("discards delayed results after manual edits or image selection changes", async () => {
  const initial = copyContentFromSets(options);
  const view = setup(initial);
  await click("Regenerate all 5 sets");
  fireEvent.change(screen.getByLabelText("Primary text option 1"), {
    target: { value: "My manual edit" },
  });
  await respond(options);
  expect(current().message).toBe("My manual edit");
  expect(toast.info).toHaveBeenCalledOnce();
  await click("Regenerate all 5 sets");
  view.rerender(<view.Harness assetKey="asset:2" />);
  await respond(options);
  expect(current().message).toBe("My manual edit");
  expect(toast.info).toHaveBeenCalledTimes(2);
});
it("keeps copy on failure and prevents duplicate generation requests", async () => {
  const initial = copyContentFromSets(options);
  setup(initial);
  const button = screen.getByRole("button", { name: "Regenerate all 5 sets" });
  await click("Regenerate all 5 sets");
  fireEvent.click(button);
  expect(requests).toHaveLength(1);
  await act(async () => {
    requests[0].observer.error(new Error("Provider failed"));
  });
  expect(current()).toEqual(initial);
  expect(toast.error).toHaveBeenCalled();
});

it("passes the selected copy direction and setup without an image and discards results if that direction changes", async () => {
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
  await click("Generate 5 copy sets");
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
  expect(toast.info).toHaveBeenCalledOnce();
});

it("uses one Studio generation control and includes brief instructions while retaining individual regeneration", async () => {
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
        promotion={{
          offer: "New collection",
          audience: "Designers",
          goal: "Sales",
        }}
        copyDirection={{ messaging_style: ["playful"] }}
      />
    );
    expect(
      screen.getAllByRole("button", { name: "Generate copy" })
    ).toHaveLength(1);
    expect(screen.queryByLabelText("AI copy direction")).toBeNull();
    await click("Generate copy");
    expect(requests.at(-1)!.input).toMatchObject({
      direction: "Only verified claims",
      promotion: {
        offer: "New collection",
        audience: "Designers",
        goal: "Sales",
      },
      copyDirection: { messaging_style: ["playful"] },
      callToAction: "SIGN_UP",
    });
    await respond(options);
    expect(onGenerated).toHaveBeenCalledTimes(1);
    await click("Regenerate primary text option 1");
    await respond([{ ...options[0], message: "Updated text" }]);
    expect(current().message).toBe("Updated text");
    expect(current().headline).toBe("Headline 1");
    expect(onGenerated).toHaveBeenCalledTimes(1);
    expect(
      screen.getAllByRole("button", { name: "Regenerate all" })
    ).toHaveLength(1);
  } finally {
    view.unmount();
    toolbar.remove();
  }
});
