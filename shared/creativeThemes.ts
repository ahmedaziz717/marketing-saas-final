export type CreativeThemeIcon =
  | "sparkles"
  | "rocket"
  | "bolt"
  | "package"
  | "gem"
  | "target"
  | "film"
  | "globe"
  | "cpu"
  | "flame"
  | "cloud"
  | "orbit"
  | "shapes"
  | "crown"
  | "snowflake"
  | "calendar"
  | "heart"
  | "flag"
  | "tag"
  | "trophy"
  | "leaf"
  | "sun"
  | "school"
  | "ghost"
  | "gift";

export type CreativeTheme = {
  id: string;
  name: string;
  icon: CreativeThemeIcon;
  palette: readonly [string, string, string];
  direction: string;
  headline: string;
  subheadline: string;
  cta: string;
};

export type CreativeThemeGroup = {
  id: string;
  name: string;
  themes: readonly CreativeTheme[];
};

const theme = (
  id: string,
  name: string,
  icon: CreativeThemeIcon,
  palette: readonly [string, string, string],
  direction: string,
  headline = `${name} starts here`,
  subheadline = "Discover the details that make this moment stand out.",
  cta = "Explore"
): CreativeTheme => ({ id, name, icon, palette, direction, headline, subheadline, cta });

export const DEFAULT_CREATIVE_BASE_PROMPT =
  "Create a polished, campaign-ready advertisement for the selected products or services with clear hierarchy, refined composition, realistic lighting, precise product fidelity, and readable typography. Treat supplied catalog images and approved brand assets as authoritative. Keep supplied products recognizable. For services, use relevant environments or abstract storytelling without inventing staff, facilities, results, credentials, or physical products. Do not assume a gaming, computer, or technology business. Only use verified pricing, offers, availability, and claims. Preserve brand consistency, and use deliberate negative space appropriate for the selected channel and final dimensions.";

