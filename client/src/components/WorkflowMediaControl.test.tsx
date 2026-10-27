// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
      primaryImageId: 9,
      images: [
        {
          key: "product_image:9",
          url: "https://shop.test/mug.png",
          name: "Travel mug",
          isPrimary: 1,
        },
        {
          key: "product_image:10",
          url: "https://shop.test/mug-back-original.png",
          name: "Travel mug back",
          isPrimary: 0,
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
  kind = "asset",
  locked = false,
  referenceBudget,
}: {
  media?: any;
  preview?: boolean;
  initial?: string;
  kind?: "asset" | "product";
  locked?: boolean;
  referenceBudget?: { limit: number; modelName: string; reserved: number };
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <WorkflowMediaControl
        field={appFieldSchema.parse({ kind, media, locked })}
        value={value}
        onChange={setValue}
        organizationId={1}
        preview={preview}
        referenceBudget={referenceBudget}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}
it("shows product and approved asset tiles, previews full images, and retains content selections", () => {
  render(<Harness />);
  expect(
    screen.getByRole("article", { name: "Product Travel mug" })
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Use Hero for Travel mug/ })
  );
  fireEvent.click(screen.getByLabelText(/Capacity/));
  fireEvent.click(screen.getByLabelText(/Show price/));
  expect(JSON.parse(screen.getByTestId("value").textContent!)).toMatchObject({
    productId: 7,
    imageKey: "product_image:9",
    featuredSpecKeys: ["Capacity"],
    includePrice: true,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Enlarge Hero for Travel mug" })
  );
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

it.each(["asset", "product"] as const)(
  "groups %s photos without changing the saved selection while browsing",
  kind => {
    const initial = JSON.stringify({
      productId: 7,
      imageKey: "product_image:9",
      featuredSpecKeys: ["Capacity"],
      includePrice: true,
      includeDescription: false,
      includeLink: true,
    });
    render(<Harness kind={kind} initial={initial} />);
    expect(
      screen.getAllByRole("article", { name: "Product Travel mug" })
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Preview 2 for Travel mug" })
    );
    expect(screen.getByTestId("value").textContent).toBe(initial);
    expect(
      screen
        .getByRole("img", { name: /Travel mug.*2 preview/ })
        .getAttribute("src")
    ).toBe("https://shop.test/mug-back-original.png");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Use 2 for Travel mug/ })
    );
    expect(JSON.parse(screen.getByTestId("value").textContent!)).toEqual({
      ...JSON.parse(initial),
      ...(kind === "product"
        ? {
            imageKey: "product_image:9",
            imageKeys: ["product_image:9", "product_image:10"],
          }
        : { imageKey: "product_image:10" }),
    });
  }
);

it("keeps a legacy raw image key unchanged on mount and when previewing", () => {
  render(<Harness initial="product_image:10" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Preview Hero for Travel mug" })
  );
  expect(screen.getByTestId("value").textContent).toBe("product_image:10");
  expect(
    screen.getByRole("checkbox", { name: /Use 2 for Travel mug/ })
  ).toHaveProperty("checked", true);
});

it("allows browsing a locked gallery without mutating its saved reference", () => {
  render(<Harness initial="product_image:9" locked />);
  fireEvent.click(
    screen.getByRole("button", { name: "Preview 2 for Travel mug" })
  );
  expect(screen.getByTestId("value").textContent).toBe("product_image:9");
  expect(
    screen.queryByRole("checkbox", { name: /Use 2 for Travel mug/ })
  ).toBeNull();
});

it("shows pending component galleries without selecting them and retains their saved legacy choice", () => {
  const component = fixture.products[0] as any;
  component.componentKind = "Chassis";
  component.unavailableReason = "Review needed in Catalog before use.";
  try {
    const view = render(<Harness initial="" />);
    expect(screen.getByText("Chassis Option")).toBeTruthy();
    expect(
      within(
        screen.getByRole("article", { name: "Product Travel mug" })
      ).getByRole("status").textContent
    ).toContain("Review needed");
    expect(screen.queryByRole("checkbox", { name: /Use Hero/ })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview 2 for Travel mug" })
    );
    expect(screen.getByTestId("value").textContent).toBe("");
    view.unmount();
    render(<Harness initial="product_image:10" />);
    expect(
      screen.getByRole("button", { name: "Preview selected Travel mug" })
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "saved selection is retained"
    );
    expect(screen.getByTestId("value").textContent).toBe("product_image:10");
  } finally {
    delete component.componentKind;
    delete component.unavailableReason;
  }
});

it("renders promoted chassis as an independent option while preserving an old parent image selection", () => {
  const parent = fixture.products[0] as any;
  const oldImages = parent.images;
  parent.representedGroupIds = ["case:7"];
  parent.images = [
    oldImages[0],
    {
      ...oldImages[1],
      media: {
        width: 700,
        height: 700,
        references: [{ groupId: "case:7", imageId: "back", position: 0 }],
      },
    },
  ];
  (fixture.products as any[]).push({
    ...parent,
    id: 8,
    name: "Chassis: white case",
    componentKind: "Chassis",
    primaryImageId: 11,
    representedGroupIds: [],
    images: [
      {
        key: "product_image:11",
        name: "White case",
        url: "/case-original.png",
        isPrimary: 1,
      },
    ],
  });
  fixture.pageIds.push(8);
  try {
    render(<Harness initial="product_image:10" />);
    expect(screen.getByText("Chassis Option")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(
      within(
        screen.getByRole("article", { name: "Product Travel mug" })
      ).queryByRole("button", { name: "Preview 2 for Travel mug" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Preview selected Travel mug" })
    ).toBeTruthy();
    expect(screen.getByTestId("value").textContent).toBe("product_image:10");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Use Hero for Chassis: white case/ })
    );
    expect(JSON.parse(screen.getByTestId("value").textContent!)).toMatchObject({
      productId: 8,
      imageKey: "product_image:11",
    });
  } finally {
    parent.images = oldImages;
    delete parent.representedGroupIds;
    fixture.products.pop();
    fixture.pageIds.pop();
  }
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

it("adds product views in order and removes a selected view without dropping others", () => {
  render(
    <Harness
      kind="product"
      initial={JSON.stringify({ productId: 7, imageKey: "product_image:9" })}
    />
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Use 2 for Travel mug/ })
  );
  expect(
    JSON.parse(screen.getByTestId("value").textContent!).imageKeys
  ).toEqual(["product_image:9", "product_image:10"]);
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Use Hero for Travel mug/ })
  );
  expect(JSON.parse(screen.getByTestId("value").textContent!)).toMatchObject({
    imageKey: "product_image:10",
    imageKeys: ["product_image:10"],
  });
});
it("retains an over-budget legacy selection, blocks additions and permits removal", () => {
  render(
    <Harness
      kind="product"
      referenceBudget={{ limit: 1, modelName: "One-frame model", reserved: 1 }}
      initial={JSON.stringify({
        productId: 7,
        imageKey: "product_image:9",
        imageKeys: ["product_image:9", "product_image:10"],
      })}
    />
  );
  expect(screen.getByText(/your selections have been retained/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Use 2 for Travel mug/ })
  );
  expect(
    JSON.parse(screen.getByTestId("value").textContent!).imageKeys
  ).toEqual(["product_image:9"]);
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Use 2 for Travel mug/ })
  );
  expect(
    JSON.parse(screen.getByTestId("value").textContent!).imageKeys
  ).toEqual(["product_image:9"]);
});
