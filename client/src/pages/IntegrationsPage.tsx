import { ChannelConnectionCard, MetaConnectionSelection } from '@/components/ChannelConnections';
import { useState } from "react";
import { Link } from "wouter";
import { Search, ArrowUpRight, Plug } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { CatalogSources } from "@/components/CatalogSources";
import { PartnerLogo } from "@/components/PartnerLogo";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const groups = [
  { id: "social", name: "Social Media", description: "Connect social accounts for organic posts and reporting. Facebook first; each channel has its own connection." },
  {
    id: "catalog",
    name: "Catalog",
    description:
      "Bring products, variants, prices, and images into your shared catalog.",
  },
  {
    id: "advertising",
    name: "Advertising",
    description:
      "Connect ad accounts to use approved creatives, launch campaigns, and measure results.",
  },
  {
    id: "email",
    name: "Email",
    description:
      "Send approved content to your email platform as editable drafts. Choose audiences and send from the provider.",
  },
  {
    id: "analytics",
    name: "Analytics",
    description:
      "Understand website traffic and the results of your marketing.",
  },
];
const partners = [
  { name: "Facebook Pages", slug: "facebook", group: "social", description: "Organic Page posts and insights", capabilities: [] },
  { name: "Instagram", slug: "instagram", group: "social", description: "Instagram organic content. Coming after Facebook.", capabilities: ["Connect an Instagram professional account", "Schedule supported organic formats", "Review performance"] },
  { name: "TikTok", slug: "tiktoksocial", group: "social", description: "TikTok organic content. Coming after Facebook.", capabilities: ["Connect a TikTok account", "Prepare supported video posts", "Review performance"] },
  {
    name: "Meta Ads",
    slug: "meta",
    group: "advertising",
    description: "Facebook and Instagram advertising.",
    capabilities: [
      "Select business and ad accounts",
      "Use approved creatives in campaigns",
      "Sync spend, conversions, and results",
    ],
  },
  {
    name: "Google Ads",
    slug: "googleads",
    group: "advertising",
    description: "Search, Display, YouTube, and Performance Max.",
    capabilities: [
      "Select a Google Ads account",
      "Map creative assets to supported campaign formats",
      "Review campaign performance",
    ],
  },
  {
    name: "Microsoft Advertising",
    slug: "microsoftbing",
    group: "advertising",
    description: "Bing search and the Microsoft Advertising Network.",
    capabilities: [
      "Select an advertising account",
      "Prepare supported search campaign assets",
      "Sync campaign results",
    ],
  },
  {
    name: "TikTok Ads",
    slug: "tiktok",
    group: "advertising",
    description: "Reach audiences with TikTok advertising.",
    capabilities: [
      "Select an advertiser account",
      "Use approved assets in supported formats",
      "Review ad performance",
    ],
  },
  {
    name: "LinkedIn Ads",
    slug: "linkedin",
    group: "advertising",
    description: "Professional audiences and B2B lead generation.",
    capabilities: [
      "Select a Campaign Manager account",
      "Prepare approved campaign content",
      "Review leads and campaign results",
    ],
  },
  {
    name: "Pinterest Ads",
    slug: "pinterest",
    group: "advertising",
    description: "Product discovery and visual shopping campaigns.",
    capabilities: [
      "Select an advertising account",
      "Prepare approved Pins and creative assets",
      "Review campaign results",
    ],
  },
  {
    name: "Klaviyo",
    slug: "klaviyo",
    group: "email",
    description: "Email marketing for ecommerce brands.",
    capabilities: [
      "Select a Klaviyo account",
      "Export approved emails as editable drafts",
      "Sync aggregate campaign performance",
    ],
  },
  {
    name: "Mailchimp",
    slug: "mailchimp",
    group: "email",
    description: "Email campaigns for growing businesses.",
    capabilities: [
      "Select a Mailchimp account",
      "Export approved emails as editable drafts",
      "Sync aggregate campaign performance",
    ],
  },
  {
    name: "HubSpot",
    slug: "hubspot",
    group: "email",
    description: "CRM-connected marketing for products and services.",
    capabilities: [
      "Select a HubSpot portal",
      "Prepare approved email content",
      "Sync supported campaign reporting",
    ],
  },
  {
    name: "Brevo",
    slug: "brevo",
    group: "email",
    description: "Email marketing and customer communication.",
    capabilities: [
      "Select a Brevo account",
      "Prepare approved email drafts",
      "Sync aggregate email performance",
    ],
  },
  {
    name: "ActiveCampaign",
    slug: "activecampaign",
    group: "email",
    description: "Email marketing and customer automation.",
    capabilities: [
      "Select an ActiveCampaign account",
      "Prepare approved campaign content",
      "Sync aggregate email performance",
    ],
  },
  {
    name: "Omnisend",
    slug: "omnisend",
    group: "email",
    description: "Email marketing built for ecommerce.",
    capabilities: [
      "Select an Omnisend account",
      "Prepare approved email content",
      "Sync aggregate email performance",
    ],
  },
  {
    name: "Google Analytics",
    slug: "googleanalytics",
    group: "analytics",
    description: "Website traffic, engagement, and conversion reporting.",
    capabilities: [
      "Select a GA4 property",
      "Read website and campaign performance",
      "Use results in marketing insights",
    ],
  },
];
type Partner = (typeof partners)[number];
export function Integrations() {
  const { organizationId } = useWorkspace();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Partner | null>(null);
  const matches = (p: Partner) =>
    `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase());
  const storeMatch =
    !search ||
    ["Shopify", "BigCommerce", "WooCommerce"].some(n =>
      n.toLowerCase().includes(search.toLowerCase())
    );
  const visible = groups.filter(
    g =>
      (category === "all" || category === g.id) &&
      (g.id === "catalog"
        ? storeMatch
        : partners.some(p => p.group === g.id && matches(p)))
  );
  return (
    <>
      <MetaConnectionSelection />
      <PageHeader
        eyebrow="Workspace connections"
        title="Integrations"
        description="Connect your tools once. Use them across your catalog, campaigns, content, and reporting."
      />
      <div className="mb-8 flex flex-col gap-5">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search integrations"
            placeholder="Search integrations…"
            className="pl-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div
          role="group"
          aria-label="Integration categories"
          className="flex flex-wrap gap-2"
        >
          {[{ id: "all", name: "All integrations" }, ...groups].map(g => (
            <Button
              key={g.id}
              variant={category === g.id ? "default" : "outline"}
              aria-pressed={category === g.id}
              onClick={() => setCategory(g.id)}
            >
              {g.name}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-12">
        {visible.map(group => (
          <section key={group.id} aria-labelledby={`group-${group.id}`}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id={`group-${group.id}`} className="text-2xl font-semibold">
                  {group.name}
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  {group.description}
                </p>
              </div>
              {group.id === "catalog" && (
                <Link
                  href="/app/catalog"
                  className="inline-flex items-center gap-1 text-sm text-primary"
                >
                  Open catalog <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            {group.id === "catalog" ? (
              <>
                {organizationId && (
                  <CatalogSources
                    organizationId={organizationId}
                    storesOnly
                    search={search}
                  />
                )}
                <p className="mt-4 text-sm text-muted-foreground">
                  Scanning a website or importing a spreadsheet? Find these
                  tools in{" "}
                  <Link href="/app/catalog" className="text-primary underline">
                    Catalog → Sources
                  </Link>
                  .
                </p>
              </>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {partners
                  .filter(p => p.group === group.id && matches(p))
                  .map(p => p.slug === 'facebook' || p.slug === 'meta' ? <ChannelConnectionCard key={p.slug} channel={p.slug === 'facebook' ? 'facebook' : 'meta_ads'} /> : (
                    <article key={p.slug} className="surface flex flex-col p-6">
                      <div className="flex items-center justify-between gap-3">
                        <PartnerLogo slug={p.slug} name={p.name} />
                        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                          Coming soon
                        </span>
                      </div>
                      <h3 className="mt-5 font-semibold">{p.name}</h3>
                      <p className="mt-2 mb-6 flex-1 text-sm text-muted-foreground">
                        {p.description}
                      </p>
                      <Button
                        variant="outline"
                        className="w-fit"
                        onClick={() => setSelected(p)}
                      >
                        View planned setup{" "}
                        <ArrowUpRight className="ml-2 h-4 w-4" />
                      </Button>
                    </article>
                  ))}
              </div>
            )}
          </section>
        ))}
        {!visible.length && (
          <div className="surface p-10 text-center">
            <Plug className="mx-auto mb-4 text-muted-foreground" />
            <h2 className="font-semibold">No integrations found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a different name or category.
            </p>
            <Button
              variant="ghost"
              className="mt-3"
              onClick={() => {
                setSearch("");
                setCategory("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={open => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <PartnerLogo slug={selected.slug} name={selected.name} />
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>
                  Planned integration · Not available to connect yet
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {selected.description}
              </p>
              <h3 className="font-semibold">Planned workflow</h3>
              <ol className="space-y-3">
                {selected.capabilities.map((step, i) => (
                  <li key={step} className="flex gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="rounded-xl bg-muted p-4 text-sm">
                {selected.group === "email"
                  ? "You will choose the audience, schedule, and final send in your email provider. Frame will prepare approved drafts."
                  : selected.group === "advertising"
                    ? "Connecting an account will not launch ads or change budgets. Those actions will require approval in Campaigns."
                    : "Planned access is read-only. Your analytics configuration will stay in Google Analytics."}
              </p>
              <p className="text-xs text-muted-foreground">
                No account is connected and no permissions are being requested.
                Final capabilities depend on the provider’s API and account
                plan.
              </p>
              <Button onClick={() => setSelected(null)}>Done</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
export default function IntegrationsPage() {
  return (
    <WorkspaceGate>
      <Integrations />
    </WorkspaceGate>
  );
}
