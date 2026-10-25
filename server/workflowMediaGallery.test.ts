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

it("includes tenant-owned pending components for browsing with an unavailable reason", async () => {
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
    unavailableReason: "Review needed in Catalog before use.",
  });
  expect(db.predicates[0].params).toEqual([3, "approved"]);
  expect(db.predicates[0].sql).toContain("->>'component.kind' is not null");
});

it("rejects represented parent component photos at execution without rewriting legacy selections", async () => {
  const db = resolutionDatabase([
    [parentImage],
    [approvedParent],
    [{ groupId: "chassis:case" }],
  ]);
  await expect(
    resolveWorkflowMedia(db as any, 3, executionField, "product_image:800")
  ).rejects.toThrow("separate component card");
  expect(db.predicates[2].sql).toContain(
    '"product_components"."organizationId"'
  );
  expect(db.predicates[2].params).toEqual([3, 7]);
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
  "rejects a represented option when its shared system reference is %s",
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
    ).rejects.toThrow("separate component card");
  }
);

it("does not accept a pending component or an image outside the tenant", async () => {
  const pending = resolutionDatabase([[{ ...parentImage, productId: 90 }], []]);
  await expect(
    resolveWorkflowMedia(pending as any, 3, executionField, "product_image:800")
  ).rejects.toThrow("has not been approved");
  expect(pending.predicates[1].params).toEqual([3, 90, "approved"]);
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
