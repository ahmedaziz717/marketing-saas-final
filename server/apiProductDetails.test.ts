import { beforeEach, expect, it, vi } from "vitest";
import { apiCatalogConfigSchema } from "../shared/apiCatalog";
const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./lib/apiCatalog", async original => ({
  ...(await original<any>()),
  fetchApiCatalog: mock.fetch,
}));
import {
  normalizeApiProductDetails,
  readApiProductDetails,
} from "./lib/apiProductDetails";
beforeEach(() => vi.clearAllMocks());
const config = apiCatalogConfigSchema.parse({
  componentImageUrlTemplate:
    "https://cdn.example/components/{code}/featured.png",
  componentsPath: "components",
});
it("keeps selected parts, nested enabled upgrades and their image identities separate", () => {
  const data = {
    code: "kit-1",
    name: "PC",
    components: {
      memory: {
        code: "ram-16",
        name: "16 GB DDR5",
        quantity: 2,
        selected: true,
        upgrades: [
          {
            code: "ram-32",
            name: "32 GB DDR5",
            price: 55,
            specs: { capacity: 32 },
          },
          { code: "unavailable", name: "Unsupported RAM", enabledInKit: false },
        ],
      },
      barebone: { code: "laptop-1", name: "Laptop chassis", quantity: 1 },
      monitor: { name: "No Monitor", selected: [{ code: "none", quantity: 1 }], upgrades: [] },
    },
  };
  const result = normalizeApiProductDetails(data, config);
  expect(result.components[0].selected).toMatchObject({
    code: "ram-16",
    quantity: 2,
    imageUrl: "https://cdn.example/components/ram-16/featured.png",
  });
  expect(result.components[0].options).toHaveLength(1);
  expect(result.components[0].options[0]).toMatchObject({
    code: "ram-32",
    apiPrice: "55",
    imageUrl: "https://cdn.example/components/ram-32/featured.png",
  });
  expect(result.components[1].selected?.imageUrl).toContain("laptop-1");
  expect(result.components[2].selected).toBeNull();
  expect(result.priceNote).toContain("not product prices");
});
it("never forwards catalog credentials to another origin and caches repeated reads by workspace/source", async () => {
  mock.fetch.mockResolvedValue({ components: {} });
  await expect(
    readApiProductDetails(
      "https://api.example/kits",
      "https://other.example/kit",
      config,
      "org:1"
    )
  ).rejects.toThrow(/origin/);
  expect(mock.fetch).not.toHaveBeenCalled();
  await readApiProductDetails(
    "https://api.example/kits",
    "https://api.example/kits/one",
    config,
    "org:1"
  );
  await readApiProductDetails(
    "https://api.example/kits",
    "https://api.example/kits/one",
    config,
    "org:1"
  );
  expect(mock.fetch).toHaveBeenCalledTimes(1);
  await readApiProductDetails(
    "https://api.example/kits",
    "https://api.example/kits/one",
    config,
    "org:2"
  );
  expect(mock.fetch).toHaveBeenCalledTimes(2);
});
