// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CatalogGallery } from "./CatalogGallery";
afterEach(cleanup);
it("shows incomplete galleries and distinguishes optional looks while retaining selection", () => {
  const select = vi.fn();
  render(
    <CatalogGallery
      name="System A"
      images={[
        {
          id: 1,
          url: "/photo.png",
          media: {
            width: 1200,
            height: 1600,
            hasAlpha: true,
            candidates: [],
            selectedSourceUrl: "",
            unavailableCandidates: 0,
            references: [{ groupId: "option", imageId: "front", position: 0 }],
          },
        },
      ]}
      groups={[
        {
          id: "system",
          name: "System",
          role: "system",
          eligible: true,
          declaredImages: 0,
          expectedCount: 8,
        },
        {
          id: "option",
          name: "White case",
          role: "optional_component",
          eligible: true,
          declaredImages: 1,
        },
      ]}
      selected={1}
      onSelect={select}
    />
  );
  expect(screen.getByRole("status").textContent).toContain("source reports 8");
  expect(screen.getByText(/not the exact configured system/)).toBeTruthy();
  expect(screen.getByText("1200 × 1600")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /White case/ }));
  expect(select).toHaveBeenCalledWith(1);
});
it("always exposes a gallery surface even with no imported URLs", () => {
  render(<CatalogGallery name="Missing" images={[]} />);
  expect(
    screen.getByText("No gallery images have been imported.")
  ).toBeTruthy();
});
