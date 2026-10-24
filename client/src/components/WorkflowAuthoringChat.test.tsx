// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
const api = vi.hoisted(() => ({
  chat: vi.fn(),
  apply: vi.fn(),
  status: vi.fn(),
  abandon: vi.fn(),
  reset: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workflowAuthoring: {
        chatStatus: { fetch: api.status },
        read: { fetch: api.read },
      },
    }),
    workflowAuthoring: {
      chat: { useMutation: () => ({ mutateAsync: api.chat }) },
      applyDraft: { useMutation: () => ({ mutateAsync: api.apply }) },
      abandonChat: { useMutation: () => ({ mutateAsync: api.abandon }) },
      resetChat: { useMutation: () => ({ mutateAsync: api.reset }) },
    },
  },
}));
vi.mock("./AIChatBox", () => ({
  AIChatBox: ({ onSendMessage }: any) => (
    <>
      <button onClick={() => onSendMessage("Create a reusable brief")}>
        Send message
      </button>
      <button onClick={() => onSendMessage("Different message")}>
        Send different message
      </button>
    </>
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

it("checks a terminal failure before an explicit new attempt with unchanged content", async () => {
  api.chat
    .mockRejectedValueOnce(new Error("Invalid model output"))
    .mockResolvedValueOnce(proposal);
  api.status.mockResolvedValue({ state: "failed" });
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      onApplied={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  fireEvent.click(await screen.findByText("Start new metered attempt"));
  await screen.findByText("Static preview only");
  expect(api.status).toHaveBeenCalledTimes(2);
  expect(api.chat.mock.calls[0][0].message).toBe(
    api.chat.mock.calls[1][0].message
  );
  expect(api.chat.mock.calls[0][0].requestId).not.toBe(
    api.chat.mock.calls[1][0].requestId
  );
});

it("recovers a lost successful response without a second model request", async () => {
  api.chat.mockRejectedValueOnce(new Error("Network disconnected"));
  api.status.mockResolvedValue({ state: "completed", result: proposal });
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      onApplied={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  await screen.findByText("Static preview only");
  expect(api.chat).toHaveBeenCalledTimes(1);
});

it("requires explicit abandonment of an uncertain attempt before starting another", async () => {
  api.chat.mockRejectedValueOnce(new Error("Network disconnected"));
  api.status.mockResolvedValue({ state: "pending" });
  api.abandon.mockResolvedValue({ state: "abandoned" });
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      onApplied={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  await screen.findByText("Abandon unresolved attempt");
  expect(screen.queryByText("Start new metered attempt")).toBeNull();
  expect(api.abandon).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Abandon unresolved attempt"));
  await screen.findByText("Start new metered attempt");
  expect(api.chat).toHaveBeenCalledTimes(1);
  expect(api.abandon).toHaveBeenCalledTimes(1);
});

it("retries an unreceived request with the exact original idempotency key", async () => {
  api.chat
    .mockRejectedValueOnce(new Error("Network disconnected"))
    .mockResolvedValueOnce(proposal);
  api.status.mockResolvedValue({ state: "missing" });
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      onApplied={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  fireEvent.click(await screen.findByText("Retry original request"));
  await screen.findByText("Static preview only");
  expect(api.chat.mock.calls[0][0]).toEqual(api.chat.mock.calls[1][0]);
});

it("does not allocate a new key for changed content while an earlier transport request could still arrive", async () => {
  api.chat.mockRejectedValueOnce(new Error("Network disconnected"));
  api.status.mockResolvedValue({ state: "missing" });
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      onApplied={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  await screen.findByText("Retry original request");
  fireEvent.click(screen.getByText("Send different message"));
  await screen.findByText(/earlier transport request may still arrive/);
  expect(api.chat).toHaveBeenCalledTimes(1);
});

it.each(["Draft changed before reservation", "Chat context exceeds the limit"])(
  "recovers from %s with corrected input without remounting",
  async error => {
    api.chat
      .mockRejectedValueOnce(new Error(error))
      .mockResolvedValueOnce(proposal);
    api.status.mockResolvedValue({ state: "missing" });
    api.reset.mockResolvedValue({ state: "abandoned" });
    const applied = vi.fn();
    const view = render(
      <WorkflowAuthoringChat
        organizationId={1}
        family="create"
        target={{ id: "draft", revision: 1 }}
        onApplied={applied}
      />
    );
    fireEvent.click(screen.getByText("Build with chat"));
    fireEvent.click(screen.getByText("Send message"));
    fireEvent.click(
      await screen.findByText("Reset chat for corrected request")
    );
    await screen.findByText(/Previous request closed/);
    expect(api.reset).toHaveBeenCalledWith(api.chat.mock.calls[0][0]);
    view.rerender(
      <WorkflowAuthoringChat
        organizationId={1}
        family="create"
        target={{ id: "draft", revision: 2 }}
        onApplied={applied}
      />
    );
    fireEvent.click(screen.getByText("Send different message"));
    await screen.findByText("Static preview only");
    const next = api.chat.mock.calls[1][0];
    expect(next).toMatchObject({
      message: "Different message",
      target: { id: "draft", revision: 2 },
      history: [],
    });
    expect(next.requestId).not.toBe(api.chat.mock.calls[0][0].requestId);
  }
);

it("does not reset when a missing request becomes pending before the fenced reset", async () => {
  api.chat.mockRejectedValueOnce(new Error("Transport failed"));
  api.status.mockResolvedValue({ state: "missing" });
  api.reset.mockResolvedValue({ state: "pending" });
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      onApplied={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  fireEvent.click(await screen.findByText("Reset chat for corrected request"));
  await screen.findByText("Abandon unresolved attempt");
  expect(screen.queryByText("Start new metered attempt")).toBeNull();
  expect(api.chat).toHaveBeenCalledTimes(1);
});

it("recovers a lost reset response before allowing corrected input", async () => {
  api.chat
    .mockRejectedValueOnce(new Error("Context rejected"))
    .mockResolvedValueOnce(proposal);
  api.status.mockResolvedValue({ state: "missing" });
  api.reset
    .mockRejectedValueOnce(new Error("Reset response lost"))
    .mockResolvedValueOnce({ state: "abandoned" });
  render(
    <WorkflowAuthoringChat
      organizationId={1}
      family="create"
      onApplied={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  fireEvent.click(await screen.findByText("Reset chat for corrected request"));
  await screen.findByText("Reset response lost");
  expect(screen.queryByText("Reset chat for corrected request")).toBeNull();
  api.status.mockResolvedValue({ state: "abandoned" });
  fireEvent.click(screen.getByText("Check previous attempt"));
  fireEvent.click(await screen.findByText("Reset chat for corrected request"));
  await screen.findByText(/Previous request closed/);
  fireEvent.click(screen.getByText("Send different message"));
  await screen.findByText("Static preview only");
  expect(api.chat.mock.calls[1][0].requestId).not.toBe(
    api.chat.mock.calls[0][0].requestId
  );
});

it("reloads the saved revision on explicit reset and sends the corrected request in the same editor", async () => {
  api.chat
    .mockRejectedValueOnce(new Error("Stale revision"))
    .mockResolvedValueOnce(proposal);
  api.status.mockResolvedValue({ state: "missing" });
  api.reset.mockResolvedValue({ state: "abandoned" });
  api.read.mockResolvedValue({ ...proposal.draft, id: "draft", revision: 2 });
  function Editor() {
    const [revision, setRevision] = useState(1);
    return (
      <WorkflowAuthoringChat
        organizationId={1}
        family="create"
        target={{ id: "draft", revision }}
        onApplied={vi.fn()}
        onReloadDraft={(_draft, next) => setRevision(next)}
      />
    );
  }
  render(<Editor />);
  fireEvent.click(screen.getByText("Build with chat"));
  fireEvent.click(screen.getByText("Send message"));
  fireEvent.click(await screen.findByText("Reset chat for corrected request"));
  await screen.findByText(/Previous request closed/);
  expect(api.read).toHaveBeenCalledWith(
    { organizationId: 1, id: "draft" },
    { staleTime: 0 }
  );
  fireEvent.click(screen.getByText("Send different message"));
  await screen.findByText("Static preview only");
  expect(api.chat.mock.calls[1][0].target.revision).toBe(2);
});
