import { strict as assert } from "node:assert";
import { eq } from "drizzle-orm";
import { products } from "../drizzle/schema";
import { getDb } from "../server/db";
import { canonicalProductIdentityUrl, deterministicProductFromPage } from "../server/lib/brandImport";
import { discoverSiteUrls, extractPageEvidence, safeFetchText } from "../server/lib/websiteCrawler";

const sourceUrl = process.argv[2] ?? "https://bambulab.com/en-us";
const expectedHandles = (process.argv[3] ?? "a1,p1s,p2s,h2d,h2s,h2c,x2d,a2l").split(",").map(value => value.trim()).filter(Boolean);
const expectedNames: Record<string, string> = { a1: "Bambu Lab A1 3D Printer", p1s: "Bambu Lab P1S 3D Printer", p2s: "Bambu Lab P2S", h2d: "Bambu Lab H2D", h2s: "Bambu Lab H2S", h2c: "Bambu Lab H2C", x2d: "Bambu Lab X2D", a2l: "Bambu Lab A2L" };
const discovered = await discoverSiteUrls(sourceUrl, 150);
const identities = new Set(discovered.map(canonicalProductIdentityUrl));
for (const handle of expectedHandles) {
  const match = discovered.find(url => new URL(url).pathname.replace(/\/$/, "").endsWith(`/products/${handle}`));
  assert(match, `Expected product handle was not discovered: ${handle}`);
  assert(identities.has(canonicalProductIdentityUrl(match)), `Canonical identity missing for ${handle}`);
}
const samples = discovered.filter(url => expectedHandles.some(handle => new URL(url).pathname.replace(/\/$/, "").endsWith(`/products/${handle}`)));
const report = [];
for (const url of samples) {
  const html = (await safeFetchText(url)).text;
  const evidence = extractPageEvidence(html, url);
  const product = deterministicProductFromPage({ url, title: evidence.title, description: evidence.description, structuredProducts: evidence.structuredProducts, specifications: evidence.specifications, commerceMeta: evidence.commerceMeta, imageUrls: evidence.imageUrls });
  assert(product, `No deterministic product extracted from ${url}`);
  assert(product.imageUrls.length > 0, `No product images extracted from ${url}`);
  assert(Object.keys(product.specifications).length > 0, `No specifications extracted from ${url}`);
  assert(product.variants.length > 0, `No variants extracted from ${url}`);
  const handle = expectedHandles.find(value => new URL(url).pathname.replace(/\/$/, "").endsWith(`/products/${value}`))!;
  assert.equal(product.name, expectedNames[handle], `Unexpected flagship name for ${handle}`);
  assert(product.recordType === "family", `Expected a first-class product family for ${url}, received ${product.recordType}`);
  report.push({ url, name: product.name, recordType: product.recordType, variants: product.variants.length, specifications: Object.keys(product.specifications).length, price: product.price });
}
const normalizedFixtureUrls = samples.flatMap(url => [url, `${url.replace(/\/$/, "")}/?utm_source=validation`]);
assert.equal(new Set(normalizedFixtureUrls.map(canonicalProductIdentityUrl)).size, samples.length, "Canonical URL variants did not collapse to one identity per flagship product");

let catalogDeduplication: { organizationId: number; productCount: number; canonicalIdentities: number } | null = null;
const organizationId = Number(process.env.VALIDATE_ORG_ID ?? 0);
if (organizationId > 0) {
  const db = await getDb();
  assert(db, "Database is unavailable for catalog deduplication validation");
  const catalog = await db.select({ id: products.id, productUrl: products.productUrl }).from(products).where(eq(products.organizationId, organizationId));
  const canonicalIdentities = new Set(catalog.map(product => canonicalProductIdentityUrl(product.productUrl)));
  assert.equal(canonicalIdentities.size, catalog.length, `Organization ${organizationId} contains duplicate canonical product URLs`);
  catalogDeduplication = { organizationId, productCount: catalog.length, canonicalIdentities: canonicalIdentities.size };
}

console.log(JSON.stringify({ sourceUrl, discovered: discovered.length, expectedHandles, expectedNames, canonicalFixtureIdentities: samples.length, catalogDeduplication, samples: report }, null, 2));
