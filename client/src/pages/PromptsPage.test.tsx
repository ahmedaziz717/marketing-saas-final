// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PROMPT_REGISTRY } from "@shared/promptRegistry";
const api = vi.hoisted(() => ({
  role: "owner",
  data: [] as any[],
  save: vi.fn(),
  brand: {
    name: "Brand A",
    voice: "Warm, practical advice for small businesses.",
  } as any,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: api.role } }),
}));
vi.mock("@/hooks/usePromptDefaults", () => ({
  usePromptDefaults: () => ({ data: api.data }),
  announcePromptChange: vi.fn(),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/components/SettingsLayout", () => ({
  SettingsLayout: ({ children }: any) => children,
}));
vi.mock("wouter", () => ({
  useSearch: () => "",
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    brand: {
      promptContext: {
        useQuery: () => ({
          data: { ...api.brand, status: "ready", summarized: false },
        }),
      },
    },
    useUtils: () => ({
      prompts: { list: { invalidate: vi.fn(), fetch: async () => api.data } },
    }),
    prompts: {
      history: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
      change: { useMutation: () => ({ mutate: api.save, isPending: false }) },
    },
  },
}));
import PromptsPage from "./PromptsPage";
import { PromptDefaultControls } from "@/components/PromptDefaultControls";
beforeEach(() => {
  vi.clearAllMocks();
  api.role = "owner";
  api.brand = {
    name: "Brand A",
    voice: "Warm, practical advice for small businesses.",
  };
  api.data = PROMPT_REGISTRY.map(p => ({
    ...p,
    value: p.baseline,
    revision: 0,
    source: "system",
    updatedAtMs: null,
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows the current brand beside creative instructions without rewriting edits", () => {
  const view = render(<PromptsPage />);
  expect(screen.getByText("Brand A · Brand voice")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Resolved workspace default"), {
    target: { value: "My deliberate campaign direction" },
  });
  api.brand = {
    name: "Brand B",
    voice: "Precise and technical for expert buyers.",
  };
  view.rerender(<PromptsPage />);
  expect(screen.getByText("Brand B · Brand voice")).toBeTruthy();
  expect(
    screen.queryByText("Warm, practical advice for small businesses.")
  ).toBeNull();
  expect(
    (screen.getByLabelText("Resolved workspace default") as HTMLTextAreaElement)
      .value
  ).toBe("My deliberate campaign direction");
  expect(api.save).not.toHaveBeenCalled();
});
it("keeps technical templates and theme details out of the ordinary catalog", () => {
  render(<PromptsPage />);
  const technical = PROMPT_REGISTRY.find(p => p.id === "brand.summary")!;
  expect(
    screen.queryByRole("button", { name: new RegExp(technical.name) })
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Product Spotlight theme/ })
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("Defaults to manage"), {
    target: { value: "technical" },
  });
  expect(
    screen.getByRole("button", { name: new RegExp(technical.name) })
  ).toBeTruthy();
});
it("does not expose advanced technical management to ordinary members", () => {
  api.role = "member";
  render(<PromptsPage />);
  expect(
    screen.queryByRole("option", { name: "Advanced technical templates" })
  ).toBeNull();
});
it("preserves an unsaved edit when another tab updates the resolved default", () => {
  const view = render(<PromptsPage />);
  fireEvent.change(screen.getByLabelText("Resolved workspace default"), {
    target: { value: "My unsaved direction" },
  });
  api.data = api.data.map(p =>
    p.id === "creative.base"
      ? { ...p, value: "Changed elsewhere", revision: 1 }
      : p
  );
  view.rerender(<PromptsPage />);
  expect(
    (screen.getByLabelText("Resolved workspace default") as HTMLTextAreaElement)
      .value
  ).toBe("My unsaved direction");
  expect(screen.getByRole("alert").textContent).toContain("changed elsewhere");
  expect(
    (
      screen.getByRole("button", {
        name: "Save workspace default",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(api.save).not.toHaveBeenCalled();
});
it("requires a change note and sends the visible base revision", () => {
  render(<PromptsPage />);
  fireEvent.change(screen.getByLabelText("Resolved workspace default"), {
    target: { value: "Reviewed new direction" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Save workspace default",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Change note"), {
    target: { value: "Clearer brand voice" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save workspace default" })
  );
  expect(api.save).toHaveBeenCalledWith(
    expect.objectContaining({
      organizationId: 1,
      promptId: "creative.base",
      expectedRevision: 0,
      value: "Reviewed new direction",
      reason: "Clearer brand voice",
    })
  );
});
it("keeps read-only members from editing and protects contract entries", () => {
  api.role = "creator";
  render(<PromptsPage />);
  expect(
    (screen.getByLabelText("Resolved workspace default") as HTMLTextAreaElement)
      .disabled
  ).toBe(true);
  expect(
    screen.queryByRole("button", { name: "Save workspace default" })
  ).toBeNull();
});
it("offers explicit workspace/system restore without changing a form on refresh", () => {
  const onChange = vi.fn();
  api.data = api.data.map(p =>
    p.id === "creative.base"
      ? { ...p, value: "Workspace voice", revision: 2 }
      : p
  );
  const view = render(
    <PromptDefaultControls
      promptId="creative.base"
      value="Unsaved form"
      onChange={onChange}
    />
  );
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Restore workspace default" })
  );
  expect(onChange).toHaveBeenLastCalledWith("Workspace voice");
  fireEvent.click(
    screen.getByRole("button", { name: "Restore system default" })
  );
  expect(onChange).toHaveBeenLastCalledWith(
    PROMPT_REGISTRY.find(p => p.id === "creative.base")!.baseline
  );
  view.rerender(
    <PromptDefaultControls
      promptId="creative.base"
      value="Unsaved form"
      onChange={onChange}
    />
  );
  expect(onChange).toHaveBeenCalledTimes(2);
});
