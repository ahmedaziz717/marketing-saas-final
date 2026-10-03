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
  function Harness({ assetKey = "asset:1" }: { assetKey?: string }) {
    const [value, setValue] = useState(initial);
    return (
      <trpc.Provider client={client} queryClient={query}>
        <QueryClientProvider client={query}>
          <AdTextOptionsEditor
            organizationId={1}
            assetKeys={[assetKey]}
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
