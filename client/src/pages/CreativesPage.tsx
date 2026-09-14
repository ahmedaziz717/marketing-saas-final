import { useMemo, useState } from "react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { CreativeBuilder } from "@/components/CreativeBuilder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { CREATIVE_CHANNELS, formatDetails } from "@shared/creativeBuilder";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Images,
  Loader2,
  MessageSquare,
  X,
} from "lucide-react";
import { toast } from "sonner";

function CreativeStudio() {
  const { organizationId, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"create" | "results">("create");
  const query = trpc.creatives.overview.useQuery(
    { organizationId: organizationId! },
    {
      enabled: !!organizationId,
      refetchInterval: query =>
        query.state.data?.jobs.some(job =>
          ["running", "queued"].includes(job.status)
        )
          ? 5000
          : false,
    }
  );
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    null
  );
  const [comment, setComment] = useState("");
  const download = trpc.creatives.download.useMutation();
  const canReview = ["owner", "admin", "reviewer"].includes(
    membership?.role ?? ""
  );
  const review = trpc.creatives.reviewVariant.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.creatives.overview.invalidate(),
        utils.meta.overview.invalidate(),
        utils.activity.list.invalidate(),
      ]);
      toast.success("Review decision recorded");
    },
    onError: error => toast.error(error.message),
  });
  const addComment = trpc.creatives.addComment.useMutation({
    onSuccess: async () => {
      setComment("");
      await Promise.all([
        utils.creatives.overview.invalidate(),
        utils.activity.list.invalidate(),
      ]);
      toast.success("Comment added");
    },
    onError: error => toast.error(error.message),
  });
  const variants = query.data?.variants ?? [];
  const selected =
    variants.find(variant => variant.id === selectedVariantId) ??
    variants[0] ??
    null;
  const comments = useMemo(
    () =>
      (query.data?.comments ?? []).filter(
        item => item.variantId === selected?.id
      ),
    [query.data?.comments, selected?.id]
  );
  const latestJob = query.data?.jobs[0];
  const exportCreative = async () => {
    if (!selected) return;
    try {
      const file = await download.mutateAsync({
        organizationId: organizationId!,
        variantId: selected.id,
      });
      const bytes = Uint8Array.from(atob(file.base64), character =>
        character.charCodeAt(0)
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: file.mimeType })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed.");
    }
  };
  const copyPackage = async () => {
    if (!selected) return;
    try {
      const copy = selected.renderMetadata?.copy;
      await navigator.clipboard.writeText(
        copy
          ? [copy.headline, copy.subheadline, "CTA: " + copy.cta].join("\n")
          : [
              selected.primaryText,
              "",
              selected.headline,
              selected.description ?? "",
              "CTA: " + selected.callToAction,
            ].join("\n")
      );
      toast.success("Creative copy copied");
    } catch {
      toast.error("Copy was unavailable. Select and copy the text directly.");
    }
  };
  const submitComment = () => {
    if (selected && comment.trim())
      addComment.mutate({
        organizationId: organizationId!,
        variantId: selected.id,
        body: comment.trim(),
      });
  };
  return (
    <>
      <PageHeader
        eyebrow="Content studio"
        title="Creative Builder"
        description="Choose a theme, bring your products and brand assets, and create one consistent idea in every size you need."
      />
      <div
        className="mb-6 flex gap-2 border-b border-border pb-3"
        role="tablist"
        aria-label="Creative workspace"
      >
        <Button
          role="tab"
          id="creative-create-tab"
          aria-controls="creative-create-panel"
          aria-selected={tab === "create"}
          variant={tab === "create" ? "default" : "ghost"}
          className="rounded-full"
          onClick={() => setTab("create")}
        >
          Create
        </Button>
        <Button
          role="tab"
          id="creative-results-tab"
          aria-controls="creative-results-panel"
          aria-selected={tab === "results"}
          variant={tab === "results" ? "default" : "ghost"}
          className="rounded-full"
          onClick={() => setTab("results")}
        >
          Results{variants.length ? " · " + variants.length : ""}
        </Button>
      </div>
      <div
        id="creative-create-panel"
        role="tabpanel"
        aria-labelledby="creative-create-tab"
        hidden={tab !== "create"}
      >
        <CreativeBuilder
          onGenerated={() => {
            setSelectedVariantId(null);
            setTab("results");
          }}
        />
      </div>
      <div
        id="creative-results-panel"
        role="tabpanel"
        aria-labelledby="creative-results-tab"
        hidden={tab !== "results"}
      >
        {query.isLoading && (
          <p className="surface p-5 text-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Loading results…
          </p>
        )}
        {query.error && (
          <div className="surface mb-5 p-5">
            <p>Results could not be loaded.</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => query.refetch()}
            >
              Try again
            </Button>
          </div>
        )}
        {latestJob?.status === "failed" && (
          <section className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">
                The latest attempt could not finish.
              </p>
              <p className="mt-1 text-sm">{latestJob.errorMessage}</p>
              <Button
                variant="outline"
                className="mt-3 bg-white"
                onClick={() => setTab("create")}
              >
                Return to saved setups
              </Button>
            </div>
          </section>
        )}
        {query.data?.jobs.some(job =>
          ["running", "queued"].includes(job.status)
        ) && (
          <p role="status" className="mb-5 rounded-xl bg-primary/5 p-4 text-sm">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A creative
            set is being generated. Results appear here when the whole set is
            ready.
          </p>
        )}
        {!query.isLoading && !query.error && !variants.length ? (
          <div className="surface grid min-h-80 place-items-center p-6 text-center">
            <div>
              <Images className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-4 text-xl font-semibold">
                Your creatives will appear here
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Start with a theme and your products. Every generated image is
                saved for review.
              </p>
              <Button
                className="mt-5 rounded-full"
                onClick={() => setTab("create")}
              >
                Create your first set
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_350px]">
            <section className="min-w-0">
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Creative results</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Review the full image, copy, product details, and logo before
                  approving.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2">
                {variants.map(variant => {
                  const format = formatDetails(variant.format);
                  const channel =
                    CREATIVE_CHANNELS.find(
                      channel => channel.id === variant.channel
                    )?.name ?? "Meta";
                  return (
                    <article
                      key={variant.id}
                      className={
                        "overflow-hidden rounded-2xl border bg-card " +
                        (selected?.id === variant.id
                          ? "border-primary ring-2 ring-primary/10"
                          : "border-border")
                      }
                    >
                      <button
                        type="button"
                        className="relative grid h-64 w-full place-items-center bg-muted/50 p-3"
                        aria-label={"Inspect " + variant.name}
                        onClick={() => setSelectedVariantId(variant.id)}
                      >
                        <img
                          src={variant.imageUrl}
                          alt={variant.name}
                          className="max-h-full max-w-full object-contain"
                          loading="lazy"
                        />
                        <span className="absolute left-2 top-2">
                          <StatusPill status={variant.status} />
                        </span>
                      </button>
                      <div className="p-4">
                        <p className="text-xs text-muted-foreground">
                          {channel} ·{" "}
                          {format
                            ? format.width + " × " + format.height
                            : variant.format.replaceAll("_", " ")}
                        </p>
                        <button
                          type="button"
                          className="mt-2 block text-left font-medium"
                          onClick={() => setSelectedVariantId(variant.id)}
                        >
                          {variant.name}
                        </button>
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {variant.headline}
                        </p>
                        {canReview && (
                          <div className="mt-4 flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              disabled={
                                review.isPending ||
                                variant.status === "approved"
                              }
                              onClick={() =>
                                review.mutate({
                                  organizationId: organizationId!,
                                  variantId: variant.id,
                                  decision: "approved",
                                })
                              }
                            >
                              <Check className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={"Reject " + variant.name}
                              disabled={
                                review.isPending ||
                                variant.status === "rejected"
                              }
                              onClick={() =>
                                review.mutate({
                                  organizationId: organizationId!,
                                  variantId: variant.id,
                                  decision: "rejected",
                                })
                              }
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            {selected && (
              <aside className="surface h-fit overflow-hidden 2xl:sticky 2xl:top-6">
                <div className="border-b border-border p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-medium">{selected.name}</h2>
                    <StatusPill status={selected.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selected.concept}
                  </p>
                </div>
                <div className="space-y-5 p-5">
                  <a
                    href={selected.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl bg-muted/50 p-2"
                    aria-label="Open full creative"
                  >
                    <img
                      src={selected.imageUrl}
                      alt={selected.name}
                      className="max-h-96 w-full object-contain"
                    />
                  </a>
                  <div>
                    <p className="font-medium">{selected.headline}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                      {selected.primaryText}
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {selected.renderMetadata?.copy.cta ??
                        selected.callToAction.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={copyPackage}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy text
                    </Button>
                    <Button
                      variant="outline"
                      disabled={download.isPending}
                      onClick={exportCreative}
                    >
                      {download.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-4 w-4" />
                      )}
                      Export
                    </Button>
                  </div>
                  <div className="border-t border-border pt-5">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquare className="h-4 w-4" />
                      Review comments
                    </p>
                    <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
                      {comments.length ? (
                        comments.map(item => (
                          <div
                            key={item.id}
                            className="rounded-xl bg-muted/60 p-3 text-xs leading-5"
                          >
                            {item.body}
                            <p className="mt-1 text-muted-foreground">
                              {new Date(item.createdAtMs).toLocaleString()}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No comments yet.
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Input
                        aria-label="Review comment"
                        value={comment}
                        maxLength={3000}
                        onChange={event => setComment(event.target.value)}
                        placeholder="Add a review note…"
                        onKeyDown={event => {
                          if (event.key === "Enter" && !addComment.isPending)
                            submitComment();
                        }}
                      />
                      <Button
                        size="icon"
                        aria-label="Add review comment"
                        disabled={!comment.trim() || addComment.isPending}
                        onClick={submitComment}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </>
  );
}
export default function CreativesPage() {
  return (
    <WorkspaceGate>
      <CreativeStudio />
    </WorkspaceGate>
  );
}
