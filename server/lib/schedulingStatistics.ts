/**
 * Purchase efficiency, NOT ROAS or causal lift. Independent Poisson counts with
 * spend as exposure and Jeffreys prior p(rate) proportional to rate^(-1/2).
 * Posterior rate_i ~ Gamma(purchases_i + 0.5, rate=spend_i).
 * See docs/scheduling-statistics.md for assumptions, limitations and validation.
 */
export type PurchaseBucket = {
  labels: string[];
  spend: number | null;
  purchases: number | null;
};
const DRAWS = 40000;
function random(seed = 817321) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296;
  };
}
function gamma(shape: number, uniform: () => number): number {
  if (shape < 1)
    return gamma(shape + 1, uniform) * Math.pow(uniform(), 1 / shape);
  const d = shape - 1 / 3,
    c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x =
      Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
    const v0 = 1 + c * x;
    if (v0 <= 0) continue;
    const v = v0 ** 3,
      u = uniform();
    if (
      u < 1 - 0.0331 * x ** 4 ||
      Math.log(u) < (x * x) / 2 + d * (1 - v + Math.log(v))
    )
      return d * v;
  }
}
export function purchaseEfficiencyConfidence(
  groups: PurchaseBucket[],
  incomplete = false
) {
  const unavailable = (reason: string) => ({
    method: "gamma_poisson_jeffreys_v1",
    metric: "cost_per_purchase",
    confidence: null as number | null,
    candidate: null as string | null,
    reason,
    draws: 0,
    comparisons: [] as Array<{
      label: string;
      probabilityBest: number;
      cpaInterval95: [number, number];
    }>,
    monteCarloStandardError: null as number | null,
  });
  if (incomplete)
    return unavailable(
      "Incomplete or unreconciled data; probability is not estimable."
    );
  if (groups.some(g => g.spend === null || g.purchases === null))
    return unavailable(
      "Purchase counts or spend are missing. Missing values are not zero."
    );
  if (
    groups.some(
      g =>
        !Number.isFinite(g.spend) ||
        g.spend! < 0 ||
        !Number.isSafeInteger(g.purchases) ||
        g.purchases! < 0
    )
  )
    return unavailable(
      "This count model requires non-negative integer purchases and finite spend. Fractional/modelled counts are not rounded."
    );
  if (groups.some(g => g.spend === 0 && g.purchases! > 0))
    return unavailable(
      "Purchases with zero spend cannot be compared using a spend-exposure model."
    );
  const buckets = groups
    .filter(g => g.spend! > 0)
    .slice()
    .sort((a, b) => a.labels.join(" / ").localeCompare(b.labels.join(" / ")));
  if (buckets.length < 2)
    return unavailable(
      "At least two periods with spend are needed for a comparison."
    );
  if (!buckets.some(g => g.purchases! > 0))
    return unavailable(
      "No attributed purchases were reported; there is no purchase-efficiency leader to evaluate."
    );
  // Evaluate the observed CPA leader against ALL observed eligible buckets,
  // not only a hand-picked runner-up. Never infer unobserved hours/weekdays.
  const leader = buckets.reduce(
    (best, b, i) =>
      b.purchases! / b.spend! > buckets[best].purchases! / buckets[best].spend!
        ? i
        : best,
    0
  );
  const rng = random(),
    wins = buckets.map(() => 0),
    rates = buckets.map(() => [] as number[]);
  for (let draw = 0; draw < DRAWS; draw++) {
    let winner = 0,
      maximum = -Infinity;
    buckets.forEach((g, i) => {
      const rate = gamma(g.purchases! + 0.5, rng) / g.spend!;
      rates[i].push(rate);
      if (rate > maximum) {
        maximum = rate;
        winner = i;
      }
    });
    wins[winner]++;
  }
  const comparisons = buckets.map((g, i) => {
    const sorted = rates[i].sort((a, b) => a - b);
    return {
      label: g.labels.join(" / "),
      probabilityBest: wins[i] / DRAWS,
      cpaInterval95: [
        1 / sorted[Math.floor(DRAWS * 0.975)],
        1 / sorted[Math.floor(DRAWS * 0.025)],
      ] as [number, number],
    };
  });
  const confidence = wins[leader] / DRAWS;
  return {
    method: "gamma_poisson_jeffreys_v1",
    metric: "cost_per_purchase",
    confidence,
    candidate: comparisons[leader].label,
    reason: null,
    draws: DRAWS,
    comparisons,
    monteCarloStandardError: Math.sqrt((confidence * (1 - confidence)) / DRAWS),
  };
}
