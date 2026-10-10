import "@/styles/workflows.css";
import { WorkflowApps } from "@/components/WorkflowApps";
import { VideoStudio } from "@/components/VideoStudio";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import {
  Image,
  Clapperboard,
  Megaphone,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  Users,
  BookOpenText,
  Mail,
  PanelsTopLeft,
  FileText,
} from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { CreateNavigation } from "@/components/CreateNavigation";
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
    title: "Image creator",
    icon: Image,
    description:
      "Turn your products, services, or ideas into images in every size you need.",
  },
  {
    path: "video",
    title: "Product video",
    icon: Clapperboard,
    description:
      "Bring products and ideas to life. Generate, edit, extend, and restyle video.",
  },
  {
    path: "ugc-video",
    title: "Creator video",
    icon: Users,
    description:
      "Choose people from the model library and generate a video from your references and creative direction.",
  },
  {
    path: "ads",
    title: "Ad builder",
    icon: Megaphone,
    description:
      "Pair approved media with ad copy and creative variations for your connected channels.",
  },
  {
    path: "social",
    title: "Social composer",
    icon: MessageSquare,
    description:
      "Compose a post with a caption, image, video, or link. Preview it before publishing.",
  },
  {
    path: "plans",
    title: "Campaign planner",
    icon: BookOpenText,
    description:
      "Give your campaign a goal, audience, and creative direction. Keep its content together.",
  },
] as const;
const plannedChoices = [
  { title: "Email builder", icon: Mail, href: "/app/creatives/email" },
  { title: "Landing pages", icon: PanelsTopLeft, href: "/app/creatives/pages" },
  { title: "Blog & insights", icon: FileText, href: "/app/creatives/blog" },
];

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
        title="Create"
        description="One place for your images, videos, ads, and posts. Start with an app or continue a draft."
        action={
          <Link
            href="/app/brand?tab=brand"
            className="text-sm font-medium text-primary"
          >
            Open Brand <ArrowRight size={14} className="ml-1 inline" />
          </Link>
        }
      />
      <CreateNavigation planId={planId} />
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
      ) : mode === "video" ? (
        <>
          <Link
            href={newContentHref}
            className="mb-5 inline-flex items-center gap-2 text-sm text-primary"
          >
            <ArrowLeft size={16} />
            Back to apps
          </Link>
          {canCreate ? (
            <VideoStudio key={organizationId} initialPlanId={planId} />
          ) : (
            <p className="surface p-6">
              Video creation requires a creator role.
            </p>
          )}
        </>
      ) : mode === "images" ? (
        <>
          <Link
            href={newContentHref}
            className="mb-5 inline-flex items-center gap-2 text-sm text-primary"
          >
            <ArrowLeft size={16} />
            Back to apps
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
          <div className="studio-section-heading">
            <div>
              <h2 id="studio-create-heading">Your creative toolkit</h2>
              <p>
                Choose an app. Your brand and campaign context come with you.
              </p>
            </div>
            <Link href={draftsHref}>
              Continue a draft <ArrowRight size={15} />
            </Link>
          </div>
          <div className="studio-app-grid">
            {creationChoices.map(choice => {
              const { path, title, icon: Icon, description } = choice;
              const assetApp = ["images", "video", "ugc-video"].includes(path);
              const allowed =
                path === "plans" || (assetApp ? canCreate : canCompose);
              const query = new URLSearchParams();
              if (planId) query.set("plan", String(planId));
              if (path === "ugc-video") query.set("type", "ugc");
              const href =
                path === "plans"
                  ? "/app/plans"
                  : assetApp
                    ? `/app/creatives/${path === "ugc-video" ? "video" : path}${query.size ? "?" + query : ""}`
                    : studioContentHref(
                        path === "ads" ? "meta_ads" : "facebook",
                        { plan: planId }
                      );
              const contents = (
                <>
                  <div
                    className="studio-app-art"
                    data-app={path}
                    aria-hidden="true"
                  >
                    <div className="studio-app-symbol">
                      <Icon size={32} strokeWidth={1.5} />
                    </div>
                    <span className="studio-app-orbit" />
                  </div>
                  <div className="studio-app-body">
                    <div className="studio-app-title">
                      <h3>{title}</h3>
                      {allowed && <ArrowRight size={17} aria-hidden="true" />}
                    </div>
                    <p>{description}</p>
                    {!allowed && (
                      <span className="mt-3 block text-xs text-muted-foreground">
                        A creator or publisher role is required.
                      </span>
                    )}
                  </div>
                </>
              );
              return allowed ? (
                <Link
                  key={path}
                  href={href}
                  aria-label={title}
                  className="studio-app-card"
                >
                  {contents}
                </Link>
              ) : (
                <div key={path} className="studio-app-card unavailable">
                  {contents}
                </div>
              );
            })}
          </div>
          {organizationId &&
            ["owner", "admin", "creator", "publisher"].includes(
              membership?.role ?? ""
            ) && (
              <WorkflowApps organizationId={organizationId} family="create" />
            )}
          <div className="studio-planned-section">
            <div className="studio-section-heading">
              <div>
                <h2>More ways to create</h2>
                <p>
                  On the roadmap. Your content will share the same brand and
                  asset library.
                </p>
              </div>
            </div>
            <div className="studio-planned-grid">
              {plannedChoices.map(({ title, icon: Icon, href }) => (
                <Link key={href} href={href} className="studio-planned-card">
                  <Icon size={21} aria-hidden="true" />
                  <span>{title}</span>
                  <span className="workspace-planned">Planned</span>
                </Link>
              ))}
            </div>
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
