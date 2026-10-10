import type { StoreProvider, CatalogEntry } from "../../shared/catalog";
import { safeStoreRequest } from "./websiteCrawler";
export type StoreCredentials = { token: string; secret?: string };
export function storeAddress(provider: StoreProvider, value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error(
      "Use the HTTPS store address without credentials or a custom port."
    );
  if (
    provider === "shopify" &&
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(url.hostname)
  )
    throw new Error("Use your store.myshopify.com address.");
  if (
    provider === "bigcommerce" &&
    !/^https:\/\/api\.bigcommerce\.com\/stores\/[a-z0-9]+\/?$/.test(value)
  )
    throw new Error("Use https://api.bigcommerce.com/stores/YOUR_STORE_HASH");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
export type StoreItem = CatalogEntry & {
  externalId: string;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    price: string;
    imageUrl: string;
    availability: string;
  }>;
};
export async function readStorePage(
  provider: StoreProvider,
  address: string,
  credentials: StoreCredentials,
  cursor: string | null
): Promise<{ items: StoreItem[]; next: string | null; total: number | null }> {
  const base = storeAddress(provider, address);
  const empty = {
    recordType: "standalone" as const,
    category: "",
    specifications: {},
    serviceDetails: null,
  };
  if (provider === "shopify") {
    const query = `query Catalog($after:String){ products(first:20,after:$after){pageInfo{hasNextPage endCursor}nodes{id title description handle productType onlineStoreUrl featuredImage{url} priceRangeV2{minVariantPrice{amount currencyCode}} variants(first:250){nodes{id title sku price image{url}} pageInfo{hasNextPage endCursor}}}}}`;
    const { data } = await safeStoreRequest(
      `${base}/admin/api/2026-07/graphql.json`,
      {
        "X-Shopify-Access-Token": credentials.token,
        "Content-Type": "application/json",
      },
      JSON.stringify({ query, variables: { after: cursor } })
    );
    if (data.errors?.length || !data.data?.products)
      throw new Error(
        "Shopify could not read the catalog. Check read_products permissions and API access."
      );
    const page = data.data.products;
    const items: StoreItem[] = [];
    for (const p of page.nodes) {
      const variants = [...p.variants.nodes];
      let info = p.variants.pageInfo;
      while (info.hasNextPage) {
        const more = await safeStoreRequest(
          `${base}/admin/api/2026-07/graphql.json`,
          {
            "X-Shopify-Access-Token": credentials.token,
            "Content-Type": "application/json",
          },
          JSON.stringify({
            query: `query Variants($id:ID!,$after:String){product(id:$id){variants(first:250,after:$after){nodes{id title sku price image{url}}pageInfo{hasNextPage endCursor}}}}`,
            variables: { id: p.id, after: info.endCursor },
          })
        );
        if (more.data.errors?.length || !more.data.data?.product?.variants)
          throw new Error(
            "Shopify variant pagination failed. Resume this sync to retry."
          );
        variants.push(...more.data.data.product.variants.nodes);
        info = more.data.data.product.variants.pageInfo;
      }
      items.push({
        ...empty,
        externalId: p.id,
        name: p.title,
        description: p.description,
        sku: variants[0]?.sku ?? "",
        category: p.productType ?? "",
        productUrl: p.onlineStoreUrl || `${base}/products/${p.handle}`,
        price: p.priceRangeV2.minVariantPrice.amount,
        currency: p.priceRangeV2.minVariantPrice.currencyCode,
        imageUrl: p.featuredImage?.url ?? "",
        variants: variants.map((v: any) => ({
          id: v.id,
          name: v.title,
          sku: v.sku ?? "",
          price: v.price,
          imageUrl: v.image?.url ?? "",
          availability: "unknown",
        })),
      });
    }
    return {
      items,
      next: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null,
      total: null,
    };
  }
  const page = Number(cursor || "1");
  if (!Number.isSafeInteger(page) || page < 1)
    throw new Error("Invalid saved catalog page");
  if (provider === "bigcommerce") {
    const { data } = await safeStoreRequest(
      `${base}/v3/catalog/products?limit=20&page=${page}&include=images,variants`,
      { "X-Auth-Token": credentials.token }
    );
    if (!Array.isArray(data.data))
      throw new Error("BigCommerce returned an invalid catalog response");
    const { data: store } = await safeStoreRequest(`${base}/v2/store`, {
      "X-Auth-Token": credentials.token,
    });
    return {
      items: data.data.map((p: any) => ({
        ...empty,
        externalId: String(p.id),
        name: p.name,
        description: String(p.description ?? "")
          .replace(/<[^>]*>/g, " ")
          .slice(0, 10000),
        sku: p.sku ?? "",
        productUrl: new URL(
          p.custom_url?.url || "/",
          store.secure_url || store.domain
        ).toString(),
        price: String(p.price ?? ""),
        currency: store.currency ?? "",
        imageUrl:
          p.images?.find((i: any) => i.is_thumbnail)?.url_standard ||
          p.images?.[0]?.url_standard ||
          "",
        variants: (p.variants ?? []).map((v: any) => ({
          id: String(v.id),
          name: v.option_values?.map((o: any) => o.label).join(" / ") || p.name,
          sku: v.sku || "",
          price: String(v.price ?? p.price ?? ""),
          imageUrl: v.image_url || "",
          availability: "unknown",
        })),
      })),
      next: page < data.meta.pagination.total_pages ? String(page + 1) : null,
      total: data.meta.pagination.total,
    };
  }
  const authorization = `Basic ${Buffer.from(`${credentials.token}:${credentials.secret || ""}`).toString("base64")}`;
  const { data, headers } = await safeStoreRequest(
    `${base}/wp-json/wc/v3/products?per_page=20&page=${page}&status=publish`,
    { Authorization: authorization }
  );
  if (!Array.isArray(data))
    throw new Error("WooCommerce returned an invalid catalog response");
  const currencyResponse = await safeStoreRequest(
    `${base}/wp-json/wc/v3/settings/general/woocommerce_currency`,
    { Authorization: authorization }
  );
  const currency = String(currencyResponse.data.value ?? "");
  const items: StoreItem[] = [];
  for (const p of data) {
    const variants: StoreItem["variants"] = [];
    if (p.type === "variable") {
      for (let vp = 1; ; vp++) {
        const response = await safeStoreRequest(
          `${base}/wp-json/wc/v3/products/${p.id}/variations?per_page=100&page=${vp}`,
          { Authorization: authorization }
        );
        for (const v of response.data)
          variants.push({
            id: String(v.id),
            name: v.attributes?.map((a: any) => a.option).join(" / ") || p.name,
            sku: v.sku || "",
            price: v.price || "",
            imageUrl: v.image?.src || "",
            availability: v.stock_status || "unknown",
          });
        if (vp >= Number(response.headers["x-wp-totalpages"] || 1)) break;
      }
    }
    items.push({
      ...empty,
      externalId: String(p.id),
      name: p.name,
      description: String(p.description ?? "")
        .replace(/<[^>]*>/g, " ")
        .slice(0, 10000),
      sku: p.sku || "",
      category:
        p.categories
          ?.map((c: any) => c.name)
          .join(", ")
          .slice(0, 240) || "",
      productUrl: p.permalink,
      price: p.price || "",
      currency,
      specifications: Object.fromEntries(
        (p.attributes || []).map((a: any) => [a.name, a.options.join(", ")])
      ),
      imageUrl: p.images?.[0]?.src || "",
      variants,
    });
  }
  return {
    items,
    next:
      page < Number(headers["x-wp-totalpages"] || 1) ? String(page + 1) : null,
    total: Number(headers["x-wp-total"] || items.length),
  };
}
