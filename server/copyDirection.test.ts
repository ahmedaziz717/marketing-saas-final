import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import {
  copyDimensions,
  copyTaxonomy,
  publicationCopyTags,
} from "../shared/copyTaxonomy";
import {
  copyDirectionSchema,
  toggleCopyDirection,
} from "../shared/copyDirection";
import { contentSchema } from "../shared/channels";
import { metaWebsiteCallToActions } from "../shared/metaCallToAction";
import {
  metaLinkData,
  metaPlacementFeed,
  metaTextFeed,
} from "../shared/metaCreative";
import { copyDirectionArt } from "../client/src/components/activation/copyDirectionArt";

it("covers every optimization value with valid selection data and an existing image", () => {
  let count = 0;
  for (const dimension of copyDimensions) {
    expect(Object.keys(copyDirectionArt[dimension]).sort()).toEqual(
      copyTaxonomy[dimension].values.map(v => v.id).sort()
    );
    for (const value of copyTaxonomy[dimension].values) {
      count++;
      expect(
        copyDirectionSchema.safeParse({ [dimension]: [value.id] }).success
      ).toBe(true);
      expect(
        existsSync(
          `client/public/studio-art/${copyDirectionArt[dimension][value.id]}.webp`
        )
      ).toBe(true);
    }
  }
  expect(count).toBe(100);
});
it("rejects unknown taxonomy IDs, duplicate values, contradictory offers and multi-select single-choice dimensions", () => {
  for (const input of [
    { messaging_style: ["made_up"] },
    { unknown: ["playful"] },
    { offer: ["free_trial", "free_trial"] },
    { offer: ["free_trial", "no_explicit_offer"] },
    { copy_length: ["short", "long"] },
  ]) {
    expect(copyDirectionSchema.safeParse(input).success).toBe(false);
  }
  expect(
    toggleCopyDirection({ offer: ["free_trial"] }, "offer", "no_explicit_offer")
  ).toEqual({ offer: ["no_explicit_offer"] });
  expect(
    toggleCopyDirection({ copy_length: ["long"] }, "copy_length", "short")
  ).toEqual({ copy_length: ["short"] });
});
it("round trips creative intent while classifying actual text independently", () => {
  const saved = contentSchema.parse({
    title: "Draft",
    message: "Take your time. No pressure.",
    copyDirection: { messaging_style: ["competitive"], urgency: ["deadline"] },
  });
  const tags = publicationCopyTags(saved, []);
  expect(
    contentSchema.parse({ ...saved, copyTags: tags }).copyDirection
  ).toEqual(saved.copyDirection);
  const urgency = tags.fields.primary_text[0].dimensions.find(
    d => d.dimension === "urgency"
  )!;
  expect(urgency.labels.map(value => value.value)).toEqual(["no_pressure"]);
});
it.each(metaWebsiteCallToActions)(
  "preserves the $label CTA across single, carousel, placement and text-variant website creatives",
  ({ id }) => {
    const content = contentSchema.parse({
      title: "Draft",
      message: "See our collection",
      headline: "New collection",
      link: "https://example.com",
      callToAction: id,
    });
    expect(metaLinkData(content, ["hash"]).call_to_action?.type).toBe(id);
    expect(
      metaLinkData(content, ["hash", "other"]).child_attachments?.every(
        a => a.call_to_action.type === id
      )
    ).toBe(true);
    expect(
      metaTextFeed({
        ...content,
        textVariants: {
          messages: ["Another option"],
          headlines: [],
          descriptions: [],
        },
      }).call_to_action_types
    ).toEqual([id]);
    expect(
      metaPlacementFeed(
        {
          ...content,
          placementAssetKeys: {
            square: "asset:1",
            portrait: "asset:2",
            story: "asset:3",
          },
        },
        { "asset:1": "a", "asset:2": "b", "asset:3": "c" }
      ).call_to_action_types
    ).toEqual([id]);
  }
);
it("rejects CTAs that require unsupported phone/app/messenger destinations", () => {
  for (const callToAction of [
    "CALL_NOW",
    "INSTALL_MOBILE_APP",
    "MESSAGE_PAGE",
    "NOT_REAL",
  ])
    expect(
      contentSchema.safeParse({ title: "Draft", callToAction }).success
    ).toBe(false);
});
