import { describe, expect, it } from "vitest";
import { purchaseEfficiencyConfidence as calculate } from "./lib/schedulingStatistics";
const bucket = (
  label: string,
  purchases: number | null,
  spend: number | null
) => ({ labels: [label], purchases, spend });
describe("purchase efficiency posterior", () => {
  it("matches analytic Gamma/Beta comparison and inverse-Gamma interval", () => {
    // Independent oracle: scipy.special.betainc and scipy.stats.gamma.ppf.
    const r = calculate([
      bucket("Friday", 7, 1083.52),
      bucket("Thursday", 4, 1519.95),
    ]);
    expect(r.confidence).toBeCloseTo(0.9297481651492391, 2);
    const ci = r.comparisons.find(c => c.label === "Friday")!.cpaInterval95;
    expect(ci[0]).toBeGreaterThan(76);
    expect(ci[0]).toBeLessThan(82);
    expect(ci[1]).toBeGreaterThan(334);
    expect(ci[1]).toBeLessThan(358);
    expect(r.candidate).toBe("Friday");
  });
  it("symmetric evidence splits probability among all candidates", () => {
    const r = calculate([
      bucket("a", 20, 100),
      bucket("b", 20, 100),
      bucket("c", 20, 100),
    ]);
    r.comparisons.forEach(c => expect(c.probabilityBest).toBeCloseTo(1 / 3, 2));
    expect(
      r.comparisons.reduce((s, c) => s + c.probabilityBest, 0)
    ).toBeCloseTo(1);
  });
  it("confidence rises and relative uncertainty narrows with stronger evidence", () => {
    const low = calculate([bucket("a", 2, 100), bucket("b", 1, 100)]);
    const high = calculate([bucket("a", 200, 10000), bucket("b", 100, 10000)]);
    expect(high.confidence!).toBeGreaterThan(low.confidence!);
    const width = (r: typeof high) =>
      r.comparisons[0].cpaInterval95[1] - r.comparisons[0].cpaInterval95[0];
    expect(width(high)).toBeLessThan(width(low));
  });
  it("is reproducible, order invariant and invariant to currency scaling", () => {
    const g = [bucket("a", 7, 100), bucket("b", 4, 150)];
    const r = calculate(g);
    expect(calculate([...g].reverse())).toEqual(r);
    const scaled = calculate(g.map(b => ({ ...b, spend: b.spend! * 100 })));
    expect(scaled.confidence).toBe(r.confidence);
    expect(scaled.comparisons[0].cpaInterval95[0]).toBeCloseTo(
      r.comparisons[0].cpaInterval95[0] * 100
    );
  });
  it.each([
    [bucket("a", null, 100), bucket("b", 4, 100)],
    [bucket("a", 0, 100), bucket("b", 0, 100)],
    [bucket("a", 1.5, 100), bucket("b", 4, 100)],
    [bucket("a", 1, 0), bucket("b", 4, 100)],
    [bucket("a", 1, -1), bucket("b", 4, 100)],
    [bucket("a", 1, Infinity), bucket("b", 4, 100)],
    [bucket("a", 1, 100)],
  ])(
    "withholds undefined or invalid confidence without inventing zero",
    (...g) => {
      expect(calculate(g).confidence).toBeNull();
    }
  );
  it("withholds partial coverage but includes observed zero-purchase competitors", () => {
    const g = [bucket("a", 2, 100), bucket("b", 0, 100)];
    expect(calculate(g, true).confidence).toBeNull();
    expect(calculate(g).comparisons).toHaveLength(2);
    expect(calculate(g).confidence).toBeGreaterThan(0.5);
  });
});