export const CREATIVE_THEME_GROUPS: readonly CreativeThemeGroup[] = [
  {
    id: "always-on",
    name: "Always On",
    themes: [
      theme("spotlight", "Product Spotlight", "target", ["#F7F3EB", "#6D28D9", "#18151F"], "Refined studio lighting, a clean background, precise product detail, and the selected product as the unmistakable focal point.", "Your next favorite starts here", "Discover the details that make a difference."),
      theme("launch", "Product Launch", "rocket", ["#0B0B12", "#7C3AED", "#FFFFFF"], "A bold reveal with dramatic spotlighting, crisp product detail, deliberate negative space, and confident editorial energy.", "Meet what's next", "Take a closer look at the newest addition."),
      theme("flash-sale", "Flash Sale", "bolt", ["#210707", "#EF4444", "#FDE68A"], "High-energy promotional composition with urgent contrast, dynamic movement, and clearly reserved space for approved offer copy."),
      theme("bundle-value", "Bundle Value", "package", ["#0F172A", "#38BDF8", "#FBBF24"], "Organized multi-product composition that communicates a coordinated bundle, clear value hierarchy, and balanced product scale."),
      theme("limited-drop", "Limited Edition Drop", "gem", ["#09090B", "#D4AF37", "#FAFAFA"], "Exclusive premium presentation with restrained metallic accents, gallery-like lighting, and a scarce collector-release mood."),
      theme("feature-focus", "Feature Focus", "target", ["#111827", "#8B5CF6", "#F9FAFB"], "A precise product-led layout with clean callout zones for selected specifications and no unsupported feature claims."),
      theme("weekend", "Weekend", "sun", ["#172554", "#FB923C", "#FFF7ED"], "An inviting lifestyle atmosphere with confident color accents, natural ease, and a clear product focus.", "Make room for your weekend", "Discover something for your next chapter.", "Shop now"),
      theme("holiday", "Holiday", "gift", ["#052E16", "#DC2626", "#FDE68A"], "Warm festive lighting and understated seasonal accents while keeping the selected product clearly recognizable.", "Make this season yours", "Find something special for the season.", "Shop now"),
    ],
  },
  {
    id: "evergreen",
    name: "General / Evergreen",
    themes: [
      theme("dark-cinematic", "Dark Cinematic", "film", ["#050505", "#262626", "#D4AF37"], "Film-grade chiaroscuro lighting, deep shadows, controlled highlights, and a premium cinematic product reveal."),
      theme("neon-cyber", "Vibrant Neon", "globe", ["#020617", "#22D3EE", "#D946EF"], "A modern color-led composition with cyan and magenta accents, flowing light, and balanced negative space. No gaming or computer imagery unless supplied by the brand."),
      theme("studio-clean", "Studio Clean", "sparkles", ["#F8FAFC", "#CBD5E1", "#0F172A"], "Bright professional studio photography with a soft gradient, subtle shadow, and uncluttered product-first composition."),
      theme("premium-dark", "Premium Dark", "crown", ["#09090B", "#D4AF37", "#FFFFFF"], "Luxury dark environment with refined metallic accents, restrained typography zones, and meticulous product lighting."),
      theme("tech-blue", "Modern Blue", "cpu", ["#06142E", "#2563EB", "#67E8F9"], "A contemporary deep-blue environment with architectural shapes, clear hierarchy, and refined lighting."),
      theme("fire-energy", "Fire Energy", "flame", ["#180202", "#F97316", "#FDE047"], "High-energy ember glow, warm orange light, controlled heat distortion, and bold product contrast without obscuring details."),
      theme("smoke-fog", "Smoke & Fog", "cloud", ["#0A0A0A", "#52525B", "#E4E4E7"], "Moody atmospheric haze with soft volumetric rays, controlled depth, and clear product edges."),
      theme("space-galaxy", "Space / Galaxy", "orbit", ["#020617", "#7C3AED", "#22D3EE"], "Deep-space atmosphere with restrained nebula color, star-field depth, and a clean futuristic product stage."),
      theme("abstract-geometry", "Abstract Geometry", "shapes", ["#111827", "#7C3AED", "#F43F5E"], "Graphic angular forms, layered depth, diagonal rhythm, and deliberate negative space around the exact product."),
      theme("purple-gradient", "Purple Gradient", "sparkles", ["#2E1065", "#7C3AED", "#F0ABFC"], "Rich violet-to-magenta gradient with soft light diffusion and an editorial premium finish."),
      theme("blue-gradient", "Blue Gradient", "sparkles", ["#082F49", "#2563EB", "#67E8F9"], "Deep navy-to-electric-blue gradient with soft highlights and clean contemporary editorial styling."),
      theme("gold-luxury", "Gold Luxury", "crown", ["#1C1917", "#D4AF37", "#FEF3C7"], "Warm metallic gold lighting, rich dark materials, and an elegant premium product presentation."),
      theme("ice-frost", "Ice & Frost", "snowflake", ["#082F49", "#7DD3FC", "#F8FAFC"], "Cool crystalline atmosphere with subtle frost texture, clean refraction, and sharp product visibility."),
      theme("matrix-code", "Fresh Green", "cpu", ["#001A0B", "#22C55E", "#BBF7D0"], "Layered green paper forms, botanical-inspired rhythm, and bright clean lighting suitable for retail, hospitality, or professional services."),
      theme("retro-wave", "Retro Wave", "sun", ["#2E1065", "#F472B6", "#22D3EE"], "Polished synthwave atmosphere with a geometric horizon, neon pink and cyan accents, and modern retro energy."),
      theme("carbon-fiber", "Carbon Fiber", "shapes", ["#09090B", "#3F3F46", "#D4AF37"], "Industrial carbon-fiber textures, subtle metallic edges, and precision-engineered lighting."),
      theme("lightning-storm", "Lightning Storm", "bolt", ["#020617", "#38BDF8", "#FFFFFF"], "Electric storm energy with controlled blue light, atmospheric clouds, and a dramatic but readable product silhouette."),
      theme("desert-heat", "Desert Heat", "sun", ["#3B1605", "#F97316", "#FDE68A"], "Warm desert color, golden-hour light, subtle heat shimmer, and sculptural product staging."),
      theme("dark-forest", "Dark Forest", "leaf", ["#052E16", "#15803D", "#D4AF37"], "Deep emerald environment with natural texture, dappled light, and a sophisticated shadowed mood."),
      theme("minimal-white", "Minimal White", "sparkles", ["#FFFFFF", "#E2E8F0", "#111827"], "High-key minimal composition with architectural whitespace, soft realistic shadows, and precise product fidelity."),
    ],
  },
  {
    id: "january",
    name: "January",
    themes: [
      theme("new-year", "New Year", "sparkles", ["#0F172A", "#FBBF24", "#E2E8F0"], "Midnight celebration with restrained gold light, elegant confetti, and optimistic forward momentum."),
      theme("winter-reset", "Winter Reset", "snowflake", ["#0C4A6E", "#7DD3FC", "#F8FAFC"], "Crisp winter clarity, clean blue-white light, and a calm fresh-start composition."),
      theme("ces-launch", "New Year Reveal", "cpu", ["#020617", "#0EA5E9", "#F8FAFC"], "An editorial new-year reveal with crisp blue accents, a simple stage, and confident introduction of the selected offering."),
      theme("new-year-upgrade", "New Year Upgrade", "rocket", ["#111827", "#8B5CF6", "#FFFFFF"], "Forward-looking upgrade story with ascending forms, clean energy, and confident product emphasis."),
      theme("productivity-kickoff", "Productivity Kickoff", "target", ["#172554", "#38BDF8", "#F8FAFC"], "Organized, focused composition that communicates a capable start to the year through clean structure and momentum."),
      theme("frost-premium", "Frosted Premium", "gem", ["#0F172A", "#BAE6FD", "#FFFFFF"], "Luxury winter treatment with frosted glass depth, silver-blue highlights, and refined product lighting."),
    ],
  },
  {
    id: "february",
    name: "February",
    themes: [
      theme("valentines", "Valentine's Day · Romantic Elegance", "heart", ["#4C0519", "#F43F5E", "#FBCFE8"], "Sophisticated romantic atmosphere with ruby, blush, and soft metallic accents; avoid cliché clutter.", "A thoughtful way to say love", "Make room for something meaningful.", "Explore"),
      theme("valentines-playful", "Valentine's Day · Playful Color", "heart", ["#FFF1F2", "#E11D48", "#FB923C"], "Bold paper-cut hearts, playful curved typography space, coral and pink color blocks, and a lighthearted inclusive mood.", "A little love goes a long way", "Bring a little joy to their day.", "Explore"),
      theme("valentines-self-care", "Valentine's Day · A Moment for You", "heart", ["#F5F0E8", "#A78B8A", "#3F3F46"], "Soft linen textures, warm daylight, muted rose accents, and a peaceful self-appreciation mood suitable for products or experiences.", "Make a little time for you", "Thoughtful moments, just for yourself.", "Explore"),
      theme("valentines-modern", "Valentine's Day · Modern Minimal", "heart", ["#FFF7ED", "#B91C1C", "#18181B"], "An ivory editorial layout with one sculptural red ribbon, precise spacing, and restrained romantic accents.", "Thoughtfully chosen. Simply loved.", "Let the little details speak.", "Explore"),
      theme("presidents-day", "Presidents Day", "flag", ["#1E3A8A", "#DC2626", "#FFFFFF"], "Confident red, white, and blue promotional composition with polished patriotic restraint."),
      theme("winter-clearance", "Winter Clearance", "tag", ["#082F49", "#38BDF8", "#FFFFFF"], "Crisp seasonal promotion with icy color, bold approved offer space, and clear product hierarchy."),
      theme("love-your-setup", "Everyday Joy", "heart", ["#2E1065", "#EC4899", "#FDE68A"], "Warm lifestyle atmosphere with soft pink accents and thoughtfully framed details that celebrate small everyday moments."),
      theme("championship-weekend", "Championship Weekend", "trophy", ["#111827", "#F59E0B", "#FFFFFF"], "Big-game energy with stadium-inspired light, premium dark contrast, and dynamic but uncluttered composition."),
      theme("creator-appreciation", "Customer Appreciation", "sparkles", ["#312E81", "#A78BFA", "#F8FAFC"], "Warm inclusive appreciation styling with elegant color and human-centered editorial balance; do not invent testimonials."),
    ],
  },
  {
    id: "march",
    name: "March",
    themes: [
      theme("march-madness", "March Momentum", "trophy", ["#172554", "#F97316", "#FFFFFF"], "Energetic spring composition with curved forms, orange accents, and optimistic movement without sports-event or team branding."),
      theme("spring-launch", "Spring Launch", "leaf", ["#052E16", "#22C55E", "#F0FDF4"], "Fresh launch atmosphere with modern botanical forms, clean green light, and new-season momentum."),
      theme("st-patricks", "St. Patrick's Day", "leaf", ["#052E16", "#16A34A", "#FBBF24"], "Deep emerald and subtle gold seasonal styling with refined celebratory accents."),
      theme("spring-sale", "Spring Sale", "tag", ["#4C1D95", "#F472B6", "#FDE68A"], "Bright seasonal promotion with blossom-inspired color and reserved space for approved savings copy."),
      theme("tax-refund-early", "Tax Refund Season", "tag", ["#052E16", "#22C55E", "#FBBF24"], "Smart-value promotional mood using green and gold accents without inventing financial or offer claims."),
      theme("women-in-tech", "International Women's Day", "sparkles", ["#3B0764", "#C084FC", "#67E8F9"], "An inclusive celebration of women with expressive violet color, thoughtful editorial spacing, and confident typography; do not invent endorsements or achievements."),
    ],
  },
  {
    id: "april",
    name: "April",
    themes: [
      theme("tax-refund", "Tax Refund Sale", "tag", ["#14532D", "#4ADE80", "#FDE047"], "Value-led seasonal sale treatment with disciplined green accents and strong approved-offer hierarchy."),
      theme("earth-day", "Earth Day", "globe", ["#052E16", "#22C55E", "#BBF7D0"], "Nature-forward composition with organic textures and responsible visual cues; make no unsupported sustainability claims."),
      theme("spring-gaming", "Spring Energy", "sparkles", ["#312E81", "#C4B5FD", "#67E8F9"], "Fresh pastel atmosphere with lavender and teal accents, natural light, and airy spacing around the featured offering."),
      theme("easter-weekend", "Easter Weekend", "gift", ["#4C1D95", "#F9A8D4", "#FDE68A"], "Refined spring celebration with soft pastel geometry and subtle festive accents."),
      theme("creator-workflow", "Everyday Ease", "target", ["#0F172A", "#06B6D4", "#F8FAFC"], "A simple everyday lifestyle composition with organized layers, human-scale details, and breathing room around the selected offering."),
      theme("clean-setup", "Spring Refresh", "sparkles", ["#F8FAFC", "#A7F3D0", "#0F172A"], "Bright refreshed environment with clean surfaces, airy spacing, and a welcoming seasonal composition."),
    ],
  },
  {
    id: "may",
    name: "May",
    themes: [
      theme("memorial-day", "Memorial Day · Quiet Remembrance", "flag", ["#1E3A8A", "#B91C1C", "#FFFFFF"], "A quiet commemorative layout with muted navy, cream, and restrained red details. Use generous whitespace; no celebratory fireworks, military endorsement, or invented charitable claims.", "A moment to remember", "Honoring those who gave their lives.", "Learn more"),
      theme("memorial-day-heritage", "Memorial Day · Heritage", "flag", ["#172554", "#9F1239", "#F5F0E8"], "Respectful heritage styling with subtle woven texture, muted patriotic colors, and timeless serif typography space. No celebration, sales hype, or implied military affiliation.", "Remembering their sacrifice", "With gratitude and remembrance.", "Explore"),
      theme("memorial-day-minimal", "Memorial Day · Minimal Tribute", "flag", ["#F8FAFC", "#334155", "#9F1239"], "A spacious white composition with one restrained navy line and a small muted red accent; dignified, quiet, and commemorative.", "Honor. Remember. Reflect.", "Keeping their memory close.", "Explore"),
      theme("memorial-day-weekend", "Memorial Day · Weekend Edit", "sun", ["#FEF3C7", "#1E3A8A", "#A16207"], "An understated early-summer editorial setting with warm natural light. Keep any supplied retail offer distinct from commemorative messaging; no invented discounts or urgency.", "Your long-weekend edit", "Thoughtful choices for the days ahead.", "Explore"),
      theme("mothers-day", "Mother's Day · Floral Appreciation", "heart", ["#4A044E", "#F472B6", "#FDE68A"], "Elegant appreciation theme with floral-inspired color, warm light, and sophisticated gift positioning."),
      theme("mothers-day-modern", "Mother's Day · Modern Gratitude", "heart", ["#FAF7F2", "#9D174D", "#27272A"], "Clean ivory editorial styling, sculptural pink forms, and generous space for a sincere message.", "A little thank-you for so much", "Thoughtfully chosen with her in mind.", "Explore"),
      theme("mothers-day-time", "Mother's Day · Time Together", "sun", ["#FFF7ED", "#D97706", "#78350F"], "Warm golden-hour light, soft organic textures, and inviting space suggesting shared experiences without inventing people or packages.", "Make time for a special moment", "Celebrate with something meaningful.", "Explore"),
      theme("mothers-day-soft", "Mother's Day · Soft Luxury", "gem", ["#F5F3FF", "#C4B5FD", "#6B5B43"], "Soft lavender, satin-like texture, and delicate champagne accents with refined restrained composition.", "For someone truly special", "A thoughtful touch for her day.", "Explore"),
      theme("graduation", "Graduation Season", "trophy", ["#111827", "#FBBF24", "#FFFFFF"], "Achievement-focused celebration with clean gold accents, upward movement, and polished milestone energy."),
      theme("summer-preview", "Summer Preview", "sun", ["#0C4A6E", "#FB923C", "#FDE68A"], "Warm early-summer atmosphere with bright horizon light and optimistic seasonal energy."),
      theme("small-business", "Small Business Week", "target", ["#172554", "#38BDF8", "#F8FAFC"], "Authentic business-ready presentation with clear utility, confident structure, and human-scale professionalism."),
      theme("gaming-anniversary", "Anniversary Celebration", "sparkles", ["#2E1065", "#8B5CF6", "#FBBF24"], "Milestone celebration with restrained confetti, warm metallic accents, and space for a verified anniversary year."),
    ],
  },
  {
    id: "june",
    name: "June",
    themes: [
      theme("fathers-day", "Father's Day · Refined Classic", "gift", ["#172554", "#2563EB", "#FBBF24"], "Bold, refined appreciation theme with navy and gold accents and confident gift-ready product focus."),
      theme("fathers-day-outdoors", "Father's Day · Open Air", "leaf", ["#ECFCCB", "#365314", "#A16207"], "Natural green textures, warm daylight, and relaxed outdoor editorial styling relevant to the selected offering.", "For his kind of day", "Find a thoughtful way to celebrate.", "Explore"),
      theme("fathers-day-modern", "Father's Day · Modern Simplicity", "shapes", ["#FAFAF9", "#475569", "#EA580C"], "Clean stone backdrop, geometric orange accents, and contemporary uncluttered composition.", "A small gesture. A big thank-you.", "Chosen with him in mind.", "Explore"),
      theme("fathers-day-moments", "Father's Day · Shared Moments", "heart", ["#FEF3C7", "#92400E", "#172554"], "Warm amber light and tactile everyday materials with inviting space for an experience-led message.", "Make a moment of it", "Something meaningful for his day.", "Explore"),
      theme("summer-kickoff", "Summer Kickoff", "sun", ["#0C4A6E", "#F97316", "#FDE047"], "High-energy summer opening with warm sun, ocean-inspired color, and vibrant movement."),
      theme("pride-month", "Pride Month", "heart", ["#111827", "#F43F5E", "#8B5CF6"], "Inclusive celebration using a refined spectrum of color, confident energy, and respectful visual balance."),
      theme("mid-year-upgrade", "Mid-Year Upgrade", "rocket", ["#111827", "#D4AF37", "#FFFFFF"], "Progress-oriented premium direction with upward movement, refined lighting, and product improvement cues."),
      theme("graduation-late", "Graduate Upgrade", "trophy", ["#0F172A", "#FBBF24", "#E2E8F0"], "Modern achievement story connecting a new chapter with a capable product upgrade."),
      theme("creator-season", "Season of Possibility", "sparkles", ["#312E81", "#A78BFA", "#22D3EE"], "Expressive seasonal styling with rich violet accents, layered paper textures, and optimistic editorial energy."),
    ],
  },
  {
    id: "july",
    name: "July",
    themes: [
      theme("independence-day", "Independence Day · Evening Sparkle", "flag", ["#1E3A8A", "#DC2626", "#FFFFFF"], "Celebratory red, white, and blue composition with refined fireworks-inspired light and bold product staging."),
      theme("independence-day-picnic", "Independence Day · Summer Gathering", "sun", ["#FFFBEB", "#DC2626", "#1D4ED8"], "Sunlit summer setting with subtle red-white-blue fabric accents and relaxed gathering energy.", "Bring on the summer moments", "Your holiday weekend starts here.", "Explore"),
      theme("independence-day-modern", "Independence Day · Modern Americana", "flag", ["#FAFAF9", "#1E3A8A", "#B91C1C"], "Clean color-blocked Americana with restrained stars, architectural whitespace, and graphic editorial rhythm.", "A fresh take on the Fourth", "Discover your summer favorites.", "Explore"),
      theme("independence-day-coastal", "Independence Day · Coastal Weekend", "sun", ["#EFF6FF", "#0369A1", "#E11D48"], "Airy coastal light, pale blue textures, and a small red accent; relaxed and refined with no crowded decorations.", "A little more summer", "Make room for the long weekend.", "Explore"),
      theme("summer-gaming", "Summer Living", "sun", ["#7C2D12", "#FB923C", "#67E8F9"], "Warm sunset color, relaxed lifestyle energy, and an inviting seasonal environment adapted to the selected product or service."),
      theme("mid-year-sale", "Mid-Year Sale", "tag", ["#450A0A", "#EF4444", "#FBBF24"], "High-impact promotional hierarchy with bold red and gold accents and reserved approved-offer space."),
      theme("prime-event", "Summer Shopping Event", "package", ["#0C4A6E", "#F59E0B", "#FFFFFF"], "A broad summer retail-event composition with warm orange accents, clean visual hierarchy, and space for verified promotional details."),
      theme("hot-deal", "Summer Hot Deal", "flame", ["#3B0A02", "#F97316", "#FDE047"], "Heat-driven promotional styling with energetic orange light and clear approved-deal hierarchy."),
      theme("outdoor-creator", "Outdoor Living", "sun", ["#134E4A", "#2DD4BF", "#FDE68A"], "Natural outdoor light, fresh foliage, and relaxed lifestyle composition appropriate to the selected offering."),
    ],
  },
  {
    id: "august",
    name: "August",
    themes: [
      theme("back-to-school", "Back to School", "school", ["#172554", "#E11D48", "#FFFFFF"], "Fresh academic-season energy with structured layouts, bold color, and practical product focus."),
      theme("late-summer", "Late Summer", "sun", ["#431407", "#FB923C", "#7C3AED"], "Golden sunset fading to violet dusk with warm end-of-season nostalgia."),
      theme("college-gaming", "Campus Life", "school", ["#0F172A", "#2563EB", "#FBBF24"], "A welcoming campus-season atmosphere with organized space, energetic student styling, and adaptable product or service storytelling."),
      theme("back-to-dorm", "Back to Dorm", "package", ["#312E81", "#8B5CF6", "#FFFFFF"], "Compact-room transformation with smart organization, cozy lighting, and clear product utility."),
      theme("creator-workstation", "Professional Focus", "cpu", ["#082F49", "#06B6D4", "#F8FAFC"], "A polished professional setting with organized forms, natural materials, and calm purposeful lighting; only show tools relevant to the chosen offering."),
      theme("end-of-summer", "End of Summer", "sun", ["#7C2D12", "#FDBA74", "#312E81"], "Warm final-summer atmosphere with amber light, calm evening depth, and a polished seasonal transition."),
    ],
  },
  {
    id: "september",
    name: "September",
    themes: [
      theme("labor-day", "Labor Day · Classic Weekend", "flag", ["#1E3A8A", "#DC2626", "#FFFFFF"], "Confident end-of-summer event treatment with restrained patriotic color and clean product prominence."),
      theme("labor-day-last-light", "Labor Day · Last Light of Summer", "sun", ["#FFF7ED", "#FB923C", "#6D28D9"], "Golden-hour amber fading into violet, soft natural textures, and a relaxed seasonal transition.", "Savor the last days of summer", "Find something for your next chapter.", "Explore"),
      theme("labor-day-fresh-start", "Labor Day · Fresh Routine", "target", ["#F0FDFA", "#0F766E", "#1E293B"], "Organized teal and cream composition with clean shapes and a purposeful fresh-start atmosphere.", "A fresh rhythm starts here", "Thoughtful choices for everyday life.", "Explore"),
      theme("labor-day-weekend-edit", "Labor Day · Weekend Essentials", "package", ["#FAF7F2", "#1E3A8A", "#C2410C"], "Warm neutral editorial arrangement with navy and terracotta accents and clear space for verified offer copy.", "Your long-weekend lineup", "Discover the details worth a closer look.", "Explore"),
      theme("fall-launch", "Fall Launch", "leaf", ["#431407", "#EA580C", "#FBBF24"], "Warm autumn launch with amber leaves, deep orange light, and refined new-season momentum."),
      theme("back-to-gaming", "Back to Routine", "target", ["#111827", "#EA580C", "#D4AF37"], "A calm return-to-routine composition with warm autumn accents, balanced space, and purposeful everyday energy."),
      theme("new-tech-season", "New Season Discovery", "cpu", ["#020617", "#0EA5E9", "#FFFFFF"], "A crisp new-season reveal with fresh blue accents, modern editorial structure, and welcoming discovery cues."),
      theme("productivity-refresh", "Productivity Refresh", "target", ["#0F172A", "#14B8A6", "#F8FAFC"], "Organized fall reset with calm teal accents, clear hierarchy, and efficient workspace energy."),
      theme("football-season", "Football Season", "trophy", ["#052E16", "#FBBF24", "#FFFFFF"], "Stadium-inspired light, field geometry, and game-day energy without using protected team marks."),
    ],
  },
  {
    id: "october",
    name: "October",
    themes: [
      theme("halloween", "Halloween", "ghost", ["#111111", "#F97316", "#7C3AED"], "Dark seasonal atmosphere with orange glow, purple fog, and tasteful spooky accents around a readable product."),
      theme("october-sale", "October Sale", "tag", ["#450A0A", "#B91C1C", "#F59E0B"], "Rich crimson and burnt-orange sale styling with strong approved-offer hierarchy."),
      theme("fall-gaming", "Autumn Comfort", "leaf", ["#431407", "#92400E", "#F59E0B"], "Cozy autumn textures with warm wood, amber accents, and sophisticated seasonal depth."),
      theme("spooky-builds", "Halloween · Playful Magic", "ghost", ["#09090B", "#7C3AED", "#F97316"], "Playful seasonal styling with illustrated stars, purple shadows, soft orange light, and friendly rather than frightening details."),
      theme("creator-after-dark", "After Hours", "film", ["#09090B", "#A855F7", "#22D3EE"], "An elegant evening atmosphere with cinematic violet accents, soft ambient light, and sophisticated editorial spacing."),
      theme("harvest-upgrade", "Harvest Upgrade", "leaf", ["#3F1D0B", "#D97706", "#FDE68A"], "Warm harvest textures, golden light, and a premium seasonal upgrade story."),
    ],
  },
  {
    id: "november",
    name: "November",
    themes: [
      theme("black-friday", "Black Friday · Bold Contrast", "tag", ["#000000", "#FBBF24", "#F97316"], "Maximum-impact retail event with black space, gold highlights, orange urgency, and strict approved-offer use."),
      theme("black-friday-minimal", "Black Friday · Minimal Edit", "tag", ["#FAFAFA", "#18181B", "#DC2626"], "White-space-led retail layout with sharp black typography zones and one red accent. Display only approved offer details.", "Your Black Friday edit", "Explore what catches your eye.", "Explore"),
      theme("black-friday-premium", "Black Friday · Premium Gold", "gem", ["#18181B", "#D4AF37", "#FEF3C7"], "Matte black and warm gold editorial styling, gallery lighting, and restrained space for verified promotions.", "A considered Black Friday", "Discover something worth choosing.", "Explore"),
      theme("black-friday-color", "Black Friday · Color Pop", "bolt", ["#2E1065", "#D9F99D", "#F472B6"], "Bold violet and lime color blocks with playful pink accents and clear hierarchy; never invent discounts or deadlines.", "Make room for a new favorite", "Take a fresh look this Black Friday.", "Explore"),
      theme("cyber-monday", "Cyber Monday", "cpu", ["#0F172A", "#22D3EE", "#8B5CF6"], "Modern online-shopping event with cyan and violet accents, bold readable hierarchy, and space only for approved offers; no assumed technology products."),
      theme("veterans-day", "Veterans Day", "flag", ["#1F2937", "#4D7C0F", "#B91C1C"], "Respectful military-inspired palette with disciplined structure and restrained patriotic accents."),
      theme("thanksgiving", "Thanksgiving", "gift", ["#431407", "#EA580C", "#FBBF24"], "Warm harvest atmosphere with amber light, rich texture, and a refined gratitude-centered seasonal mood."),
      theme("holiday-preview", "Holiday Preview", "gift", ["#052E16", "#DC2626", "#FBBF24"], "Early holiday anticipation with refined red, green, and gold accents and clean gift-ready presentation."),
      theme("gift-early", "Gift Early", "gift", ["#172554", "#DC2626", "#FDE68A"], "Organized early-gifting direction with premium wrapping cues, calm urgency, and clear product focus."),
    ],
  },
  {
    id: "december",
    name: "December",
    themes: [
      theme("holiday-sale", "Holiday Sale", "gift", ["#052E16", "#DC2626", "#FBBF24"], "Festive retail atmosphere with evergreen, red, and gold accents plus clear approved-sale hierarchy."),
      theme("christmas-gaming", "Christmas · Classic Warmth", "gift", ["#450A0A", "#DC2626", "#D4AF37"], "Warm evergreen and deep red styling, soft golden light, and tasteful Christmas details suitable for gifts or seasonal experiences.", "Make the season feel special", "Thoughtful details. Warm holiday moments.", "Explore"),
      theme("christmas-winter-white", "Christmas · Winter White", "snowflake", ["#FFFFFF", "#CBD5E1", "#A78BFA"], "Airy white-on-white winter composition with soft silver accents and subtle paper snowflakes.", "A little winter wonder", "Thoughtful choices for the season.", "Explore"),
      theme("christmas-playful", "Christmas · Merry and Bright", "gift", ["#FDF2F8", "#DC2626", "#16A34A"], "Playful paper ornaments, bright festive color blocks, and a cheerful uncluttered composition.", "A brighter kind of Christmas", "Bring a little joy to the season.", "Explore"),
      theme("christmas-luxe", "Christmas · Midnight Gold", "gem", ["#0F172A", "#D4AF37", "#FFFBEB"], "Midnight navy, delicate gold ribbon, and warm spot lighting with elegant seasonal restraint.", "Something special for the season", "Celebrate the details that matter.", "Explore"),
      theme("new-years-eve", "New Year's Eve", "sparkles", ["#0F172A", "#FBBF24", "#E2E8F0"], "Midnight countdown atmosphere with elegant gold and silver light, celebratory depth, and premium polish."),
      theme("winter-gaming", "Winter Calm", "snowflake", ["#082F49", "#7DD3FC", "#FFFFFF"], "Deep-blue winter atmosphere with soft crystalline light, cozy contrast, and uncluttered editorial styling."),
      theme("gift-guide", "Gift Guide", "gift", ["#052E16", "#B91C1C", "#D4AF37"], "Curated gift-guide layout with organized product hierarchy, elegant ribbon cues, and clean editorial spacing."),
      theme("year-end-upgrade", "Year-End Upgrade", "rocket", ["#111827", "#8B5CF6", "#FBBF24"], "Confident year-end transformation with premium violet and gold light and forward-looking product energy."),
    ],
  },
] as const;

export const CREATIVE_THEME_LIST = CREATIVE_THEME_GROUPS.flatMap(group => group.themes);
export const CREATIVE_THEMES: Record<string, CreativeTheme> = Object.fromEntries(
  CREATIVE_THEME_LIST.map(item => [item.id, item])
);
export type CreativeThemeId = (typeof CREATIVE_THEME_LIST)[number]["id"];

export function getCreativeTheme(id: string): CreativeTheme {
  return CREATIVE_THEMES[id] ?? CREATIVE_THEMES.spotlight;
}

export function getCreativeThemeGroup(id: string) {
  return CREATIVE_THEME_GROUPS.find(group => group.themes.some(item => item.id === id));
}
