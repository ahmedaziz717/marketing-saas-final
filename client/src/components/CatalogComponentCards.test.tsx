// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ mutate: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    catalog: {
      previewComponents: {
        useQuery: () => {
          state.read();
          return {
            data: {
              hash: "a".repeat(64),
              components: [
                {
                  code: "case-one",
                  kind: "Chassis",
                  name: "Printed enclosure",
                  previewUrl: "https://images.test/original.png",
                  imageCount: 6,
                  minimumWidth: 700,
                  minimumHeight: 700,
                  parents: [{ id: 1 }],
                },
              ],
            },
          };
        },
      },
      createComponents: { useMutation: () => ({ mutate: state.mutate }) },
    },
  },
}));
import { CatalogComponentCards } from "./CatalogComponentCards";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("keeps component details compact and requires explicit preview and creation", () => {
  render(
    <CatalogComponentCards
      organizationId={3}
      product={{
        id: 1,
        sourceId: 7,
        mediaGroups: [
          {
            id: "option:one",
            name: "Chassis",
            role: "optional_component",
            eligible: true,
            declaredImages: 6,
          },
        ],
      }}
      canEdit
      onSaved={vi.fn()}
    />
  );
  const summary = screen.getByText("Separate component cards");
  expect(summary.closest("details")!.open).toBe(false);
  expect(state.read).not.toHaveBeenCalled();
  expect(state.mutate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Review separate component cards" })
  );
  expect(screen.getByText(/6 original views/)).toBeTruthy();
  expect(state.mutate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Create or update separate cards" })
  );
  expect(state.mutate).toHaveBeenCalledWith({
    organizationId: 3,
    productId: 1,
    reviewedHash: "a".repeat(64),
    confirmed: true,
  });
});
it("labels compatibility amounts and component identity without duplicate nested photo cards", () => {
  const { container } = render(
    <CatalogComponentCards
      organizationId={3}
      product={{
        id: 8,
        provenance: {
          "component.sourceCode": "case-one",
          "component.kind": "Chassis",
        },
        componentLinks: [
          {
            parentProductId: 1,
            componentProductId: 8,
            parentName: "Compatible system",
            componentName: "Printed enclosure",
            kind: "Chassis",
            sourceCode: "case-one",
            optionAmount: "50",
            amountMeaning: "upgrade_delta",
          },
        ],
      }}
      canEdit
      onSaved={vi.fn()}
    />
  );
  expect(screen.getByText(/Chassis component only/)).toBeTruthy();
  expect(screen.getByText(/System-specific upgrade delta/)).toBeTruthy();
  expect(container.querySelectorAll("img")).toHaveLength(0);
  expect(screen.queryByRole("button")).toBeNull();
});
