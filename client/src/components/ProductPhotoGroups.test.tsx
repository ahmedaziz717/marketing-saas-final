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
const photo = (key: string, id: number, url: string) =>
  ({ key, product: { id }, name: "Same name", url, origin: "catalog" }) as any;
it("groups photos by stable product identity without duplicate tiles and keeps angle selection", () => {
  const toggle = vi.fn();
  render(
    <ProductPhotoGroups
      choices={[
        photo("product_image:1", 7, "/a.png"),
        photo("product_image:2", 7, "/b.png"),
        photo("product_image:3", 8, "/c.png"),
        photo("product_image:4", 7, "/a.png"),
      ]}
      selected={["product_image:2"]}
      limit={3}
      onToggle={toggle}
    />
  );
  const groups = screen.getAllByRole("region", {
    name: "Photos for Same name",
  });
  expect(groups).toHaveLength(2);
  expect(within(groups[0]).getAllByRole("button")).toHaveLength(2);
  const second = within(groups[0]).getByRole("button", {
    name: "Use photo 2 for Same name",
  });
  expect(second.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(second);
  expect(toggle).toHaveBeenCalledWith("product_image:2");
});
it("shows unavailable images and enforces capacity without dropping a saved selection", () => {
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
  const buttons = screen.getAllByRole("button");
  fireEvent.error(buttons[0].querySelector("img")!);
  expect(screen.getByText("Image unavailable")).toBeTruthy();
  expect((buttons[0] as HTMLButtonElement).disabled).toBe(false);
  expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
});

it("does not confuse an asset reference with the same numeric catalog image ID", () => {
  render(<ProductPhotoGroups choices={[photo("product_image:1", 7, "/a.png")]} selected={["asset:1"]} limit={1} onToggle={vi.fn()} />);
  const button = screen.getByRole("button");
  expect(button.getAttribute("aria-pressed")).toBe("false");
  expect((button as HTMLButtonElement).disabled).toBe(true);
});
