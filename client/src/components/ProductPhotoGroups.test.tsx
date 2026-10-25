// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { ProductPhotoGroups } from "./ProductPhotoGroups";
afterEach(cleanup);
const photo = (key: string, id: number, url: string) => ({
  key,
  product: { id, name: "Same name" },
  name: "Same name",
  url,
  origin: "catalog" as const,
});
it("groups by product identity, preserves distinct IDs sharing a URL, and toggles exact keys", () => {
  const toggle = vi.fn();
  render(
    <ProductPhotoGroups
      choices={[
        photo("product_image:1", 7, "/a.png"),
        photo("product_image:2", 7, "/b.png"),
        photo("product_image:3", 8, "/c.png"),
        photo("product_image:4", 7, "/a.png"),
        photo("product_image:1", 7, "/a.png"),
      ]}
      selected={["product_image:2"]}
      limit={3}
      onToggle={toggle}
      primaryImageIds={{ 7: 1 }}
    />
  );
  const groups = screen.getAllByRole("region", {
    name: "Photos for Same name",
  });
  expect(groups).toHaveLength(2);
  expect(within(groups[0]).getAllByRole("checkbox")).toHaveLength(3);
  const second = within(groups[0]).getByRole("checkbox", { name: /Use 2/ });
  expect((second as HTMLInputElement).checked).toBe(true);
  fireEvent.click(second);
  expect(toggle).toHaveBeenCalledWith("product_image:2");
});
it("enforces capacity while allowing browsing and removal", () => {
  render(
    <ProductPhotoGroups
      choices={[
        photo("product_image:1", 7, "/a.png"),
        photo("product_image:2", 7, "/b.png"),
      ]}
      selected={["product_image:1"]}
      limit={1}
      onToggle={vi.fn()}
    />
  );
  const checks = screen.getAllByRole("checkbox") as HTMLInputElement[];
  expect(checks[0].disabled).toBe(false);
  expect(checks[1].disabled).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Preview 2 for Same name" })
  );
  expect(screen.getByAltText("Same name — 2 preview")).toBeTruthy();
});
it("does not confuse asset and catalog IDs", () => {
  render(
    <ProductPhotoGroups
      choices={[photo("product_image:1", 7, "/a.png")]}
      selected={["asset:1"]}
      limit={1}
      onToggle={vi.fn()}
    />
  );
  const check = screen.getByRole("checkbox") as HTMLInputElement;
  expect(check.checked).toBe(false);
  expect(check.disabled).toBe(true);
});
