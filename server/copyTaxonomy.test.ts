import { expect, it } from "vitest";
import {
  classifyCopy,
  classifyCopyText,
  publicationCopyTags,
  copyDimensions,
  copyTaxonomy,
} from "../shared/copyTaxonomy";
const values = (text: string, dimension: (typeof copyDimensions)[number]) =>
  classifyCopyText(text)
    .dimensions.find(d => d.dimension === dimension)!
    .labels.map(l => l.value);

it("distinguishes incentives, angle, tone and urgency instead of collapsing them into style", () => {
  const text =
    "Finally, a custom-built gaming PC with 32GB memory so you can enjoy faster play. Save $200. Today only. Shop now.";
  expect(values(text, "messaging_angle")).toEqual(
    expect.arrayContaining(["performance", "savings", "customization"])
  );
  expect(values(text, "emotional_tone")).toContain("relief");
  expect(values(text, "benefit_feature")).toEqual(["mixed"]);
  expect(values(text, "offer")).toEqual(["amount_discount"]);
  expect(values(text, "urgency")).toEqual(
    expect.arrayContaining(["time_limited", "immediate_cta"])
  );
  expect(values(text, "specificity")).toEqual(
    expect.arrayContaining(["price", "technical_spec"])
  );
  expect(values(text, "messaging_style")).toContain("direct");
  expect(classifyCopyText(text).dimensions).toHaveLength(8);
  for (const dimension of classifyCopyText(text).dimensions)
    for (const label of dimension.labels) {
      expect(
        copyTaxonomy[dimension.dimension].values.some(v => v.id === label.value)
      ).toBe(true);
      if (dimension.dimension !== "copy_length")
        for (const evidence of label.evidence) expect(text).toContain(evidence);
    }
});
it("does not turn ordinary prices, missing copy or unsupported emotion into an offer or a confident tone", () => {
  expect(values("A PC for $899", "offer")).toEqual(["no_explicit_offer"]);
  expect(values("A PC for $899", "specificity")).toEqual(["price"]);
  expect(values("A PC for $899", "emotional_tone")).toEqual([]);
  expect(
    classifyCopyText("").dimensions.every(
      d => !d.labels.length && d.unknownReason
    )
  ).toBe(true);
  expect(values("No free shipping. No discounts.", "offer")).toEqual([
    "no_explicit_offer",
  ]);
  expect(
    values("No free trial, but free shipping is included.", "offer")
  ).toEqual(["free_shipping"]);
  expect(values("No rush. Take your time.", "urgency")).toEqual([
    "no_pressure",
  ]);
});
it("measures actual text length and keeps variants and authored image subheadlines separate", () => {
  const result = publicationCopyTags(
    {
      headline: "Build your dream PC",
      message: "Shop now",
      description: "32GB memory",
      textVariants: { headlines: ["Save $200", "Build your dream PC"] },
    },
    "Enjoy faster play"
  );
  expect(result.fields.headline).toHaveLength(2);
  expect(result.fields.subheadline[0].text).toBe("Enjoy faster play");
  expect(result.fields.primary_text[0].text).toBe("Shop now");
  expect(result.fields.headline[0]).toMatchObject({ words: 4, characters: 19 });
  expect(values("🚀", "copy_length")).toEqual(["nonverbal"]);
  expect(
    classifyCopy({ headline: ["  Save $200  "] }).fields.headline[0].text
  ).toBe("Save $200");
  expect(classifyCopy({ headline: ["Great PC"] }).fields.subheadline).toEqual(
    []
  );
});
