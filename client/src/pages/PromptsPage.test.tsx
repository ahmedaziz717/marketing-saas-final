// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PROMPT_REGISTRY } from "@shared/promptRegistry";
const api = vi.hoisted(() => ({
  role: "owner",
  data: [] as any[],
  save: vi.fn(),
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
