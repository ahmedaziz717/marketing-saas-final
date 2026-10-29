import { z } from "zod";

/** Shared by publication saves, imported ads, reports and workflow results. */
export const COPY_TAXONOMY_VERSION = 2;
export const copyDimensions = [
  "messaging_style",
  "messaging_angle",
  "emotional_tone",
  "benefit_feature",
  "urgency",
  "offer",
  "specificity",
  "copy_length",
] as const;
export type CopyDimension = (typeof copyDimensions)[number];
type Value = {
  id: string;
  label: string;
  description: string;
  pattern?: RegExp;
};
const v = (
  id: string,
  label: string,
  description: string,
  pattern?: RegExp
): Value => ({ id, label, description, pattern });
export const copyTaxonomy: Record<
  CopyDimension,
  { label: string; question: string; multiple: boolean; values: Value[] }
> = {
  messaging_style: {
    label: "Messaging style",
    question: "How is the message delivered?",
    multiple: true,
    values: [
      v(
        "playful",
        "Playful",
        "Explicit playful or fun wording.",
        /\b(?:playful|let.s play|fun starts|game on)\b/i
      ),
      v(
        "provocative",
        "Provocative",
        "Explicitly challenges assumptions.",
        /\b(?:think again|forget everything|break the rules|dare to)\b/i
      ),
      v(
        "competitive",
        "Competitive",
        "Winning or outperforming.",
        /\b(?:win|winning|dominate|outperform|beat the competition|competitive edge)\b/i
      ),
      v(
        "inspirational",
        "Inspirational",
        "Explicit encouragement.",
        /\b(?:believe in yourself|you.ve got this|never give up|make it happen|reach your dreams)\b/i
      ),
      v(
        "humorous",
        "Humorous cues",
        "Explicit laughter or joking cues; not a judgment of whether copy is funny.",
        /\b(?:lol|haha|just kidding|pun intended|no joke)\b/i
      ),
      v(
        "educational",
        "Educational",
        "Teaches or explains.",
        /\b(?:learn how|step.by.step|guide to|how to|tutorial|explained|tips for)\b/i
      ),
      v(
        "direct",
        "Direct",
        "Explicit action instruction.",
        /\b(?:shop now|buy now|sign up|order now|book now|get started|subscribe now|start your|discover our)\b/i
      ),
      v(
        "reassuring",
        "Reassuring",
        "Addresses risk or reassures.",
        /\b(?:warranty|guarantee|peace of mind|risk.free|we.ve got you covered|money.back)\b/i
      ),
      v(
        "conversational",
        "Conversational",
        "Direct dialogue with the reader.",
        /\b(?:let.s|you know|sound familiar|here.s the thing|we get it|guess what)\b/i
      ),
      v("question", "Question led", "Uses a question.", /[^.!?\n]{3,120}\?/),
      v(
        "storytelling",
        "Storytelling",
        "Narrative or personal journey.",
        /\b(?:our story|my journey|it all started|once upon|when I first|years ago|I used to)\b/i
      ),
      v(
        "testimonial",
        "Testimonial",
        "Explicit customer testimony or review.",
        /\b(?:customer says|customers say|verified buyer|customer review|testimonial|I love|I recommend)\b/i
      ),
      v(
        "authoritative",
        "Authoritative",
        "Credentials or expert authority.",
        /\b(?:expert.recommended|experts recommend|certified|clinically tested|award.winning|industry.leading)\b/i
      ),
      v(
        "comparative",
        "Comparative",
        "Compares alternatives.",
        /\b(?:compared (?:to|with)|versus|vs\.?|unlike other|better than|outperforms)\b/i
      ),
      v(
        "aspirational",
        "Aspirational",
        "Invites an ideal future or identity.",
        /\b(?:dream|dreams|aspire|unlock your potential|level up|next.level|become your)\b/i
      ),
      v(
        "luxurious",
        "Luxurious",
        "Uses explicit luxury positioning.",
        /\b(?:luxury|luxurious|prestige|opulent|indulge|exquisite)\b/i
      ),
      v(
        "challenging",
        "Challenging",
        "Challenges the reader or convention.",
        /\b(?:dare to|challenge yourself|stop settling|break the rules|think again)\b/i
      ),
    ],
  },
  messaging_angle: {
    label: "Messaging angle",
    question: "What reason does the ad give to choose this?",
    multiple: true,
    values: [
      v(
        "performance",
        "Performance & speed",
        "Speed, power or output.",
        /\b(?:performance|fps|faster|speed|powerful|high.performance|boost your|lag.free)\b/i
      ),
      v(
        "savings",
        "Saving money",
        "Reduced cost or improved affordability.",
        /\b(?:save\s+(?:money|\$?\d+(?:[,.]\d+)*)|affordable|budget.friendly|cost.less|lower cost|less expensive)\b/i
      ),
      v(
        "time_saving",
        "Saving time",
        "Reduced time or effort.",
        /\b(?:save (?:time|hours)|in minutes|in seconds|time.saving|skip the wait)\b/i
      ),
      v(
        "convenience",
        "Convenience",
        "Easier access or use.",
        /\b(?:convenient|hassle.free|easy to|effortless|one.click|at your fingertips|all.in.one)\b/i
      ),
      v(
        "quality",
        "Quality & craftsmanship",
        "Materials, build or craft.",
        /\b(?:quality|craftsmanship|handcrafted|handmade|premium materials|precision.built)\b/i
      ),
      v(
        "reliability",
        "Reliability & durability",
        "Dependability and longevity.",
        /\b(?:reliable|reliability|durable|durability|built to last|dependable|long.lasting)\b/i
      ),
      v(
        "customization",
        "Customization",
        "Personal configuration or fit.",
        /\b(?:customize|customise|custom.built|customization|personalized|personalised|tailored|made for you)\b/i
      ),
      v(
        "innovation",
        "Innovation",
        "New technology or invention.",
        /\b(?:innovative|innovation|cutting.edge|breakthrough|next.generation|revolutionary)\b/i
      ),
      v(
        "expertise",
        "Expertise",
        "Professional knowledge or credentials.",
        /\b(?:expert|expertise|specialist|professional.grade|certified)\b/i
      ),
      v(
        "social_proof",
        "Social proof",
        "Other users' adoption or endorsement.",
        /\b(?:trusted by|loved by|rated|reviews|bestseller|best.selling|customers love|verified buyer)\b/i
      ),
      v(
        "status",
        "Status & prestige",
        "Prestige or elite identity.",
        /\b(?:prestige|luxury|elite|exclusive club|stand out|status symbol)\b/i
      ),
      v(
        "belonging",
        "Community & belonging",
        "Shared identity or community.",
        /\b(?:community|join us|together|belong|join the|fellow gamers)\b/i
      ),
      v(
        "confidence",
        "Confidence",
        "Self-belief or feeling capable.",
        /\b(?:confidence|feel confident|look your best|believe in yourself)\b/i
      ),
      v(
        "comfort",
        "Comfort",
        "Physical ease or comfort.",
        /\b(?:comfort|comfortable|cozy|cosy|ergonomic|relax)\b/i
      ),
      v(
        "safety",
        "Safety & security",
        "Protection or safer use.",
        /\b(?:safe|safety|secure|security|protect|protection)\b/i
      ),
      v(
        "wellbeing",
        "Health & wellbeing",
        "Wellness or health outcomes.",
        /\b(?:wellbeing|wellness|healthier|healthy|sleep better|fitness)\b/i
      ),
      v(
        "sustainability",
        "Sustainability",
        "Environmental impact.",
        /\b(?:sustainable|sustainability|eco.friendly|recycled|zero.waste|carbon.neutral)\b/i
      ),
      v(
        "discovery",
        "Discovery & choice",
        "Finding or comparing options.",
        /\b(?:discover|explore|find your|browse|directory|compare options|wide selection)\b/i
      ),
      v(
        "education",
        "Learning & growth",
        "Skills or knowledge.",
        /\b(?:learn|learning|master|skills|course|education|knowledge)\b/i
      ),
      v(
        "problem_solution",
        "Problem & solution",
        "Names a pain point and relief.",
        /\b(?:tired of|struggling with|say goodbye to|solve|solution to|frustrated by)\b/i
      ),
      v(
        "results",
        "Results & transformation",
        "A stated outcome or change.",
        /\b(?:transform|results|achieve|grow your|increase your|reduce your)\b/i
      ),
      v(
        "support",
        "Support & service",
        "Aftercare or help.",
        /\b(?:support|customer service|we.re here to help|dedicated team|24\/7 help)\b/i
      ),
      v(
        "gift",
        "Gifting",
        "Gift or special occasion.",
        /\b(?:gift|gifting|present for|birthday|anniversary)\b/i
      ),
      v(
        "local",
        "Local connection",
        "Nearby or locally made.",
        /\b(?:local|near you|near me|in your neighborhood|made in)\b/i
      ),
    ],
  },
  emotional_tone: {
    label: "Emotional tone",
    question: "Which emotional cues appear in the copy?",
    multiple: true,
    values: [
      v(
        "excitement",
        "Excitement",
        "Explicit excitement or enthusiasm.",
        /\b(?:exciting|excited|thrilling|wow|amazing|incredible|epic)\b/i
      ),
      v(
        "aspiration",
        "Aspiration",
        "Ambition or an ideal future.",
        /\b(?:dream|aspire|ambition|unlock your potential|reach new heights|level up)\b/i
      ),
      v(
        "reassurance",
        "Reassurance",
        "Reduced worry or risk.",
        /\b(?:peace of mind|worry.free|risk.free|guarantee|rest assured|you can count on)\b/i
      ),
      v(
        "trust",
        "Trust",
        "Explicit trust or credibility.",
        /\b(?:trusted|trust|proven|honest|transparent|reliable|certified)\b/i
      ),
      v(
        "curiosity",
        "Curiosity",
        "Invites discovery or surprise.",
        /\b(?:discover|secret|wonder|curious|guess what|did you know|what if)\b/i
      ),
      v(
        "joy",
        "Joy",
        "Happiness or delight.",
        /\b(?:joy|happy|happiness|delight|smile|celebrate)\b/i
      ),
      v(
        "pride",
        "Pride",
        "Pride or achievement.",
        /\b(?:proud|pride|achievement|accomplish|earned it)\b/i
      ),
      v(
        "belonging",
        "Belonging",
        "Community or inclusion.",
        /\b(?:belong|community|together|one of us|join our family)\b/i
      ),
      v(
        "empowerment",
        "Empowerment",
        "Agency and capability.",
        /\b(?:take control|empower|you can|your way|be unstoppable)\b/i
      ),
      v(
        "relief",
        "Relief",
        "Release from frustration.",
        /\b(?:finally|relief|say goodbye to|no more|breathe easy)\b/i
      ),
      v(
        "frustration",
        "Frustration",
        "Acknowledges a pain or annoyance.",
        /\b(?:frustrated|frustrating|tired of|sick of|struggling|fed up)\b/i
      ),
      v(
        "fear_of_missing_out",
        "Fear of missing out",
        "Fear of losing an opportunity.",
        /\b(?:don.t miss|miss out|before it.s gone|last chance|selling fast)\b/i
      ),
      v(
        "fear",
        "Concern & fear",
        "Explicit concern, danger or fear.",
        /\b(?:worried|afraid|danger|at risk|fear of|threat)\b/i
      ),
      v(
        "nostalgia",
        "Nostalgia",
        "References memories or the past.",
        /\b(?:remember when|good old days|nostalgia|nostalgic|childhood|relive)\b/i
      ),
      v(
        "warmth",
        "Warmth & care",
        "Affection or care.",
        /\b(?:with love|care for|loved ones|we care|heartfelt|family first)\b/i
      ),
      v(
        "calm",
        "Calm",
        "Peace or relaxation.",
        /\b(?:calm|serene|peaceful|unwind|relax|tranquil)\b/i
      ),
      v(
        "competitive",
        "Competitive",
        "Winning or outperforming.",
        /\b(?:win|winning|dominate|outperform|beat the competition|competitive edge)\b/i
      ),
      v(
        "playful",
        "Playful",
        "Explicit fun or playfulness.",
        /\b(?:fun|playful|let.s play|playtime|cheeky)\b/i
      ),
    ],
  },
  benefit_feature: {
    label: "Benefits vs. features",
    question: "Does the copy describe what it does or what the customer gains?",
    multiple: false,
    values: [
      v(
        "benefit_led",
        "Benefit signals",
        "Outcome language with no detected feature signal."
      ),
      v(
        "feature_led",
        "Feature signals",
        "Specifications or capabilities with no detected benefit signal."
      ),
      v(
        "mixed",
        "Benefits + features",
        "Contains both outcome and feature signals."
      ),
      v(
        "neither",
        "No explicit signal",
        "Neither signal detected; not proof that the message has no benefit."
      ),
    ],
  },
  urgency: {
    label: "Urgency",
    question: "What encourages action sooner?",
    multiple: true,
    values: [
      v(
        "deadline",
        "Explicit deadline",
        "A time limit.",
        /\b(?:ends? (?:tonight|today|tomorrow|on|in)|until midnight|before midnight|by \d{1,2}[\/.-]\d{1,2}|expires? (?:on|in))\b/i
      ),
      v(
        "time_limited",
        "Limited time",
        "Unspecified time-limited availability.",
        /\b(?:limited.time|today only|this week only|flash sale|last chance)\b/i
      ),
      v(
        "limited_stock",
        "Limited stock",
        "Limited quantity.",
        /\b(?:limited stock|while supplies last|only \d+ left|selling fast|almost sold out)\b/i
      ),
      v(
        "seasonal",
        "Seasonal event",
        "Seasonal or calendar event.",
        /\b(?:black friday|cyber monday|holiday sale|back.to.school|christmas sale|summer sale)\b/i
      ),
      v(
        "early_access",
        "Early access",
        "Early-bird or launch window.",
        /\b(?:early.bird|early access|pre.order|presale|launch offer)\b/i
      ),
      v(
        "immediate_cta",
        "Act now language",
        "Now/today wording without a stated deadline.",
        /\b(?:shop now|buy now|order now|act now|join today|get started today|sign up now)\b/i
      ),
      v(
        "no_pressure",
        "No pressure",
        "Explicitly gives time to decide.",
        /\b(?:no rush|take your time|no pressure|when you.re ready)\b/i
      ),
      v(
        "no_explicit_urgency",
        "No explicit urgency",
        "No urgency signal detected."
      ),
    ],
  },
  offer: {
    label: "Offer",
    question: "What incentive is explicitly offered?",
    multiple: true,
    values: [
      v(
        "percentage_discount",
        "Percentage discount",
        "Percentage off.",
        /\b\d+(?:\.\d+)?\s*%\s*(?:off|discount)|\b(?:save|get)\s+(?:up to\s+)?\d+(?:\.\d+)?\s*%/i
      ),
      v(
        "amount_discount",
        "Amount discount",
        "Currency amount saved.",
        /(?:[$£€]\s*\d+(?:\.\d+)?\s*off|\bsave\s+(?:up to\s+)?[$£€]\s*\d+)/i
      ),
      v(
        "discount_unspecified",
        "Discount (amount unstated)",
        "Sale or discount without an explicit amount.",
        /\b(?:sale|discount|special price|price drop)\b/i
      ),
      v(
        "free_shipping",
        "Free shipping",
        "Shipping incentive.",
        /\b(?:free shipping|free delivery|shipping on us)\b/i
      ),
      v(
        "free_trial",
        "Free trial",
        "Free trial period.",
        /\b(?:free trial|try (?:it )?free|trial for free)\b/i
      ),
      v(
        "free_gift",
        "Free gift",
        "Gift with purchase.",
        /\b(?:free gift|complimentary gift|gift with purchase)\b/i
      ),
      v(
        "bundle",
        "Bundle",
        "Packaged offer.",
        /\b(?:bundle|package deal|buy one get one|bogo|two for one|2 for 1)\b/i
      ),
      v(
        "financing",
        "Financing",
        "Installments or credit terms.",
        /\b(?:financing|monthly payments|pay over time|buy now pay later|\d+% APR|installments)\b/i
      ),
      v(
        "cashback",
        "Cashback",
        "Money returned after purchase.",
        /\b(?:cashback|cash back|rebate)\b/i
      ),
      v(
        "loyalty",
        "Loyalty reward",
        "Rewards or loyalty benefit.",
        /\b(?:loyalty|reward points|earn points|member discount)\b/i
      ),
      v(
        "subscription",
        "Subscription offer",
        "Recurring subscription incentive.",
        /\b(?:subscribe and save|first month free|subscription offer|annual plan discount)\b/i
      ),
      v(
        "guarantee",
        "Guarantee",
        "Risk reversal.",
        /\b(?:money.back|satisfaction guaranteed|risk.free|free returns)\b/i
      ),
      v(
        "free_consultation",
        "Free consultation",
        "Consultation or assessment incentive.",
        /\b(?:free consultation|free assessment|free demo|complimentary consultation)\b/i
      ),
      v(
        "no_explicit_offer",
        "No explicit offer",
        "No incentive signal detected."
      ),
    ],
  },
  specificity: {
    label: "Specificity",
    question: "What concrete details support the message?",
    multiple: true,
    values: [
      v(
        "quantified_result",
        "Quantified result",
        "Numerical outcome claim.",
        /\b(?:\d+(?:\.\d+)?\s*(?:%|x)\s*(?:faster|more|less|better)|(?:save|increase|reduce|boost)\s+(?:up to\s+)?\d+\s*(?:hours|minutes|%))/i
      ),
      v(
        "technical_spec",
        "Technical specification",
        "Concrete technical unit or material.",
        /\b\d+(?:\.\d+)?\s*(?:GB|TB|MHz|GHz|Hz|FPS|mm|cm|inch|inches|watts|cores|karat|k gold)\b/i
      ),
      v(
        "price",
        "Stated price",
        "A monetary amount; not necessarily a discount.",
        /[$£€]\s*\d+(?:[,.]\d+)*|\b\d+(?:\.\d+)?\s*(?:USD|GBP|EUR)\b/i
      ),
      v(
        "timeframe",
        "Stated timeframe",
        "A specific duration or date.",
        /\b\d+\s*(?:seconds|minutes|hours|days|weeks|months|years)|\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/i
      ),
      v(
        "social_proof_count",
        "Quantified social proof",
        "A count of users or reviews, or a rating.",
        /\b\d[\d,.+]*\s*(?:customers|users|reviews|members|businesses|stars)|\b\d(?:\.\d)?\s*(?:\/\s*5|out of 5)/i
      ),
      v(
        "named_technology",
        "Named technology",
        "Identifiable technology or product family.",
        /\b(?:RTX\s*\d+|Ryzen\s*\d*|Intel\s*(?:Core|i\d)|GeForce|DDR\d|OLED|AMOLED)\b/i
      ),
      v(
        "terms",
        "Specific terms",
        "Explicit conditions or eligibility.",
        /\b(?:new customers only|minimum purchase|terms apply|with code\s+\w+|use code\s+\w+|orders over\s*[$£€]?\d+)/i
      ),
      v(
        "general",
        "General wording",
        "No supported concrete-detail signal detected."
      ),
    ],
  },
  copy_length: {
    label: "Copy length",
    question: "How many words and characters does the copy contain?",
    multiple: false,
    values: [
      v("nonverbal", "No words", "Symbols or emoji only."),
      v("micro", "1–5 words", "Micro copy."),
      v("short", "6–15 words", "Short copy."),
      v("medium", "16–30 words", "Medium copy."),
      v("long", "31–60 words", "Long copy."),
      v("extended", "61–120 words", "Extended copy."),
      v("very_long", "121+ words", "Very long copy."),
    ],
  },
};

