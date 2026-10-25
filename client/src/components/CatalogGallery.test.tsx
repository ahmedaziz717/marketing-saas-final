// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CatalogGallery } from "./CatalogGallery";
afterEach(cleanup);
const images = [
  { id: 11, url: "/original-side.png" },
  { id: 25, url: "/original-hero.png", isPrimary: 1 },
];
it("uses actual primary, separates preview and generation, and retains original URLs", () => {
  const select = vi.fn();
  render(
    <CatalogGallery
      name="System"
      images={images}
      selectedIds={[11]}
      onSelect={select}
    />
  );
  expect(screen.getByAltText("System — Hero preview").getAttribute("src")).toBe(
    images[1].url
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview 2 for System" }));
  expect(screen.getByAltText("System — 2 preview").getAttribute("src")).toBe(
    images[0].url
  );
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Use Hero/ }));
  expect(select).toHaveBeenCalledWith(25);
  expect(
    (screen.getByRole("checkbox", { name: /Use 2/ }) as HTMLInputElement)
      .checked
  ).toBe(true);
});
it("supports arrows, keyboard, touch, a modal lightbox, and Escape", () => {
  render(<CatalogGallery name="System" images={images} />);
  fireEvent.click(screen.getByRole("button", { name: "Next image" }));
  expect(screen.getByAltText("System — 2 preview")).toBeTruthy();
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Preview 2 for System" }),
    { key: "ArrowLeft" }
  );
  expect(screen.getByAltText("System — Hero preview")).toBeTruthy();
  const preview = screen.getByRole("button", {
    name: "Enlarge Hero for System",
  });
  fireEvent.touchStart(preview, { touches: [{ clientX: 200, clientY: 50 }] });
  fireEvent.touchEnd(preview, {
    changedTouches: [{ clientX: 100, clientY: 50 }],
  });
  fireEvent.click(screen.getByRole("button", { name: "Enlarge 2 for System" }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog)
      .getByRole("link", { name: "Open original image" })
      .getAttribute("href")
  ).toBe(images[0].url);
  fireEvent.keyDown(dialog, { key: "ArrowRight" });
  expect(within(dialog).getByAltText("System — Hero enlarged")).toBeTruthy();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("preserves group warnings, eligibility, details and empty galleries in a compact selector", () => {
  const media = {
    width: 1200,
    height: 1600,
    hasAlpha: true,
    candidates: [],
    selectedSourceUrl: "",
    unavailableCandidates: 0,
    references: [{ groupId: "option", imageId: "front", position: 0 }],
  };
  render(
    <CatalogGallery
      name="System"
      images={[{ id: 1, url: "/option.png", media }]}
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
          eligible: false,
          referenceOnly: true,
          declaredImages: 1,
        },
      ]}
      onSelect={vi.fn()}
    />
  );
  expect(screen.getByRole("status").textContent).toContain("source reports 8");
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "option" },
  });
  expect(
    screen.getByText(/not the exact configured system/).textContent
  ).toContain("Not eligible");
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
    true
  );
  expect(screen.getByText("1200 x 1600").closest("details")?.open).toBe(false);
  expect(screen.getAllByRole("button", { name: /Enlarge/ })).toHaveLength(1);
});
it("allows removal of a failed selected image at capacity and resets stale preview", () => {
  const props = {
    name: "System",
    onSelect: vi.fn(),
    disabled: true,
    selectedIds: [25],
  };
  const { rerender } = render(<CatalogGallery {...props} images={images} />);
  fireEvent.error(screen.getByAltText("System — Hero preview"));
  expect(
    (screen.getByRole("checkbox", { name: /Use Hero/ }) as HTMLInputElement)
      .disabled
  ).toBe(false);
  expect(
    (screen.getByRole("checkbox", { name: /Use 2/ }) as HTMLInputElement)
      .disabled
  ).toBe(true);
  rerender(<CatalogGallery {...props} images={[images[0]]} />);
  expect(screen.getByAltText("System — 1 preview")).toBeTruthy();
});
it("never invents Hero metadata and handles no images", () => {
  const { rerender } = render(
    <CatalogGallery name="Missing" images={[images[0]]} />
  );
  expect(screen.queryByText("Hero")).toBeNull();
  rerender(<CatalogGallery name="Missing" images={[]} />);
  expect(
    screen.getByText("No gallery images have been imported.")
  ).toBeTruthy();
});
