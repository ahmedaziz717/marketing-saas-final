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
import {
  galleryGroups,
  type CatalogImageMedia,
  type CatalogMediaGroupSummary,
} from "@shared/catalogMedia";
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
  expect(screen.getByText(/Gallery incomplete/).textContent).toContain(
    "source reports 8"
  );
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

const groupedMedia = (
  groupId: string,
  position: number
): CatalogImageMedia => ({
  width: 1200,
  height: 1200,
  hasAlpha: true,
  candidates: [],
  selectedSourceUrl: "",
  unavailableCandidates: 0,
  references: [{ groupId, imageId: `view:${position}`, position }],
});
const systemGroup: CatalogMediaGroupSummary = {
  id: "system",
  name: "Product views",
  role: "system",
  eligible: true,
  declaredImages: 2,
  expectedCount: 2,
};
it("shows a legacy Hero alongside source-ordered system views without changing saved selections", () => {
  const select = vi.fn();
  const mixed = [
    { id: 30, url: "/full-back.png", media: groupedMedia("system", 1) },
    { id: 25, url: "/full-hero.png", isPrimary: 1 },
    { id: 20, url: "/full-front.png", media: groupedMedia("system", 0) },
  ];
  const snapshot = JSON.stringify(mixed);
  render(
    <CatalogGallery
      name="System"
      images={mixed}
      groups={[systemGroup]}
      selectedIds={[30]}
      onSelect={select}
    />
  );
  expect(screen.queryByRole("combobox")).toBeNull();
  const thumbnails = screen.getAllByRole("button", { name: /^Preview/ });
  expect(thumbnails.map(button => button.getAttribute("aria-label"))).toEqual([
    "Preview Hero for System",
    "Preview 3 for System",
    "Preview 2 for System",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Next image" }));
  expect(
    screen.getByAltText("System \u2014 3 preview").getAttribute("src")
  ).toBe("/full-front.png");
  expect(select).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("checkbox", { name: /Use 2/ }) as HTMLInputElement)
      .checked
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /Use 3/ }));
  expect(select).toHaveBeenCalledWith(20);
  expect(JSON.stringify(mixed)).toBe(snapshot);
});
it("does not count a legacy Hero toward a missing source view or merge component roles", () => {
  const groups: CatalogMediaGroupSummary[] = [
    systemGroup,
    {
      id: "base",
      name: "Base chassis",
      role: "base_component",
      eligible: true,
      declaredImages: 1,
    },
    {
      id: "option",
      name: "White chassis",
      role: "optional_component",
      eligible: false,
      declaredImages: 1,
    },
  ];
  const mixed = [
    { id: 25, url: "/hero.png", isPrimary: 1 },
    { id: 20, url: "/front.png", media: groupedMedia("system", 0) },
    { id: 40, url: "/base.png", media: groupedMedia("base", 0) },
    { id: 50, url: "/option.png", media: groupedMedia("option", 0) },
  ];
  const presentation = galleryGroups(mixed, groups);
  expect(
    presentation.map(group => [group.id, group.images.map(photo => photo.id)])
  ).toEqual([
    ["system", [25, 20]],
    ["base", [40]],
    ["option", [50]],
  ]);
  expect(groups[0].declaredImages).toBe(2);
  render(
    <CatalogGallery
      name="System"
      images={mixed}
      groups={groups}
      onSelect={vi.fn()}
    />
  );
  expect(screen.getByText(/Gallery incomplete/).textContent).toContain(
    "source reports 2 images"
  );
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "option" },
  });
  expect(
    screen.queryByRole("button", { name: "Preview Hero for System" })
  ).toBeNull();
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
    true
  );
});
it("keeps a genuinely single imported Hero honest and does not merge into ineligible systems", () => {
  const hero = [{ id: 25, url: "/hero.png", isPrimary: 1 }];
  render(<CatalogGallery name="One photo" images={hero} onSelect={vi.fn()} />);
  expect(screen.getAllByRole("button", { name: /^Preview/ })).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
  expect(
    galleryGroups(hero, [{ ...systemGroup, eligible: false }]).map(group => [
      group.id,
      group.images.length,
    ])
  ).toEqual([
    ["legacy", 1],
    ["system", 0],
  ]);
});

it("uses a generic product label for primary source galleries, including standalone components", () => {
  const groups: CatalogMediaGroupSummary[] = [
    {
      id: "component",
      name: "Chassis originals",
      role: "system",
      eligible: true,
      declaredImages: 1,
    },
  ];
  const media: CatalogImageMedia = {
    width: 700,
    height: 700,
    hasAlpha: true,
    candidates: [],
    selectedSourceUrl: "/original.png",
    unavailableCandidates: 0,
    references: [{ groupId: "component", imageId: "front", position: 0 }],
  };
  render(
    <CatalogGallery
      name="Chassis Option"
      images={[{ id: 1, url: "/original.png", isPrimary: 1, media }]}
      groups={groups}
    />
  );
  expect(screen.getByText("Product gallery")).toBeTruthy();
  expect(screen.queryByText("System gallery")).toBeNull();
  expect(groups[0].role).toBe("system");
});

it("shows generation selection independently from the browsed preview without hiding choices in a horizontal strip", () => {
  render(
    <CatalogGallery
      name="System"
      images={images}
      selectedIds={[11]}
      onSelect={vi.fn()}
    />
  );
  expect(screen.getByText(/1 selected for generation/)).toBeTruthy();
  expect(screen.getByText("Selected")).toBeTruthy();
  const thumbnails = screen.getByLabelText("Image thumbnails");
  expect(thumbnails.className).toContain("grid");
  expect(thumbnails.className).not.toContain("overflow-x-auto");
  fireEvent.click(
    screen.getByRole("button", { name: "Preview Hero for System" })
  );
  expect(
    (screen.getByRole("checkbox", { name: /Use 2/ }) as HTMLInputElement)
      .checked
  ).toBe(true);
});
