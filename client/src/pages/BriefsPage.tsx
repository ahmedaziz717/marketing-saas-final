import { Link, useSearch } from "wouter";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpenText,
  Check,
  PackageCheck,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { normalizeDestinationUrl } from "@shared/briefValidation";
import { getBriefDraftUiState } from "./briefFormState";

const placements = [
  ["facebook_feed", "Facebook feed"],
  ["instagram_feed", "Instagram feed"],
  ["instagram_story", "Instagram stories"],
  ["instagram_reels", "Instagram reels"],
] as const;
const formats = [
  ["square_1_1", "Square · 1:1"],
  ["portrait_4_5", "Portrait · 4:5"],
  ["story_9_16", "Story · 9:16"],
  ["landscape_1_91_1", "Landscape · 1.91:1"],
] as const;

function BriefsContent() {
  const { organizationId, membership } = useWorkspace();
  const canEdit = ["owner", "admin", "creator"].includes(
    membership?.role ?? ""
  );
  const canReview = ["owner", "admin", "reviewer"].includes(
    membership?.role ?? ""
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const search = useSearch();
  const [open, setOpen] = useState(
    () => new URLSearchParams(search).has("new") && canEdit
  );
  const briefQuery = trpc.briefs.list.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const assetQuery = trpc.brand.assets.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const catalogQuery = trpc.catalog.overview.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const deliveries = trpc.publishing.list.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const approvedAssets =
    assetQuery.data?.filter(asset => asset.status === "approved") ?? [];
  const approvedProducts =
    catalogQuery.data?.products.filter(
      product => product.status === "approved"
    ) ?? [];
  const emptyForm = () => ({
    name: "",
    audience: "",
    offer: "",
    creativeDirection: "",
    destinationUrl: "",
    requiredClaims: "",
    placements: ["facebook_feed", "instagram_feed"],
    formats: ["square_1_1", "portrait_4_5"],
    assetIds: [] as number[],
    productIds: [] as number[],
  });
  const [form, setForm] = useState(emptyForm);
  const create = trpc.briefs.create.useMutation({
    onSuccess: () => {
      utils.briefs.list.invalidate();
      setOpen(false);
      toast.success("Campaign plan saved");
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.briefs.update.useMutation({
    onSuccess: () => {
      void utils.briefs.list.invalidate();
      setOpen(false);
      setEditingId(null);
      toast.success("Campaign plan updated");
    },
    onError: error => toast.error(error.message),
  });
  const submit = trpc.briefs.submit.useMutation({
    onSuccess: () => utils.briefs.list.invalidate(),
    onError: error => toast.error(error.message),
  });
  const review = trpc.briefs.review.useMutation({
    onSuccess: () => utils.briefs.list.invalidate(),
    onError: error => toast.error(error.message),
  });
  const toggle = (field: "placements" | "formats", value: string) =>
    setForm({
      ...form,
      [field]: form[field].includes(value)
        ? form[field].filter(item => item !== value)
        : [...form[field], value],
    });
  const toggleId = (field: "assetIds" | "productIds", id: number) =>
    setForm({
      ...form,
      [field]: form[field].includes(id)
        ? form[field].filter(item => item !== id)
        : [...form[field], id],
    });
  const draftUi = useMemo(
    () => getBriefDraftUiState(form, create.isPending || update.isPending),
    [form, create.isPending, update.isPending]
  );
  const saveIssues = draftUi.issues;
  const saveDraft = () => {
    if (saveIssues.length) {
      toast.error(saveIssues.join(". "));
      return;
    }
    const input = {
      ...form,
      destinationUrl: draftUi.normalizedDestinationUrl ?? "",
      organizationId: organizationId!,
      placements: form.placements as any,
      formats: form.formats as any,
    };
    if (editingId) update.mutate({ ...input, briefId: editingId });
    else create.mutate(input);
  };

  return (
    <>
      <PageHeader
        eyebrow="Create"
        title="Campaign Plans"
        description="Capture an audience, offer, and objective. Connect the images, posts and ads you create to the same plan. Plans are optional for quick, standalone content."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                className="rounded-full"
                disabled={!canEdit}
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm());
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle className="font-editorial text-4xl font-normal">
                  {editingId ? "Edit campaign plan" : "Create campaign plan"}
                </DialogTitle>
                <DialogDescription>
                  Capture the objective and optional references for this
                  campaign.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 py-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>
                    Plan name{" "}
                    <span className="text-muted-foreground">
                      (required to save)
                    </span>
                  </Label>
                  <Input
                    className="mt-2"
                    value={form.name}
                    onChange={event =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                  {form.name.length > 0 && form.name.trim().length < 3 && (
                    <p className="mt-1 text-xs text-destructive">
                      Use at least 3 characters.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Audience</Label>
                  <Textarea
                    className="mt-2 min-h-28"
                    value={form.audience}
                    onChange={event =>
                      setForm({ ...form, audience: event.target.value })
                    }
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    10 characters required before review; drafts may be shorter.
                  </p>
                </div>
                <div>
                  <Label>Offer</Label>
                  <Textarea
                    className="mt-2 min-h-28"
                    value={form.offer}
                    onChange={event =>
                      setForm({ ...form, offer: event.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Objective & creative direction</Label>
                  <Textarea
                    className="mt-2 min-h-32"
                    value={form.creativeDirection}
                    onChange={event =>
                      setForm({
                        ...form,
                        creativeDirection: event.target.value,
                      })
                    }
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    10 characters required before review; drafts may be shorter.
                  </p>
                </div>
                <div>
                  <Label>
                    Destination URL{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    className="mt-2"
                    value={form.destinationUrl}
                    onChange={event =>
                      setForm({ ...form, destinationUrl: event.target.value })
                    }
                    onBlur={() => {
                      const normalized = normalizeDestinationUrl(
                        form.destinationUrl
                      );
                      if (normalized)
                        setForm({ ...form, destinationUrl: normalized });
                    }}
                  />
                  {normalizeDestinationUrl(form.destinationUrl) === null && (
                    <p className="mt-1 text-xs text-destructive">
                      Enter a valid domain or complete HTTP(S) URL.
                    </p>
                  )}
                </div>
                <div>
                  <Label>
                    Campaign-specific claims{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    className="mt-2"
                    value={form.requiredClaims}
                    onChange={event =>
                      setForm({ ...form, requiredClaims: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Placements</Label>
                  <div className="mt-3 space-y-2">
                    {placements.map(([value, label]) => (
                      <label
                        key={value}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={form.placements.includes(value)}
                          onCheckedChange={() => toggle("placements", value)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Formats</Label>
                  <div className="mt-3 space-y-2">
                    {formats.map(([value, label]) => (
                      <label
                        key={value}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={form.formats.includes(value)}
                          onCheckedChange={() => toggle("formats", value)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label>
                    Approved catalog offerings{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  {approvedProducts.length === 0 ? (
                    <p className="mt-2 rounded-xl bg-muted/70 p-3 text-sm text-muted-foreground">
                      You can plan a brand, directory, subscription or service
                      campaign without a catalog item.
                    </p>
                  ) : (
                    <div className="mt-3 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto p-1 md:grid-cols-3">
                      {approvedProducts.map(product => (
                        <label
                          key={product.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${form.productIds.includes(product.id) ? "border-primary bg-primary/5" : "hairline"}`}
                        >
                          <Checkbox
                            checked={form.productIds.includes(product.id)}
                            onCheckedChange={() =>
                              toggleId("productIds", product.id)
                            }
                          />
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {product.images[0] && (
                              <img
                                src={product.images[0].url}
                                alt=""
                                className="h-full w-full object-contain"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-medium">
                              {product.name}
                            </span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {product.sku ||
                                product.category ||
                                "Approved product"}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Label>
                    Approved brand assets{" "}
                    <span className="text-muted-foreground">
                      (required before review)
                    </span>
                  </Label>
                  {approvedAssets.length === 0 ? (
                    <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                      Approve at least one logo or brand asset before submitting
                      for review. You can still save this draft.
                    </p>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                      {approvedAssets.map(asset => (
                        <label
                          key={asset.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${form.assetIds.includes(asset.id) ? "border-primary bg-primary/5" : "hairline"}`}
                        >
                          <Checkbox
                            checked={form.assetIds.includes(asset.id)}
                            onCheckedChange={() =>
                              toggleId("assetIds", asset.id)
                            }
                          />
                          <img
                            src={asset.url}
                            alt=""
                            className="h-9 w-9 rounded-md object-contain"
                          />
                          <span className="truncate text-xs font-medium">
                            {asset.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {saveIssues.length > 0 && (
                <div className="mb-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>To save this draft: {saveIssues.join("; ")}.</span>
                </div>
              )}
              <p className="mb-3 text-xs text-muted-foreground">
                Plan approval covers the brief. Media and delivery have their
                own approvals. Editing a reviewed plan returns it to draft.
              </p>
              <Button
                className="w-full"
                disabled={create.isPending || update.isPending}
                onClick={saveDraft}
              >
                {create.isPending || update.isPending ? "Saving…" : "Save plan"}
              </Button>
            </DialogContent>
          </Dialog>
        }
      />
      {!briefQuery.data?.length ? (
        <div className="surface grid min-h-[420px] place-items-center p-8 text-center">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <BookOpenText className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">
              No campaign plans yet
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with an audience and an objective, or go directly to Content
              Studio.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {briefQuery.data.map(brief => (
            <article key={brief.id} className="surface p-5 md:p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-center">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold">{brief.name}</h2>
                    <StatusPill status={brief.status} />
                    {(brief.productIds?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                        <PackageCheck className="h-3 w-3" />
                        {brief.productIds!.length} products
                      </span>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                    {brief.creativeDirection ||
                      "Objective and creative direction not completed yet."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {brief.formats.map(format => (
                      <span
                        key={format}
                        className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium"
                      >
                        {format.replaceAll("_", " · ")}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingId(brief.id);
                        setForm({
                          name: brief.name,
                          audience: brief.audience,
                          offer: brief.offer,
                          creativeDirection: brief.creativeDirection,
                          destinationUrl: brief.destinationUrl ?? "",
                          requiredClaims: brief.requiredClaims ?? "",
                          placements: brief.placements,
                          formats: brief.formats,
                          assetIds: brief.assetIds,
                          productIds: brief.productIds ?? [],
                        });
                        setOpen(true);
                      }}
                    >
                      Edit plan
                    </Button>
                  )}
                  <Link href={`/app/creatives?plan=${brief.id}`}>
                    <Button>Create content</Button>
                  </Link>
                  <Link href={`/app/publishing?plan=${brief.id}`}>
                    <Button variant="outline">
                      View delivery (
                      {deliveries.data?.items.filter(
                        p => p.content.campaignPlanId === brief.id
                      ).length ?? 0}
                      )
                    </Button>
                  </Link>
                  {canEdit && ["draft", "rejected"].includes(brief.status) && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        submit.mutate({
                          organizationId: organizationId!,
                          briefId: brief.id,
                        })
                      }
                    >
                      Review plan
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                  {canReview && brief.status === "in_review" && (
                    <>
                      <Button
                        onClick={() =>
                          review.mutate({
                            organizationId: organizationId!,
                            briefId: brief.id,
                            decision: "approved",
                          })
                        }
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          review.mutate({
                            organizationId: organizationId!,
                            briefId: brief.id,
                            decision: "rejected",
                          })
                        }
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export default function BriefsPage() {
  return (
    <WorkspaceGate>
      <BriefsContent />
    </WorkspaceGate>
  );
}
