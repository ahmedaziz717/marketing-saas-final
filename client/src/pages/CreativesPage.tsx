import { Link, Redirect, useLocation, useSearch } from "wouter";
import {
  Image,
  Megaphone,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  Plus,
  FolderOpen,
} from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { CreativeBuilder } from "@/components/CreativeBuilder";
import { StudioDrafts } from "@/components/StudioDrafts";
import { PublicationComposer } from "@/components/PublicationComposer";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { mayCreateAssets } from "@shared/assetWorkflow";
import {
  activationHref,
  legacyStudioHref,
  studioContentHref,
  studioDraftsHref,
} from "@shared/contentWorkflow";
import { editablePublication, type Channel } from "@shared/channels";

const creationChoices = [
  {
    path: "images",
    title: "Create an image",
    icon: Image,
    description:
      "Generate reusable images for your posts and ads, with sizes for each placement.",
  },
  {
    path: "social",
    title: "Create a social post",
    icon: MessageSquare,
    description:
      "Write your caption, add an image, video or link, and preview the finished post.",
  },
  {
    path: "ads",
    title: "Create an ad",
    icon: Megaphone,
    description:
      "Combine your creative and ad copy, then choose a connected ad account and campaign.",
  },
] as const;

function Studio() {
  const { organizationId, membership } = useWorkspace();
  const [path, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const mode = path.split("/").at(-1);
  const channel: Channel = mode === "ads" ? "meta_ads" : "facebook";
  const planId = Number(params.get("plan")) || undefined;
  const editId = params.get("edit");
  const isDrafts = mode === "drafts" || !!editId;
  const canCreate = mayCreateAssets(membership?.role ?? "");
  const canCompose = ["owner", "admin", "creator", "publisher"].includes(
    membership?.role ?? ""
  );
  const newContentHref = `/app/creatives${planId ? "?plan=" + planId : ""}`;
  const draftsHref = studioDraftsHref({ plan: planId });
  const editing = trpc.publishing.get.useQuery(
    {
      organizationId: organizationId!,
      id: editId ?? "00000000-0000-4000-8000-000000000000",
    },
    { enabled: !!organizationId && !!editId, retry: false }
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
        description="Start something new or pick up where you left off."
        action={
          <Link href="/app/plans" className="text-sm text-primary underline">
            Campaign Plans
          </Link>
        }
      />
      <nav aria-label="Content Studio" className="mb-8 flex gap-1 border-b">
        {[
          {
            label: "New content",
            href: newContentHref,
            active: !isDrafts,
            icon: Plus,
          },
          {
            label: "Drafts",
            href: draftsHref,
            active: isDrafts,
            icon: FolderOpen,
          },
        ].map(({ label, href, active, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"}`}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      {planId && (
        <p className="mb-5 text-sm">
          Showing work for campaign plan #{planId}.{" "}
          <Link
            href={isDrafts ? "/app/creatives/drafts" : "/app/creatives"}
            className="text-primary underline"
          >
            Show all work
          </Link>
        </p>
      )}
      {isDrafts ? (
        <StudioDrafts planId={planId} />
      ) : mode === "images" ? (
        <>
          <Link
            href={newContentHref}
            className="mb-5 inline-flex items-center gap-2 text-sm text-primary"
          >
            <ArrowLeft size={16} />
            Back to new content
          </Link>
          {canCreate ? (
            <CreativeBuilder
              initialPlanId={planId}
              onGenerated={() =>
                navigate(studioDraftsHref({ filter: "images", plan: planId }))
              }
            />
          ) : (
            <p className="surface p-6">
              Your role can view assets in the library. Image creation requires
              a creator role.
            </p>
          )}
        </>
      ) : (
        <section aria-labelledby="studio-create-heading">
          <h2 id="studio-create-heading" className="text-xl font-semibold">
            What would you like to create?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a starting point. Save a draft, then review it before
            publishing.
          </p>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {creationChoices.map(({ path, title, icon: Icon, description }) => {
              const allowed = path === "images" ? canCreate : canCompose;
              const href =
                path === "images"
                  ? `/app/creatives/images${planId ? "?plan=" + planId : ""}`
                  : studioContentHref(
                      path === "ads" ? "meta_ads" : "facebook",
                      { plan: planId }
                    );
              const contents = (
                <>
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon size={25} aria-hidden="true" />
                    </span>
                    {allowed && (
                      <ArrowRight
                        size={20}
                        className="mt-3 text-primary transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <h3 className="text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {description}
                  </p>
                </>
              );
              return allowed ? (
                <Link
                  key={path}
                  href={href}
                  aria-label={title}
                  className="surface group min-w-0 p-6 transition-colors hover:border-primary/50 hover:bg-primary/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {contents}
                </Link>
              ) : (
                <div key={path} className="surface min-w-0 p-6 opacity-70">
                  {contents}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Your workspace role does not allow this action.
                  </p>
                </div>
              );
            })}
          </div>
        </section>
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
          onClose={() =>
            navigate(
              editId
                ? studioDraftsHref({
                    filter: channel === "facebook" ? "social" : "ads",
                    plan: planId,
                  })
                : newContentHref
            )
          }
          onSaved={(id, next, savedChannel) =>
            navigate(
              next === "activate"
                ? activationHref(
                    savedChannel ?? editing.data?.channel ?? channel,
                    id
                  )
                : studioDraftsHref({
                    filter:
                      (savedChannel ?? channel) === "facebook"
                        ? "social"
                        : "ads",
                    plan: planId,
                  })
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
  const params = new URLSearchParams(search);
  if (
    (path.endsWith("/social") || path.endsWith("/ads")) &&
    !params.has("new") &&
    !params.has("edit")
  )
    return (
      <Redirect
        to={studioDraftsHref({
          filter: path.endsWith("/ads") ? "ads" : "social",
          plan: Number(params.get("plan")) || undefined,
        })}
        replace
      />
    );
  return (
    <WorkspaceGate>
      <Studio />
    </WorkspaceGate>
  );
}
