// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioSources } from "./StudioSources";
import {
  defaultCreativeSetup,
  creativeProductViewCount,
  outputCount,
  type CreativeSetup,
} from "@shared/creativeBuilder";
import { defaultVideoSetup } from "@shared/videoCreation";
vi.mock("@/lib/trpc", () => ({
  trpc: {
    video: { catalogImages: { useQuery: () => ({ data: { items: [] } }) } },
  },
}));
vi.mock("@/components/AssetUploadDialog", () => ({
  AssetUploadDialog: () => null,
}));
vi.mock("./PageUrlSource", () => ({ PageUrlSource: () => null }));
afterEach(cleanup);
let latest: CreativeSetup;
const products = Array.from({ length: 4 }, (_, i) => ({
  id: i + 1,
  name: `Product ${i + 1}`,
  images: Array.from({ length: 5 }, (_, j) => ({
    id: i * 10 + j + 1,
    url: `/product-${i}-${j}.png`,
    isPrimary: j === 2 ? 1 : 0,
  })),
}));
function Harness({ initial = {} }: { initial?: Partial<CreativeSetup> }) {
  const [image, setImage] = useState({
    ...defaultCreativeSetup(),
    promotionMode: "offerings" as const,
    ...initial,
  });
  latest = image;
  return (
    <StudioSources
      organizationId={1}
      role="owner"
      kind="image"
      image={image}
      video={defaultVideoSetup}
      products={products}
      assets={[]}
      search=""
      updateImage={patch => setImage(old => ({ ...old, ...patch }))}
      updateVideo={vi.fn()}
      onUploaded={async () => {}}
    />
  );
}
const check = (label: string, product = 1) =>
  screen.getByRole("checkbox", {
    name: `Use ${label} for Product ${product} - Product photos`,
  }) as HTMLInputElement;
it("shows one preview per product, keeps actual Hero stable, and wires multiple views to schema and output counts", () => {
  render(<Harness initial={{ preserveProduct: true }} />);
  expect(screen.getAllByRole("button", { name: /Enlarge/ })).toHaveLength(4);
  fireEvent.click(check("Hero"));
  fireEvent.click(check("2"));
  expect(latest.products[0]).toMatchObject({ imageId: 3, imageIds: [3, 1] });
  expect(creativeProductViewCount(latest)).toBe(2);
  expect(outputCount(latest)).toBe(2 * latest.formatIds.length);
  fireEvent.click(
    screen.getByRole("button", { name: "Preview 3 for Product 1" })
  );
  expect(latest.products[0].imageIds).toEqual([3, 1]);
  fireEvent.click(check("Hero"));
  expect(latest.products[0]).toMatchObject({ imageId: 1, imageIds: [1] });
  expect(latest.preserveProduct).toBe(true);
  expect(
    screen.getByRole("button", { name: "Preview Hero for Product 1" })
  ).toBeTruthy();
});
it("limits separate mode to four views per product and twelve total, but permits removal", () => {
  render(<Harness />);
  for (const product of [1, 2, 3])
    for (const label of ["Hero", "2", "3", "4"])
      fireEvent.click(check(label, product));
  expect(creativeProductViewCount(latest)).toBe(12);
  expect(check("5").disabled).toBe(true);
  expect(check("Hero", 4).disabled).toBe(true);
  fireEvent.click(check("2"));
  expect(creativeProductViewCount(latest)).toBe(11);
  expect(check("Hero", 4).disabled).toBe(false);
});
it("limits together mode to one view and three products and supports legacy drafts", () => {
  render(
    <Harness
      initial={{
        productMode: "together",
        products: [
          {
            productId: 1,
            imageId: 3,
            featuredSpecKeys: ["cpu"],
            includePrice: true,
          },
        ],
      }}
    />
  );
  expect(check("Hero").checked).toBe(true);
  expect(check("2").disabled).toBe(true);
  fireEvent.click(check("Hero", 2));
  fireEvent.click(check("Hero", 3));
  expect(check("Hero", 4).disabled).toBe(true);
  fireEvent.click(check("Hero"));
  fireEvent.click(check("2"));
  expect(latest.products.find(p => p.productId === 1)?.imageIds).toEqual([1]);
});
