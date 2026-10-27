import { expect, it, vi } from "vitest";
vi.mock("./lib/assetLibrary", () => ({ listLibrary: async () => [] }));
import {
  workflowMediaChoices,
  resolveWorkflowMedia,
} from "./lib/workflowMedia";
import { PgDialect } from "drizzle-orm/pg-core";
import { appFieldSchema } from "../shared/workflowInputs";

function resolutionDatabase(results: unknown[][]) {
  const predicates: { sql: string; params: unknown[] }[] = [];
  return {
    predicates,
    select: () => {
      const result = results.shift();
      const chain: any = {
        then: (resolve: any) => Promise.resolve(result).then(resolve),
        from: () => chain,
        orderBy: () => chain,
        offset: () => chain,
        limit: () => chain,
        where: (predicate: any) => {
          predicates.push(new PgDialect().sqlToQuery(predicate));
          return chain;
        },
      };
      return chain;
    },
  };
}
const executionField = appFieldSchema.parse({
  key: "photo",
  label: "Photo",
  kind: "asset",
  required: true,
});
const parentImage = {
  id: 800,
  productId: 7,
  storageKey: "original/component",
  media: {
    references: [{ groupId: "chassis:case", imageId: "front", position: 0 }],
  },
};
const approvedParent = {
  id: 7,
  name: "System",
  specifications: {},
  mediaGroups: [
    {
      id: "system:7",
      name: "System",
      role: "system",
      eligible: true,
      declaredImages: 1,
      imageIds: ["front"],
    },
    {
      id: "chassis:case",
      name: "Case",
      role: "optional_component",
      eligible: true,
      declaredImages: 1,
      imageIds: ["front"],
    },
  ],
};

it("includes tenant-owned pending components for draft use without approving them", async () => {
  const pending = {
    ...approvedParent,
    status: "pending",
    provenance: { "component.kind": "Chassis" },
  };
  const db = resolutionDatabase([[pending], [], []]);
  const result = await workflowMediaChoices(db as any, 3, {
    kind: "asset",
    search: "",
    offset: 0,
    selectedValue: "",
  });
  expect(result.products[0]).toMatchObject({
    componentKind: "Chassis",
    unavailableReason: null,
    reviewNotice: "Draft use allowed. Review product facts before publishing.",
  });
  expect(db.predicates[0].params).toEqual([3, "approved", "pending"]);
  expect(db.predicates[0].sql).toContain("->>'component.kind' is not null");
});

it("allows represented component photos for creation without rewriting their identity", async () => {
  const db = resolutionDatabase([[parentImage], [approvedParent]]);
  await expect(
    resolveWorkflowMedia(db as any, 3, executionField, "product_image:800")
  ).resolves.toMatchObject({ imageKey: "product_image:800" });
  expect(db.predicates[0].params).toEqual([3, 800]);
});

it("keeps a shared genuine system view eligible when only its component reference is represented", async () => {
  const image = {
    ...parentImage,
    media: {
      references: [
        ...parentImage.media.references,
        { groupId: "system:7", imageId: "front", position: 0 },
      ],
    },
  };
  const db = resolutionDatabase([
    [image],
    [approvedParent],
    [{ groupId: "chassis:case" }],
  ]);
  await expect(
    resolveWorkflowMedia(db as any, 3, executionField, "product_image:800")
  ).resolves.toMatchObject({ imageKey: "product_image:800" });
});

it.each(["ineligible", "withdrawn", "missing"])(
  "allows creation regardless of represented system reference classification: %s",
  async state => {
    const image = {
      ...parentImage,
      media: {
        references: [
          ...parentImage.media.references,
          { groupId: "system:7", imageId: "front", position: 0 },
        ],
      },
    };
    const groups = approvedParent.mediaGroups
      .filter(group => state !== "missing" || group.id !== "system:7")
      .map(group =>
        group.id !== "system:7"
          ? group
          : {
              ...group,
              eligible: state !== "ineligible",
              imageIds: state === "withdrawn" ? ["replacement"] : ["front"],
            }
      );
    const db = resolutionDatabase([
      [image],
      [{ ...approvedParent, mediaGroups: groups }],
      [{ groupId: "chassis:case" }],
    ]);
    await expect(
      resolveWorkflowMedia(db as any, 3, executionField, "product_image:800")
    ).resolves.toMatchObject({ imageKey: "product_image:800" });
  }
);

it("rejects an unavailable product or an image outside the tenant", async () => {
  const pending = resolutionDatabase([[{ ...parentImage, productId: 90 }], []]);
  await expect(
    resolveWorkflowMedia(pending as any, 3, executionField, "product_image:800")
  ).rejects.toThrow("unavailable for drafting");
  expect(pending.predicates[1].params).toEqual([3, 90, "approved", "pending"]);
  const foreign = resolutionDatabase([[]]);
  await expect(
    resolveWorkflowMedia(foreign as any, 3, executionField, "product_image:800")
  ).rejects.toThrow("available image belonging");
  expect(foreign.predicates[0].params).toEqual([3, 800]);
});

