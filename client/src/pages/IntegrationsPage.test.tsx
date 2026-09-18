// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/WorkspaceGate", () => ({
  WorkspaceGate: ({ children }: any) => children,
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({ organizationId: 1 }),
}));
vi.mock("@/components/CatalogSources", () => ({
  CatalogSources: ({ storesOnly }: any) => (
    <div>{storesOnly ? "Store connections only" : "Scan website"}</div>
  ),
}));
import IntegrationsPage from "./IntegrationsPage";
afterEach(cleanup);
it("separates categories and keeps website scanning out of the integrations hub", () => {
  render(<IntegrationsPage />);
  expect(screen.queryByText("Scan website")).toBeNull();
  expect(screen.getByText("Store connections only")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Email" }));
  expect(screen.getByRole("heading", { name: "Klaviyo" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Meta Ads" })).toBeNull();
});
it("searches partners, offers an empty-state reset, and never pretends to connect planned providers", () => {
  render(<IntegrationsPage />);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search integrations" }),
    { target: { value: "Klaviyo" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "View planned setup" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/Not available to connect yet/)).toBeTruthy();
  expect(within(dialog).queryByRole("button", { name: /connect/i })).toBeNull();
  expect(within(dialog).getByText(/choose the audience/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search integrations" }),
    { target: { value: "no-such-provider" } }
  );
  expect(screen.getByText("No integrations found")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("heading", { name: "Meta Ads" })).toBeTruthy();
});