const labelSchema = z.object({
  value: z.string(),
  label: z.string(),
  evidence: z.array(z.string()),
});
export const copyTextTagsSchema = z.object({
  text: z.string(),
  words: z.number().int(),
  characters: z.number().int(),
  dimensions: z.array(
    z.object({
      dimension: z.enum(copyDimensions),
      labels: z.array(labelSchema),
      unknownReason: z.string().optional(),
    })
  ),
});
export const copyTagsSchema = z.object({
  version: z.number().int(),
  method: z.literal("text_signals"),
  fields: z.object({
    headline: z.array(copyTextTagsSchema),
    subheadline: z.array(copyTextTagsSchema),
    primary_text: z.array(copyTextTagsSchema),
    description: z.array(copyTextTagsSchema),
  }),
});
export type CopyTags = z.infer<typeof copyTagsSchema>;
export type CopyTextTags = z.infer<typeof copyTextTagsSchema>;
export type CopyTextInput = Partial<Record<keyof CopyTags["fields"], string[]>>;
const featurePattern =
  /\b(?:\d+(?:\.\d+)?\s*(?:GB|TB|MHz|GHz|Hz|FPS|mm|cm|inch|watts|cores)|equipped with|features?\s+(?:a|an|the|\d)|made (?:of|from)|includes?\s+|processor|graphics card|memory|storage|gold.filled|waterproof|wireless)\b/i;
