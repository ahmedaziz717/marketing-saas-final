import { describe, expect, it } from "vitest";
import {
  resolveCatalogImage,
  apiCatalogConfigSchema,
} from "../shared/apiCatalog";
import { orderedSpecifications } from "../shared/catalogFacts";
import { apiMappingRevision, parseApiCatalog } from "./lib/apiCatalog";
import {
  defaultInsightConfig,
  selectedInsightMetrics,
} from "../shared/insights";
import { aggregateInsightSeries } from "../shared/insightCharts";

describe("source-owned catalog media and ordering", () => {
  it("retains URL semantics unless directory semantics are explicitly configured", () => {
    expect(
      resolveCatalogImage(
        "/kits/a.png?sig=abc%2F123",
        "https://cdn.example/tenant/"
      )
    ).toBe("https://cdn.example/kits/a.png?sig=abc%2F123");
    expect(
      resolveCatalogImage(
        "/kits/a.png?sig=abc%2F123",
        "https://cdn.example/tenant/",
        "directory"
      )
    ).toBe("https://cdn.example/tenant/kits/a.png?sig=abc%2F123");
    expect(
      resolveCatalogImage(
        "https://other.example/a.png",
        "https://cdn.example/tenant/",
        "directory"
      )
    ).toBe("https://other.example/a.png");
    expect(() =>
      resolveCatalogImage("file:///etc/passwd", "https://cdn.example/")
    ).toThrow();
  });
  it("persists mapping identity and image gallery through a configuration round trip", () => {
    const config = apiCatalogConfigSchema.parse({
      imageBaseUrl: "https://cdn.example/brand",
      imagePathMode: "directory",
      imagesPath: "gallery",
      fields: { imageUrl: "hero" },
    });
    const raw = [
      {
        id: "1",
        name: "First",
        hero: "/kits/a.png",
        gallery: [{ url: "b.png" }, { src: "https://other.example/c.png" }],
        components: { fan: { name: "Fan", image: "not-a-product.png" } },
      },
    ];
    const before = parseApiCatalog(raw, "https://api.example/catalog", config);
    const saved = apiCatalogConfigSchema.parse(
      JSON.parse(JSON.stringify(config))
    );
    expect(
      parseApiCatalog(raw, "https://api.example/catalog", saved).items
    ).toEqual(before.items);
    expect(before.items[0].imageUrls).toEqual([
      "https://cdn.example/brand/kits/a.png",
      "https://cdn.example/brand/b.png",
      "https://other.example/c.png",
    ]);
    expect(apiMappingRevision("https://api.example/catalog", config)).toBe(
      apiMappingRevision("https://api.example/catalog", saved)
    );
    expect(
      apiMappingRevision("https://api.example/catalog", {
        ...saved,
        imagePathMode: "url",
      })
    ).not.toBe(apiMappingRevision("https://api.example/catalog", saved));
  });
  it("uses explicit order before category priorities without losing facts", () => {
    const specifications = {
      Warranty: "3 years",
      CPU: "Processor",
      Memory: "2 × 16 GB",
      Color: "Black",
      GPU: "Graphics",
    };
    expect(
      Object.keys(
        orderedSpecifications({ category: "Desktop PC", specifications })
      ).slice(0, 3)
    ).toEqual(["CPU", "GPU", "Memory"]);
    expect(
      Object.keys(
        orderedSpecifications({ category: "Apparel", specifications })
      )[0]
    ).toBe("Color");
    expect(
      Object.keys(
        orderedSpecifications({
          category: "Furniture",
          specifications: {
            Assembly: "Required",
            Material: "Oak",
            Dimensions: "100 × 60 cm",
          },
        })
      )
    ).toEqual(["Dimensions", "Material", "Assembly"]);
    const ordered = orderedSpecifications({
      category: "Desktop PC",
      specifications,
      provenance: {
        "specifications.order.user": JSON.stringify(["Warranty", "Color"]),
        "specifications.order.source": JSON.stringify(["GPU"]),
      },
    });
    expect(Object.keys(ordered).slice(0, 2)).toEqual(["Warranty", "Color"]);
    expect(ordered.Memory).toBe("2 × 16 GB");
  });
});
describe("account-aware report configuration", () => {
  it("defaults inactive campaigns off and restricts Google, Meta, mixed and empty scopes", () => {
    const config = defaultInsightConfig();
    expect(config.includeInactiveCampaigns).toBe(false);
    const connections = [
      { id: "g", channel: "google_ads" },
      { id: "m", channel: "meta_ads" },
      { id: "s", channel: "facebook" },
    ];
    config.metrics = ["spend", "clicks", "linkClicks", "views"];
    config.connectionIds = ["g"];
    expect(selectedInsightMetrics(config, connections).metrics).toEqual([
      "spend",
      "clicks",
    ]);
    config.connectionIds = ["m"];
    expect(selectedInsightMetrics(config, connections).metrics).toEqual([
      "spend",
      "linkClicks",
    ]);
    config.connectionIds = ["g", "m"];
    expect(selectedInsightMetrics(config, connections).metrics).toEqual([
      "spend",
      "clicks",
      "linkClicks",
    ]);
    config.connectionIds = [];
    expect(selectedInsightMetrics(config, connections).available).toEqual([]);
  });
  it("recomputes weekly ratios from totals rather than averaging daily ratios", () => {
    const account = {
      series: [
        {
          date: "2026-10-19",
          values: { spend: 10, purchaseValue: 100, roas: 10 },
        },
        {
          date: "2026-10-20",
          values: { spend: 90, purchaseValue: 90, roas: 1 },
        },
      ],
    } as any;
    expect(aggregateInsightSeries(account, "week")[0].values.roas).toBe(1.9);
    account.series[1].values.purchaseValue = null;
    expect(aggregateInsightSeries(account, "week")[0].values.roas).toBeNull();
  });
});
