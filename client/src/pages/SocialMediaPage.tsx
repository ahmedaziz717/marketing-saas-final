import { useState } from "react";
import { Link } from "wouter";
import { CalendarDays } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { channelInput } from "@/components/ChannelConnections";
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
        eyebrow="Social Media / Meta"
        title="Facebook"
        description="Manage organic content separately from paid advertising. Use the same approved assets and central publishing calendar."
      />
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
          href="/app/analytics/social"
        >
          View social analytics
        </Link>
      </div>
      {tab === "calendar" ? (
        <PublishingCalendar channelScope="facebook" />
      ) : (
        <>
          <div>
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
          {query.isLoading ? (
            <p role="status" className="mt-6 text-sm">
              Loading Facebook Pages...
            </p>
          ) : query.error ? (
            <div role="alert" className="mt-6 text-sm">
              <p>Could not load Facebook Pages.</p>
              <Button variant="ghost" onClick={() => query.refetch()}>
                Try again
              </Button>
            </div>
          ) : !pages.length ? (
            <p className="mt-6 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
              No Facebook Pages connected. Account setup is managed in{" "}
              <Link
                href="/app/settings/integrations"
                className="font-medium text-primary underline underline-offset-4"
              >
                Settings / Integrations
              </Link>
              . You can still prepare drafts and plan your calendar here.
            </p>
          ) : null}
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
