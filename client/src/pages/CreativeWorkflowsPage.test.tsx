// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { copyEvidenceWorkflowTemplate } from "@shared/workflowPerformanceInputs";

const api = vi.hoisted(() => ({
  detail: undefined as any,
  refetch: vi.fn(),
  publish: vi.fn(),
  save: vi.fn(),
  run: vi.fn(),
  navigate: vi.fn(),
  invalidateApps: vi.fn(),
  invalidateWorkflow: vi.fn(),
}));
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1, membership: { role: "owner" } }),
}));
vi.mock("@/components/WorkflowCanvas", () => ({
  WorkflowCanvas: () => <div>Workflow canvas</div>,
}));
vi.mock("@/components/WorkflowFormEditor", () => ({
  WorkflowFormEditor: () => null,
}));
vi.mock("@/components/WorkflowInputControl", () => ({
  WorkflowInputControl: () => null,
}));
vi.mock("@/components/WorkflowRunReview", () => ({
  WorkflowRunReview: () => null,
}));
vi.mock("wouter", async original => ({
  ...(await original<typeof import("wouter")>()),
  useSearch: () => "workflow=workflow-1",
  useLocation: () => ["/app/optimize/workflows", api.navigate],
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workflows: {
        listApps: { invalidate: api.invalidateApps },
        get: { invalidate: api.invalidateWorkflow },
      },
    }),
    workflows: {
      get: { useQuery: () => ({ data: api.detail, refetch: api.refetch }) },
      publishApp: { useMutation: () => ({ mutateAsync: api.publish }) },
      save: { useMutation: () => ({ mutateAsync: api.save }) },
      quote: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      run: { useMutation: () => ({ mutateAsync: api.run }) },
      stop: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    channels: { connections: { useQuery: () => ({ data: { items: [] } }) } },
  },
}));
import CreativeWorkflowsPage from "./CreativeWorkflowsPage";

beforeEach(() => {
  vi.clearAllMocks();
  api.detail = {
    id: "workflow-1",
    organizationId: 1,
    name: "WF Test 1",
    revision: 3,
    graph: copyEvidenceWorkflowTemplate(),
    runs: [],
    latestPublishedVersion: null,
    latestPublishedApp: null,
  };
  api.refetch.mockImplementation(async () => ({ data: api.detail }));
  api.publish.mockImplementation(async (input: any) => ({
    id: "app-v1",
    version: 1,
    name: input.name,
  }));
});
afterEach(cleanup);

it("publishes a separate App name, refreshes the list and opens the published App without running or renaming the workflow", async () => {
  render(<CreativeWorkflowsPage family="optimize" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Publish as App" })
  );
  const name = await screen.findByLabelText("App name");
  expect((name as HTMLInputElement).value).toBe("WF Test 1");
  fireEvent.change(name, { target: { value: "  " } });
  expect(
    (
      screen.getByRole("button", {
        name: "Publish App version",
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  fireEvent.change(name, { target: { value: "  Copy Performance App  " } });
  fireEvent.change(screen.getByLabelText("App description"), {
    target: { value: "Compare copy styles" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Publish App version" }));
  await waitFor(() =>
    expect(api.navigate).toHaveBeenCalledWith("/app/optimize/apps?app=app-v1")
  );
  expect(api.publish).toHaveBeenCalledWith({
    organizationId: 1,
    id: "workflow-1",
    revision: 3,
    name: "Copy Performance App",
    description: "Compare copy styles",
  });
  expect(api.invalidateApps).toHaveBeenCalledWith({ organizationId: 1 });
  expect(api.invalidateWorkflow).toHaveBeenCalledWith({
    organizationId: 1,
    id: "workflow-1",
  });
  expect(
    (screen.getByLabelText("Workflow name") as HTMLInputElement).value
  ).toBe("WF Test 1");
  expect(api.save).not.toHaveBeenCalled();
  expect(api.run).not.toHaveBeenCalled();
});

it("prefills the latest published name and description when publishing a new version", async () => {
  api.detail.latestPublishedVersion = 2;
  api.detail.latestPublishedApp = {
    id: "app-v2",
    version: 2,
    name: "Copy Explorer",
    description: "A saved App description",
  };
  render(<CreativeWorkflowsPage family="optimize" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Publish new version" })
  );
  expect(
    ((await screen.findByLabelText("App name")) as HTMLInputElement).value
  ).toBe("Copy Explorer");
  expect(
    (screen.getByLabelText("App description") as HTMLInputElement).value
  ).toBe("A saved App description");
  fireEvent.click(screen.getByRole("button", { name: "Publish App version" }));
  await waitFor(() =>
    expect(api.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Copy Explorer",
        description: "A saved App description",
      })
    )
  );
  expect(api.run).not.toHaveBeenCalled();
});