const benefitPattern =
  /\b(?:save (?:time|money|hours)|feel\s+\w+|enjoy|achieve|stay\s+\w+|helps? you|so you can|allow(?:s)? you to|lets? you|peace of mind|without (?:the )?(?:hassle|stress|lag)|faster|more productive|boost your|transform your|look your best)\b/i;

/** Conservative, reproducible signals, not a semantic model or confidence probability. */
export function classifyCopyText(text: string): CopyTextTags {
  const words =
    text.match(new RegExp("[\\p{L}\\p{N}]+(?:['’.-][\\p{L}\\p{N}]+)*", "gu"))
      ?.length ?? 0;
  const characters = Array.from(text).length;
  const match = (p: RegExp) => {
    const search = new RegExp(p.source, p.flags + "g");
    let result: RegExpExecArray | null;
    while ((result = search.exec(text))) {
      // Do not treat simple negated claims as positive features/offers.
      const prefix = text.slice(Math.max(0, result.index - 18), result.index);
      if (!/\b(?:no|not|never|without)\s+(?:a\s+)?$/i.test(prefix))
        return result[0];
    }
    return undefined;
  };
  return {
    text,
    words,
    characters,
    dimensions: copyDimensions.map(dimension => {
      const spec = copyTaxonomy[dimension];
      const labels = spec.values.flatMap(value => {
        const evidence = value.pattern && match(value.pattern);
        return evidence
          ? [{ value: value.id, label: value.label, evidence: [evidence] }]
          : [];
      });
      const assign = (id: string, evidence: string[]) => {
        const value = spec.values.find(v => v.id === id)!;
        labels.push({ value: id, label: value.label, evidence });
      };
      if (!text.trim())
        return { dimension, labels: [], unknownReason: "No text supplied." };
      if (dimension === "benefit_feature") {
        const feature = match(featurePattern),
          benefit = match(benefitPattern);
        assign(
          feature && benefit
            ? "mixed"
            : feature
              ? "feature_led"
              : benefit
                ? "benefit_led"
                : "neither",
          [feature, benefit].filter((x): x is string => !!x)
        );
      }
      if (dimension === "copy_length")
        assign(
          words === 0
            ? "nonverbal"
            : words <= 5
              ? "micro"
              : words <= 15
                ? "short"
                : words <= 30
                  ? "medium"
                  : words <= 60
                    ? "long"
                    : words <= 120
                      ? "extended"
                      : "very_long",
          [`${words} words · ${characters} characters`]
        );
      if (
        dimension === "offer" &&
        labels.some(l =>
          ["percentage_discount", "amount_discount"].includes(l.value)
        )
      ) {
        const index = labels.findIndex(l => l.value === "discount_unspecified");
        if (index !== -1) labels.splice(index, 1);
      }
      if (!labels.length && dimension === "urgency")
        assign("no_explicit_urgency", []);
      if (!labels.length && dimension === "offer")
        assign("no_explicit_offer", []);
      if (!labels.length && dimension === "specificity") assign("general", []);
      return {
        dimension,
        labels,
        ...(!labels.length
          ? {
              unknownReason:
                "No supported text signal. Needs review; not a neutral-tone claim.",
            }
          : {}),
      };
    }),
  };
}
export function classifyCopy(input: CopyTextInput): CopyTags {
  const fields = Object.fromEntries(
    (["headline", "subheadline", "primary_text", "description"] as const).map(
      field => [
        field,
        Array.from(
          new Set((input[field] ?? []).map(t => t.trim()).filter(Boolean))
        ).map(classifyCopyText),
      ]
    )
  ) as CopyTags["fields"];
  return { version: COPY_TAXONOMY_VERSION, method: "text_signals", fields };
}
export function publicationCopyTags(
  content: {
    headline?: string;
    message?: string;
    description?: string;
    textVariants?: {
      headlines?: string[];
      messages?: string[];
      descriptions?: string[];
    };
  },
  subheadline?: string | string[]
) {
  return classifyCopy({
    headline: [
      content.headline ?? "",
      ...(content.textVariants?.headlines ?? []),
    ],
    subheadline: Array.isArray(subheadline)
      ? subheadline
      : subheadline
        ? [subheadline]
        : [],
    primary_text: [
      content.message ?? "",
      ...(content.textVariants?.messages ?? []),
    ],
    description: [
      content.description ?? "",
      ...(content.textVariants?.descriptions ?? []),
    ],
  });
}
