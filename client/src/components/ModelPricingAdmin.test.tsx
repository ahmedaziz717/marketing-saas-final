// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { generationModel } from "@shared/modelCatalog";
import { defaultCreditPolicy } from "@shared/aiCredits";

const state = vi.hoisted(() => ({ data: null as any, query: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      models: { invalidate: vi.fn() },
      platformAdmin: { config: { invalidate: vi.fn() } },
    }),
    models: {
      adminCatalog: {
        useQuery: (input: unknown) => {
          state.query(input);
          return { data: state.data, isFetching: false, isPending: false };
        },
      },
      ...Object.fromEntries(
        ["savePolicy", "saveModel", "setEnabled", "syncAvailability"].map(
          key => [
            key,
            { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
          ]
        )
      ),
    },
  },
}));
import { ModelPricingAdmin } from "./ModelPricingAdmin";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("switches estimator controls with type and combines provider and search filters", () => {
  state.data = {
    policy: defaultCreditPolicy,
    rates: [],
    models: [
      ["openai:gpt-image-2", "OpenAI image"],
      ["higgsfield:higgsfield-ai/soul/v2/standard", "Higgsfield image"],
      ["higgsfield:kling-video/v3.0/pro/text-to-video", "Kling video"],
    ].map(([id, name]) => ({
      ...generationModel(id),
      id,
      routeId: id,
      name,
      enabled: true,
      available: true,
      actionEstimate: {
        costMicros: 10000,
        credits: 2,
        basis: "Estimate",
        settings: "Defaults",
        calculation: null,
      },
    })),
  };
  render(<ModelPricingAdmin />);
  expect(
    within(screen.getByLabelText("Model type"))
      .getAllByRole("option")
      .map(o => o.textContent)
  ).toEqual(["Images", "Videos"]);
  expect(screen.getByText("Image estimate settings")).toBeTruthy();
  expect(screen.queryByText("Video estimate settings")).toBeNull();
  fireEvent.change(screen.getByLabelText("Provider"), {
    target: { value: "openai" },
  });
  expect(screen.getByText("OpenAI image")).toBeTruthy();
  expect(screen.queryByText("Higgsfield image")).toBeNull();
  fireEvent.change(screen.getByLabelText("Model type"), {
    target: { value: "video" },
  });
  expect(screen.queryByText("Image estimate settings")).toBeNull();
  expect(screen.getByText("Video estimate settings")).toBeTruthy();
  expect(screen.getByText("No models match these filters.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Provider"), {
    target: { value: "higgsfield" },
  });
  expect(screen.getByText("Kling video")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Video duration"), {
    target: { value: "10" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply video settings" }));
  expect(state.query).toHaveBeenLastCalledWith(
    expect.objectContaining({
      videoEstimate: expect.objectContaining({ duration: 10 }),
    })
  );
  fireEvent.change(screen.getByLabelText("Search models"), {
    target: { value: "unknown" },
  });
  expect(screen.getByText("No models match these filters.")).toBeTruthy();
});