it("paginates products without truncating their galleries and retains a legacy selection outside the search page", async () => {
  const page = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
    name: `Product ${index + 1}`,
    specifications: {},
  }));
  const selectedProduct = { id: 90, name: "Saved product", specifications: {} };
  const gallery = Array.from({ length: 40 }, (_, index) => ({
    id: 100 + index,
    productId: 1,
    storageKey: `original/${index}`,
    url: `/original/${index}.png`,
    isPrimary: index === 0 ? 1 : 0,
  }));
  const selectedImage = {
    id: 900,
    productId: 90,
    storageKey: "original/saved",
    url: "/original/saved.png",
    isPrimary: 1,
  };
  const results = [
    [selectedImage],
    page,
    [selectedProduct],
    [...gallery, selectedImage],
    [],
  ];
  const limits: number[] = [];
  const db = {
    select: () => {
      const result = results.shift();
      const chain: any = {
        then: (resolve: any) => Promise.resolve(result).then(resolve),
        limit: (count: number) => {
          limits.push(count);
          return chain;
        },
      };
      for (const name of ["from", "where", "orderBy", "offset"])
        chain[name] = () => chain;
      return chain;
    },
  };
  const result = await workflowMediaChoices(db as any, 3, {
    kind: "asset",
    search: "Product",
    offset: 24,
    selectedValue: "product_image:900",
  });
  expect(result.pageIds).toEqual(page.slice(0, 24).map(product => product.id));
  expect(result.nextOffset).toBe(48);
  expect(
    result.products.find(product => product.id === 1)?.images
  ).toHaveLength(40);
  expect(result.products.find(product => product.id === 90)?.images).toEqual([
    expect.objectContaining({
      key: "product_image:900",
      url: "/original/saved.png",
    }),
  ]);
  expect(result.pageIds).not.toContain(90);
  expect(result.products.some(product => product.id === 25)).toBe(false);
  expect(limits).toEqual([25]);
});

it("returns original gallery identity and primary metadata without flattening or renumbering saved image keys", async () => {
  const groups = [
    {
      id: "system:7",
      name: "Mug",
      role: "system",
      eligible: true,
      declaredImages: 2,
    },
  ];
  const media = {
    width: 1200,
    height: 1200,
    references: [{ groupId: "system:7", imageId: "back", position: 1 }],
  };
  const rows = [
    [
      {
        id: 7,
        name: "Mug",
        specifications: {},
        mediaGroups: groups,
        provenance: {},
      },
    ],
    [
      {
        id: 9,
        productId: 7,
        storageKey: "original/front",
        url: "/front-original.png",
        isPrimary: 1,
        media: null,
      },
      {
        id: 10,
        productId: 7,
        storageKey: "original/back",
        url: "/back-original.png",
        isPrimary: 0,
        media,
      },
    ],
    [{ parentProductId: 7, groupId: "chassis:case", kind: "Chassis" }],
  ];
  const db = {
    select: () => {
      const result = rows.shift();
      const chain: any = {
        then: (resolve: any) => Promise.resolve(result).then(resolve),
      };
      for (const name of ["from", "where", "orderBy", "offset", "limit"])
        chain[name] = () => chain;
      return chain;
    },
  };
  const result = await workflowMediaChoices(db as any, 3, {
    kind: "asset",
    search: "",
    offset: 0,
    selectedValue: "",
  });
  expect(result.products).toHaveLength(1);
  expect(result.products[0]).toMatchObject({
    id: 7,
    primaryImageId: 9,
    mediaGroups: groups,
    representedGroupIds: ["chassis:case"],
    componentKind: null,
  });
  expect(result.products[0].images).toEqual([
    {
      key: "product_image:9",
      name: "Mug",
      url: "/front-original.png",
      isPrimary: 1,
      media: null,
    },
    {
      key: "product_image:10",
      name: "Mug",
      url: "/back-original.png",
      isPrimary: 0,
      media,
    },
  ]);
});

it("resolves all ten ordered views of one pending SKU with per-view tenant and product guards", async () => {
  const keys = Array.from({ length: 10 }, (_, i) => `product_image:${800 + i}`);
  const db = resolutionDatabase(
    keys.flatMap((_, i) => [
      [{ ...parentImage, id: 800 + i }],
      [{ ...approvedParent, status: "pending" }],
    ])
  );
  const field = appFieldSchema.parse({ kind: "product" });
  const result = await resolveWorkflowMedia(
    db as any,
    3,
    field,
    JSON.stringify({ productId: 7, imageKey: keys[0], imageKeys: keys })
  );
  expect(result.imageKeys).toEqual(keys);
  expect(result.imageKey).toBe(keys[0]);
  for (let i = 0; i < 10; i++) {
    expect(db.predicates[i * 2].params).toEqual([3, 800 + i]);
    expect(db.predicates[i * 2 + 1].params).toEqual([
      3,
      7,
      "approved",
      "pending",
    ]);
  }
});
it("rejects a mismatched or retired later image rather than silently dropping it", async () => {
  const field = appFieldSchema.parse({ kind: "product" });
  const value = JSON.stringify({
    productId: 7,
    imageKeys: ["product_image:800", "product_image:801"],
  });
  for (const second of [
    { ...parentImage, id: 801, productId: 99 },
    { ...parentImage, id: 801, media: { ...parentImage.media, retired: true } },
  ]) {
    const db = resolutionDatabase([
      [parentImage],
      [approvedParent],
      [second],
      [approvedParent],
    ]);
    await expect(
      resolveWorkflowMedia(db as any, 3, field, value)
    ).rejects.toThrow(/belonging|retired/);
  }
});
