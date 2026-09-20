import { useState } from "react";
import { Link } from "wouter";
import { Facebook, Instagram, CalendarDays } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  ChannelConnectionCard,
  channelInput,
} from "@/components/ChannelConnections";
import { PublishingCalendar } from "@/components/PublishingCalendar";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { dateInZone, moveDate } from "@shared/channels";
function FacebookPosts({ connectionId }: { connectionId: string }) {
  const { organizationId } = useWorkspace();
  const today = dateInZone(Date.now(), "UTC").slice(0, 10);
  const query = trpc.channels.posts.useQuery(
    {
      organizationId: organizationId!,
      connectionId,
      range: { since: moveDate(today, -29), until: today },
    },
    { retry: false, staleTime: 60000 }
  );
  return (
    <section className="mt-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-xl font-semibold">Recent Facebook posts</h2>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          Refresh posts
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Posts published in the last 30 days (UTC), including posts created
        outside Frame. Reactions, comments and shares are current lifetime
        totals for each post.
      </p>
      {query.isLoading ? (
        <p role="status">Loading Facebook posts...</p>
      ) : query.error ? (
        <div role="alert" className="surface p-5">
          <p>{query.error.message}</p>
          <Link href="/app/settings/integrations" className="text-primary">
            Check connection permissions
          </Link>
        </div>
      ) : !query.data?.data.length ? (
        <div className="surface p-8">
          No posts were returned for this Page in the selected period.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {query.data.data.map(post => (
            <article key={String(post.id)} className="surface min-w-0 p-5">
              <p className="text-xs text-muted-foreground">
                {post.createdAt
                  ? new Date(String(post.createdAt)).toLocaleString()
                  : "Publication time not supplied"}
              </p>
              <p className="my-4 whitespace-pre-wrap break-words text-sm">
                {String(post.message || "Media post without text")}
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Reactions: {post.reactions ?? "Unavailable"}</span>
                <span>Comments: {post.comments ?? "Unavailable"}</span>
                <span>Shares: {post.shares ?? "Unavailable"}</span>
              </div>
              {typeof post.url === "string" &&
                post.url.startsWith("https://www.facebook.com/") && (
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-block text-sm text-primary"
                  >
                    Open in Facebook
                  </a>
                )}
            </article>
          ))}
        </div>
      )}
      {query.data?.truncated && (
        <p className="text-xs">
          Provider pagination limit reached. This is a partial post list.
        </p>
      )}
    </section>
  );
}
function SocialMedia() {
  const { organizationId } = useWorkspace();
  const [tab, setTab] = useState<"overview" | "calendar">("overview");
  const [selected, setSelected] = useState("");
  const query = trpc.channels.connections.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const pages =
    query.data?.items.filter(
      c => c.channel === "facebook" && c.status === "connected"
    ) ?? [];
  const connectionId = pages.find(p => p.id === selected)?.id ?? pages[0]?.id;
  return (
    <>
      <PageHeader
        eyebrow="Organic channels"
        title="Social Media"
        description="Manage organic content separately from paid advertising. Use the same approved assets and central publishing calendar."
      />
      <nav
        aria-label="Social channels"
        className="mb-6 flex flex-wrap gap-3 rounded-xl border bg-card p-3"
      >
        <Link
          href="/app/social/facebook"
          className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 font-semibold text-primary"
        >
          <Facebook className="h-4 w-4" />
          Meta / Facebook
        </Link>
        <span className="inline-flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
          <Instagram className="h-4 w-4" />
          Instagram - coming next
        </span>
        <span className="px-4 py-2 text-sm text-muted-foreground">
          TikTok - planned
        </span>
      </nav>
      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          variant={tab === "overview" ? "default" : "outline"}
          onClick={() => setTab("overview")}
        >
          Facebook overview
        </Button>
        <Button
          variant={tab === "calendar" ? "default" : "outline"}
          onClick={() => setTab("calendar")}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          Facebook calendar
        </Button>
        <Link
          className="ml-auto self-center text-sm text-primary"
          href="/app/analytics?tab=social"
        >
          View social analytics
        </Link>
      </div>
      {tab === "calendar" ? (
        <PublishingCalendar channelScope="facebook" />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <ChannelConnectionCard channel="facebook" />
            <div className="surface p-6">
              <h2 className="text-xl font-semibold">
                Plan your next Facebook posts
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Start with two posts per week, choose preferred times, and
                schedule future weeks. Create images in Content Studio, approve
                selected versions in the Asset Library, then assemble and
                approve the final Facebook post.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/app/publishing?new=1&channel=facebook">
                  <Button>New Facebook post</Button>
                </Link>
                <Button variant="outline" onClick={() => setTab("calendar")}>
                  Plan the week
                </Button>
                <Link
                  href="/app/creatives"
                  className="self-center text-sm text-primary"
                >
                  Create an asset
                </Link>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Connecting a Page or saving a draft does not publish anything.
                Test-mode schedules remain unsent.
              </p>
            </div>
          </div>
          {pages.length > 0 && (
            <>
              <label
                htmlFor="social-page"
                className="mt-6 block text-sm font-semibold"
              >
                Facebook Page
              </label>
              <select
                id="social-page"
                className={channelInput + " mt-2 max-w-md"}
                value={connectionId}
                onChange={e => setSelected(e.target.value)}
              >
                {pages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {connectionId && (
                <FacebookPosts key={connectionId} connectionId={connectionId} />
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
export default function SocialMediaPage() {
  return (
    <WorkspaceGate>
      <SocialMedia />
    </WorkspaceGate>
  );
}
