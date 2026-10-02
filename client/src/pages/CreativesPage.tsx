import { Link, Redirect, useLocation, useSearch } from "wouter";
import {
  Image,
  Megaphone,
  MessageSquare,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { CreativeBuilder } from "@/components/CreativeBuilder";
import { AssetWorkbench } from "@/components/AssetWorkbench";
import {
  PublicationComposer,
  PublicationStatus,
} from "@/components/PublicationComposer";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { mayCreateAssets } from "@shared/assetWorkflow";
import {
  activationHref,
  contentDraftStates,
  legacyStudioHref,
  studioContentHref,
} from "@shared/contentWorkflow";
import {
  channelNames,
  editablePublication,
  type Channel,
} from "@shared/channels";

const modes = [
  {
    path: "images",
    title: "Image",
    icon: Image,
    description:
      "Generate images and placement sizes, or refine a saved setup.",
  },
  {
    path: "social",
    title: "Social post",
    icon: MessageSquare,
    description:
      "Write a Facebook caption, add optional media or a link, and preview your post.",
  },
  {
    path: "ads",
    title: "Ad",
    icon: Megaphone,
    description:
      "Build a Meta ad with copy, headlines, CTA, carousel or placement images.",
  },
] as const;
function Studio() {
  const { organizationId, membership } = useWorkspace();
  const [path, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const mode = path.split("/").at(-1);
  const kind =
    params.get("kind") === "media" ||
    params.has("asset") ||
    params.has("revise")
      ? "media"
      : "content";
  const channel: Channel = mode === "ads" ? "meta_ads" : "facebook";
  const planId = Number(params.get("plan")) || undefined;
  const editId = params.get("edit");
  const canCreate = mayCreateAssets(membership?.role ?? "");
  const canCompose = ["owner", "admin", "creator", "publisher"].includes(
    membership?.role ?? ""
  );
  const [filter, setFilter] = useState("");
  const scope = { organizationId: organizationId! };
  const drafts = trpc.publishing.list.useQuery(scope, {
    enabled: !!organizationId,
  });
  const editing = trpc.publishing.get.useQuery(
    { ...scope, id: editId ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: !!organizationId && !!editId, retry: false }
  );
  const jobs = trpc.creatives.overview.useQuery(scope, {
    enabled: !!organizationId && canCreate,
    refetchInterval: q =>
      q.state.data?.jobs.some(j => ["running", "queued"].includes(j.status))
        ? 5000
        : false,
  });
  const pending = jobs.data?.jobs.some(j =>
    ["running", "queued"].includes(j.status)
  );
  const contentDrafts = (drafts.data?.items ?? []).filter(
    item =>
      contentDraftStates.includes(item.state) &&
      (!planId || item.content.campaignPlanId === planId)
  );
  const visible = contentDrafts.filter(
    item =>
      (!(mode === "ads" || mode === "social") || item.channel === channel) &&
      `${item.content.title} ${item.content.message}`
        .toLowerCase()
        .includes(filter.toLowerCase())
  );
  const compose =
    canCompose &&
    ((params.has("new") && ["social", "ads"].includes(mode ?? "")) ||
      (!!editing.data && editablePublication(editing.data.state)));
  return (
    <>
      <PageHeader
        eyebrow="Create"
        title="Content Studio"
        description="Create an image, a social post, or an ad. Keep drafts here, then choose the destination and schedule in Activate."
        action={
          <Link href="/app/plans" className="text-sm text-primary underline">
            Campaign Plans
          </Link>
        }
      />
      <nav
        aria-label="Studio modes"
        className="mb-6 flex flex-wrap gap-2 border-b pb-4"
      >
        {[
          { path: "", label: "Start" },
          ...modes.map(m => ({ path: m.path, label: m.title })),
          { path: "drafts", label: "Drafts" },
        ].map(m => (
          <Link
            key={m.path}
            href={`/app/creatives${m.path ? "/" + m.path : ""}${planId ? "?plan=" + planId : ""}`}
          >
            <Button
              variant={
                mode === m.path ||
                (!m.path && ["creatives", "overview"].includes(mode ?? ""))
                  ? "default"
                  : "outline"
              }
            >
              {m.label}
            </Button>
          </Link>
        ))}
      </nav>
      {planId && (
        <p className="mb-5 text-sm">
          Showing work for campaign plan #{planId}.{" "}
          <Link href="/app/creatives" className="text-primary underline">
            Show all work
          </Link>
        </p>
      )}
      {["creatives", "overview"].includes(mode ?? "") && (
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          {modes.map(({ path, title, icon: Icon, description }) => (
            <article key={path} className="surface flex min-w-0 flex-col p-6">
              <Icon className="mb-4 h-7 w-7 text-primary" />
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="mb-6 mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
              <Link
                className="flex items-center gap-2 text-sm font-medium text-primary"
                href={
                  path === "images"
                    ? `/app/creatives/images${planId ? "?plan=" + planId : ""}`
                    : studioContentHref(
                        path === "ads" ? "meta_ads" : "facebook",
                        { plan: planId }
                      )
                }
              >
                Create {title.toLowerCase()} <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
      )}
      {mode === "images" ? (
        canCreate ? (
          <CreativeBuilder
            initialPlanId={planId}
            onGenerated={() =>
              navigate(
                `/app/creatives/drafts?kind=media${planId ? "&plan=" + planId : ""}`
              )
            }
          />
        ) : (
          <p className="surface p-6">
            Your role can view assets in the library. Image creation requires a
            creator role.
          </p>
        )
      ) : (
        <>
          {mode === "drafts" && (
            <div className="mb-6 flex flex-wrap gap-2" aria-label="Draft types">
              <Link
                href={`/app/creatives/drafts${planId ? "?plan=" + planId : ""}`}
              >
                <Button variant={kind === "content" ? "default" : "outline"}>
                  Posts & ads
                </Button>
              </Link>
              {canCreate && (
                <Link
                  href={`/app/creatives/drafts?kind=media${planId ? "&plan=" + planId : ""}`}
                >
                  <Button variant={kind === "media" ? "default" : "outline"}>
                    Images & uploads
                  </Button>
                </Link>
              )}
            </div>
          )}
          {mode === "drafts" && kind === "media" ? (
            <>
              {pending && (
                <p
                  role="status"
                  className="mb-5 rounded-xl bg-muted p-4 text-sm"
                >
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Images are generating. Completed versions appear below.
                </p>
              )}
              {jobs.data?.jobs[0]?.status === "failed" && (
                <p role="alert" className="mb-4 rounded-xl border p-4">
                  The latest generation failed: {jobs.data.jobs[0].errorMessage}{" "}
                  <Link
                    href="/app/creatives/images"
                    className="text-primary underline"
                  >
                    Review saved setup
                  </Link>
                </p>
              )}
              <AssetWorkbench
                surface="studio"
                initialType={params.get("type") === "ugc" ? "ugc" : undefined}
              />
            </>
          ) : (
            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">
                    {mode === "social"
                      ? "Social post drafts"
                      : mode === "ads"
                        ? "Ad drafts"
                        : "Continue a draft"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {mode === "social"
                      ? "Captions, media, links and previews for organic posts. Hashtags can go in your caption."
                      : mode === "ads"
                        ? "Primary text, headlines, descriptions, CTA and creative variants for paid ads."
                        : "Posts and ads stay here until ready for delivery review."}
                  </p>
                </div>
                {canCompose && ["social", "ads"].includes(mode ?? "") && (
                  <Link href={studioContentHref(channel, { plan: planId })}>
                    <Button>
                      New {channel === "facebook" ? "post" : "ad"}
                    </Button>
                  </Link>
                )}
              </div>
              <input
                aria-label="Search content drafts"
                className="mb-4 h-11 w-full rounded-xl border bg-background px-4 sm:max-w-md"
                placeholder="Search draft titles or copy…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
              {drafts.isLoading ? (
                <p role="status">Loading drafts…</p>
              ) : drafts.error ? (
                <div role="alert" className="surface p-5">
                  Drafts could not be loaded.{" "}
                  <Button variant="outline" onClick={() => drafts.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : !visible.length ? (
                <div className="surface p-8 text-center">
                  <h3 className="font-semibold">
                    No content drafts in this view
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Start a post or ad above. Review, scheduled and delivered
                    content is in Activate.
                  </p>
                  <Link
                    href="/app/publishing"
                    className="mt-4 inline-block text-primary underline"
                  >
                    Open Calendar
                  </Link>
                </div>
              ) : (
                <div className="grid gap-3">
                  {visible.map(item => (
                    <article
                      key={item.id}
                      className="surface flex flex-wrap items-center justify-between gap-4 p-5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {channelNames[item.channel]} · Updated{" "}
                          {new Date(item.updatedAtMs).toLocaleDateString()}
                        </p>
                        <h3 className="mt-1 break-words font-semibold">
                          {item.content.title}
                        </h3>
                        <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">
                          {item.content.message || "No copy yet"}
                        </p>
                      </div>
                      <PublicationStatus item={item} />
                      <div className="flex flex-wrap gap-2">
                        {canCompose && (
                          <Link
                            href={studioContentHref(item.channel, {
                              id: item.id,
                            })}
                          >
                            <Button variant="outline">Edit content</Button>
                          </Link>
                        )}
                        <Link href={activationHref(item.channel, item.id)}>
                          <Button variant="outline">
                            Continue to Activate
                          </Button>
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {drafts.data?.truncated && (
                <p className="mt-3 text-xs">
                  Showing drafts from the 500 most recent content records.
                  Existing direct links still open older records.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {editId && editing.isLoading && (
        <p role="status" className="mt-4">
          Opening content…
        </p>
      )}
      {editing.error && (
        <p role="alert" className="mt-4">
          This content could not be opened in this workspace.{" "}
          {editing.error.message}
        </p>
      )}
      {editing.data && !editablePublication(editing.data.state) && (
        <p className="surface mt-4 p-5">
          This content is {editing.data.state.replaceAll("_", " ")}.{" "}
          <Link
            href={`/app/publishing?publication=${editing.data.id}`}
            className="text-primary underline"
          >
            View delivery record
          </Link>
        </p>
      )}
      {compose && (
        <PublicationComposer
          key={`${organizationId}:${editId ?? search}`}
          stage="create"
          item={editing.data ?? undefined}
          initialChannel={channel}
          initialAssetKey={params.get("asset") ?? undefined}
          initialPlanId={planId}
          initialConnectionId={params.get("connection") ?? undefined}
          initialAdSetId={params.get("adset") ?? undefined}
          initialTime={params.get("time") ?? undefined}
          initialTimezone={params.get("timezone") ?? undefined}
          onClose={() => navigate(`/app/creatives/${mode}`)}
          onSaved={(id, next, savedChannel) =>
            navigate(
              next === "activate"
                ? activationHref(
                    savedChannel ?? editing.data?.channel ?? channel,
                    id
                  )
                : "/app/creatives/drafts"
            )
          }
        />
      )}
    </>
  );
}
export default function CreativesPage() {
  const [path] = useLocation();
  const search = useSearch();
  const legacy = legacyStudioHref(path, search);
  if (legacy && legacy !== path + "?" + search)
    return <Redirect to={legacy} replace />;
  return (
    <WorkspaceGate>
      <Studio />
    </WorkspaceGate>
  );
}
