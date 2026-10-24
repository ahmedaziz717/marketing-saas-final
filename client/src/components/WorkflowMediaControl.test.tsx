// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { appFieldSchema } from "@shared/workflowInputs";
const fixture = vi.hoisted(() => ({
  products: [
    {
      id: 7,
      name: "Travel mug",
      description: "Reusable mug",
      price: "29.00",
      currency: "USD",
      productUrl: "https://shop.test/mug",
      specifications: { Capacity: "400 ml", Material: "Steel" },
      images: [
        {
          key: "product_image:9",
          url: "https://shop.test/mug.png",
          name: "Travel mug",
        },
      ],
    },
  ],
  pageIds: [7],
  nextOffset: null,
  assets: [
    {
      key: "asset:3",
      name: "Approved campaign",
      url: "https://shop.test/ad.png",
      width: 1080,
      height: 1080,
      state: "approved",
    },
  ],
  role: "owner",
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    workflows: {
      mediaChoices: { useQuery: () => ({ data: fixture, refetch: vi.fn() }) },
    },
  },
}));
vi.mock("./AssetUploadDialog", () => ({
  AssetUploadDialog: ({ onComplete }: any) => (
    <button onClick={() => onComplete("asset:3", "approved")}>
      Complete upload
    </button>
  ),
}));
import { WorkflowMediaControl } from "./WorkflowMediaControl";
afterEach(cleanup);
function Harness({
  media = {},
  preview = false,
  initial = "",
}: {
  media?: any;
  preview?: boolean;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <WorkflowMediaControl
        field={appFieldSchema.parse({ kind: "asset", media })}
        value={value}
        onChange={setValue}
        organizationId={1}
        preview={preview}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}
it("shows product and approved asset tiles, previews full images, and retains content selections", () => {
  render(<Harness />);
  expect(screen.getByRole("img", { name: "Travel mug" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Select Travel mug" }));
  fireEvent.click(screen.getByLabelText(/Capacity/));
  fireEvent.click(screen.getByLabelText(/Show price/));
  expect(JSON.parse(screen.getByTestId("value").textContent!)).toMatchObject({
    productId: 7,
    imageKey: "product_image:9",
    featuredSpecKeys: ["Capacity"],
    includePrice: true,
  });
  fireEvent.click(screen.getByRole("button", { name: "Preview Travel mug" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Approved assets" }));
  expect(screen.getByRole("img", { name: "Approved campaign" })).toBeTruthy();
  expect(screen.getByLabelText(/Capacity/)).toHaveProperty("checked", true);
  fireEvent.click(
    screen.getByRole("button", { name: "Select Approved campaign" })
  );
  expect(screen.getByTestId("value").textContent).toBe("asset:3");
  expect(screen.queryByText("Product content")).toBeNull();
  expect(screen.queryByRole("button", { name: "Upload image" })).toBeNull();
});
it("uses workflow source restrictions, fixed content settings, and optional uploads", () => {
  const view = render(
    <Harness
      media={{ allowUpload: true, price: "never", bullets: "all" }}
      initial={JSON.stringify({
        imageKey: "product_image:9",
        productId: 7,
        includePrice: true,
      })}
    />
  );
  expect(screen.getByLabelText(/Show price/)).toHaveProperty("checked", false);
  expect(screen.getByLabelText(/Show price/)).toHaveProperty("disabled", true);
  expect(screen.getByLabelText(/Material/)).toHaveProperty("checked", true);
  expect(screen.getByLabelText(/Material/)).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "Upload image" }));
  fireEvent.click(screen.getByRole("button", { name: "Complete upload" }));
  expect(screen.getByTestId("value").textContent).toBe("asset:3");
  view.unmount();
  render(
    <Harness media={{ allowUpload: true, productImages: false }} preview />
  );
  expect(screen.queryByRole("button", { name: "Product images" })).toBeNull();
  expect(screen.getByRole("button", { name: "Upload image" })).toHaveProperty(
    "disabled",
    true
  );
});
