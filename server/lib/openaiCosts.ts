import { z } from "zod";
import { rangeSchema, type DateRange } from "../../shared/channels";

const pageSchema = z.object({
  data: z.array(
    z.object({
      start_time: z.number(),
      end_time: z.number(),
      results: z.array(
        z.object({
          amount: z.object({
            value: z.number().finite(),
            currency: z.string(),
          }),
          project_id: z.string().nullish(),
          line_item: z.string().nullish(),
          quantity: z.number().nullish(),
          quantity_unit: z.string().nullish(),
        })
      ),
    })
  ),
  has_more: z.boolean(),
  next_page: z.string().nullish(),
});
export type CostRow = {
  date: string;
  projectId: string | null;
  lineItem: string | null;
  amountUsd: number;
  quantity: number | null;
  quantityUnit: string | null;
};
export type OpenAICostReport = {
  range: DateRange;
  syncedAtMs: number;
  amountUsd: number;
  rows: CostRow[];
};
export class BillingError extends Error {}

/** Fixed official endpoint: the administrative credential never goes to a model proxy. */
export async function fetchOpenAICosts(
  range: DateRange,
  key: string,
  request: typeof fetch = fetch
): Promise<OpenAICostReport> {
  rangeSchema.parse(range);
  if (!key.trim())
    throw new BillingError(
      "Add OPENAI_ADMIN_KEY to the web service to connect OpenAI billing."
    );
  const rows: CostRow[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  // One year takes at most three 180-day pages; allow extra provider pagination,
  // but never return an incomplete result as a successful zero/partial bill.
  for (let page = 0; page < 20; page++) {
    const url = new URL("https://api.openai.com/v1/organization/costs");
    url.searchParams.set(
      "start_time",
      String(Date.parse(range.since + "T00:00:00Z") / 1000)
    );
    url.searchParams.set(
      "end_time",
      String(Date.parse(range.until + "T00:00:00Z") / 1000 + 86400)
    );
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "180");
    url.searchParams.append("group_by", "project_id");
    url.searchParams.append("group_by", "line_item");
    if (cursor) url.searchParams.set("page", cursor);
    let response: Response;
    try {
      response = await request(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      });
    } catch {
      throw new BillingError(
        "OpenAI billing could not be reached. Try syncing again shortly."
      );
    }
    if (!response.ok) {
      // Never forward raw upstream bodies, request headers, or credentials.
      if (response.status === 401 || response.status === 403)
        throw new BillingError(
          "OpenAI denied billing access. Check that OPENAI_ADMIN_KEY is an organization Admin key authorized to read costs."
        );
      if (response.status === 429)
        throw new BillingError(
          "OpenAI billing is rate limited. Try again in a few minutes."
        );
      throw new BillingError(
        `OpenAI billing request failed (HTTP ${response.status}).`
      );
    }
    let data: z.infer<typeof pageSchema>;
    try {
      data = pageSchema.parse(await response.json());
    } catch {
      throw new BillingError(
        "OpenAI returned an unsupported billing response; no costs were imported."
      );
    }
    for (const bucket of data.data) {
      const date = new Date(bucket.start_time * 1000)
        .toISOString()
        .slice(0, 10);
      if (date < range.since || date > range.until)
        throw new BillingError(
          "OpenAI returned costs outside the requested dates."
        );
      for (const row of bucket.results) {
        if (row.amount.currency.toLowerCase() !== "usd")
          throw new BillingError(
            "OpenAI returned a non-USD currency. Costs were not converted automatically."
          );
        rows.push({
          date,
          projectId: row.project_id ?? null,
          lineItem: row.line_item ?? null,
          amountUsd: row.amount.value,
          quantity: row.quantity ?? null,
          quantityUnit: row.quantity_unit ?? null,
        });
      }
    }
    if (!data.has_more)
      return {
        range,
        syncedAtMs: Date.now(),
        amountUsd: rows.reduce((s, r) => s + r.amountUsd, 0),
        rows,
      };
    if (!data.next_page || cursors.has(data.next_page))
      throw new BillingError(
        "OpenAI billing pagination was incomplete. Try a shorter date range."
      );
    cursor = data.next_page;
    cursors.add(cursor);
  }
  throw new BillingError(
    "OpenAI billing returned too many pages. Try a shorter date range."
  );
}

const cache = new Map<
  string,
  { value?: OpenAICostReport; pending?: Promise<OpenAICostReport> }
>();
export async function openAICosts(range: DateRange, refresh = false) {
  const key = process.env.OPENAI_ADMIN_KEY ?? "";
  if (!key.trim())
    throw new BillingError(
      "Add OPENAI_ADMIN_KEY to the web service to connect OpenAI billing."
    );
  const id = JSON.stringify(range);
  const entry = cache.get(id);
  if (entry?.pending) return entry.pending;
  if (
    !refresh &&
    entry?.value &&
    Date.now() - entry.value.syncedAtMs < 10 * 60000
  )
    return entry.value;
  const current: {
    value?: OpenAICostReport;
    pending?: Promise<OpenAICostReport>;
  } = {};
  const pending = fetchOpenAICosts(range, key)
    .then(value => {
      current.value = value;
      return value;
    })
    .finally(() => {
      delete current.pending;
    });
  current.pending = pending;
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(id, current);
  return pending;
}

/** Read-only startup check also warms the current-month dashboard cache. */
export function verifyOpenAIBilling() {
  if (!process.env.OPENAI_ADMIN_KEY) return;
  const today = new Date().toISOString().slice(0, 10);
  void openAICosts({ since: today.slice(0, 7) + "-01", until: today })
    .then(result => {
      console.info(
        "[OpenAI billing] Verified",
        JSON.stringify({
          range: result.range,
          amountUsd: result.amountUsd,
          lineItems: result.rows.length,
          projects: new Set(result.rows.map(r => r.projectId)).size,
        })
      );
    })
    .catch(error => {
      console.warn(
        "[OpenAI billing]",
        error instanceof BillingError ? error.message : "Verification failed."
      );
    });
}
