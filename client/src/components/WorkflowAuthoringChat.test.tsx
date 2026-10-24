// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ chat: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflowAuthoring: {
      chat: { useMutation: () => ({ mutateAsync: api.chat }) },
      apply: { useMutation: () => ({ mutateAsync: api.apply }) },
    },
  },
}));
vi.mock("./AIChatBox", () => ({
  AIChatBox: ({ onSendMessage }: any) => (
    <button onClick={() => onSendMessage("Create a reusable brief")}>
      Send message
    </button>
  ),
}));
import { WorkflowAuthoringChat } from "./WorkflowAuthoringChat";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const proposal = {
  proposalId: "proposal",
  hash: "a".repeat(64),
  proposal: { summary: "Add brief", changes: [] },
  draft: { name: "Brief", family: "create", graph: { nodes: [], edges: [] } },
  preview: {
    executableSteps: 0,
    connections: 0,
    fields: [],
    warnings: ["Static preview only"],
  },
};
it("requires a separate review/apply gesture after chat and uses the exact hash", async () => {
  api.chat.mockResolvedValue(proposal);
  api.apply.mockResolvedValue({ id: "draft", revision: 1 });
  const applied = vi.fn();
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      onApplied={applied}
    />
  );
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  await screen.findByText("Static preview only");
  expect(api.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Apply reviewed proposal to draft"));
  await waitFor(() =>
    expect(applied).toHaveBeenCalledWith("draft", proposal.draft, 1)
  );
  expect(api.apply.mock.calls[0][0]).toMatchObject({
    organizationId: 1,
    proposalId: "proposal",
    reviewedHash: proposal.hash,
  });
});
it("shows concurrency errors and never replaces the editor on failed apply", async () => {
  api.chat.mockResolvedValue(proposal);
  api.apply.mockRejectedValue(
    new Error("Draft changed. Reopen before applying.")
  );
  const applied = vi.fn();
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      onApplied={applied}
    />
  );
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  await screen.findByText("Static preview only");
  fireEvent.click(screen.getByText("Apply reviewed proposal to draft"));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Draft changed. Reopen before applying."
  );
  expect(applied).not.toHaveBeenCalled();
});
it("disables chat while the editor has unsaved changes", () => {
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      disabled
      onApplied={vi.fn()}
    />
  );
  expect(
    (screen.getByText("Build with chat") as HTMLButtonElement).disabled
  ).toBe(true);
});
