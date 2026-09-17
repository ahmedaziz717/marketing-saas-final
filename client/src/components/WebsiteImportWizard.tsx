import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Edit3,
  Globe2,
  Loader2,
  PauseCircle,
  ScanSearch,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type Draft = {
  companyName: string;
  summary: string;
  voice: string;
  colors: string;
  fonts: string;
  requiredClaims: string;
  prohibitedContent: string;
  selectedLogoUrls: string[];
};
type ProductEdit = {
  id: number;
  name: string;
  sku: string;
  category: string;
  description: string;
  productUrl: string;
  price: string;
  currency: string;
  specifications: string;
};
const emptyDraft: Draft = {
  companyName: "",
  summary: "",
  voice: "",
  colors: "",
  fonts: "",
  requiredClaims: "",
  prohibitedContent: "",
  selectedLogoUrls: [],
};

export function WebsiteImportWizard({
  organizationId,
  onComplete,
  scanMode = "brand_and_products",
}: {
  organizationId: number;
  onComplete: () => void;
  scanMode?: "brand_and_products" | "products_only";
}) {
  const utils = trpc.useUtils();
  const latest = trpc.crawl.latest.useQuery(
    { organizationId },
    { refetchInterval: 3000 }
  );
  const catalog = trpc.catalog.overview.useQuery({ organizationId });
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<ProductEdit | null>(null);
  const [restart, setRestart] = useState(false);
  const start = trpc.crawl.start.useMutation();
  const resume = trpc.crawl.resume.useMutation();
  const retryPages = trpc.crawl.retryFailedPages.useMutation({
    onSuccess: () => {
      void refresh();
    },
    onError: e => toast.error(e.message),
  });
  const cancel = trpc.crawl.cancel.useMutation();
  const bulkReview = trpc.catalog.bulkReview.useMutation();
  const reviewProduct = trpc.catalog.reviewProduct.useMutation();
  const updateProduct = trpc.catalog.updateProduct.useMutation();
  const applyDraft = trpc.catalog.applyBrandDraft.useMutation();
  const job = latest.data;
  const imported = job?.brandDraft as
    | (Partial<Draft> & {
        colors?: string[];
        fonts?: string[];
        requiredClaims?: string[];
        prohibitedContent?: string[];
        logoUrls?: string[];
      })
    | null
    | undefined;
  const products = catalog.data?.products ?? [];
  const pendingProducts = useMemo(
    () => products.filter(product => product.status === "pending"),
    [products]
  );

  useEffect(() => {
    if (!imported) return;
    setDraft({
      companyName: imported.companyName ?? "",
      summary: imported.summary ?? "",
      voice: imported.voice ?? "",
      colors: Array.isArray(imported.colors) ? imported.colors.join(", ") : "",
      fonts: Array.isArray(imported.fonts) ? imported.fonts.join(", ") : "",
      requiredClaims: Array.isArray(imported.requiredClaims)
        ? imported.requiredClaims.join("\n")
        : "",
      prohibitedContent: Array.isArray(imported.prohibitedContent)
        ? imported.prohibitedContent.join("\n")
        : "",
      selectedLogoUrls: imported.logoUrls?.slice(0, 3) ?? [],
    });
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (scanMode === "products_only" && job?.sourceUrl && !websiteUrl)
      setWebsiteUrl(job.sourceUrl);
  }, [job?.sourceUrl, scanMode]);

  const refresh = async () =>
    Promise.all([
      utils.crawl.latest.invalidate(),
      utils.catalog.overview.invalidate(),
      utils.brand.get.invalidate(),
      utils.brand.assets.invalidate(),
      utils.activity.list.invalidate(),
    ]);
  const reportScanError = async (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "Website import was interrupted.";
    setScanError(message);
    toast.error(message);
    // A request may have saved progress before its response was interrupted.
    // Re-read the checkpoint and expose Resume instead of starting a duplicate.
    await utils.crawl.latest.invalidate({ organizationId }).catch(() => {});
  };
  const startImport = async () => {
    setScanError(null);
    try {
      await start.mutateAsync({ organizationId, websiteUrl, scanMode });
      await refresh();
      toast.success("Website scan started. You can leave this page.");
    } catch (error) {
      await reportScanError(error);
    }
  };
  const decideProduct = async (
    productId: number,
    decision: "approved" | "rejected"
  ) => {
    try {
      await reviewProduct.mutateAsync({ organizationId, productId, decision });
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Product review failed"
      );
    }
  };
  const approveProducts = async () => {
    if (!pendingProducts.length) return;
    try {
      await bulkReview.mutateAsync({
        organizationId,
        productIds: pendingProducts.map(product => product.id),
        decision: "approved",
      });
      await refresh();
      toast.success(`${pendingProducts.length} products approved`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Products could not be approved"
      );
    }
  };
  const beginEdit = (product: (typeof products)[number]) =>
    setEditing({
      id: product.id,
      name: product.name,
      sku: product.sku ?? "",
      category: product.category ?? "",
      description: product.description ?? "",
      productUrl: product.productUrl,
      price: product.price ?? "",
      currency: product.currency ?? "",
      specifications: Object.entries(product.specifications)
        .map(([name, value]) => `${name}: ${value}`)
        .join("\n"),
    });
  const saveProduct = async () => {
    if (!editing) return;
    const specifications = Object.fromEntries(
      editing.specifications
        .split("\n")
        .map(line => line.split(":"))
        .filter(parts => parts[0]?.trim() && parts.slice(1).join(":").trim())
        .map(parts => [parts[0]!.trim(), parts.slice(1).join(":").trim()])
    );
    try {
      await updateProduct.mutateAsync({
        organizationId,
        productId: editing.id,
        product: {
          name: editing.name,
          sku: editing.sku || null,
          category: editing.category || null,
          description: editing.description || null,
          productUrl: editing.productUrl,
          price: editing.price || null,
          currency: editing.currency || null,
          specifications,
        },
      });
      setEditing(null);
      await refresh();
      toast.success("Product updated and returned to pending review");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Product could not be updated"
      );
    }
  };
  const saveAndContinue = async () => {
    if (!job) return;
    try {
      await applyDraft.mutateAsync({
        organizationId,
        jobId: job.id,
        draft: {
          companyName: draft.companyName,
          summary: draft.summary,
          voice: draft.voice,
          colors: draft.colors
            .split(",")
            .map(value => value.trim().toUpperCase())
            .filter(value => /^#[0-9A-F]{6}$/.test(value)),
          fonts: draft.fonts
            .split(",")
            .map(value => value.trim())
            .filter(Boolean),
          requiredClaims: draft.requiredClaims
            .split("\n")
            .map(value => value.trim())
            .filter(Boolean),
          prohibitedContent: draft.prohibitedContent
            .split("\n")
            .map(value => value.trim())
            .filter(Boolean),
          selectedLogoUrls: draft.selectedLogoUrls,
        },
        activate: true,
      });
      await refresh();
      toast.success("Imported brand kit activated");
      onComplete();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Brand kit could not be activated"
      );
    }
  };

  const reviewReady =
    job?.status === "review_ready" || job?.status === "completed";
  if (scanMode === "brand_and_products" && reviewReady && imported && !restart)
    return (
      <div className="space-y-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow">Review discovered identity</p>
            <h3 className="mt-2 text-2xl font-semibold">
              Everything remains editable.
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setRestart(true)}
            >
              <ScanSearch className="mr-2 h-4 w-4" />
              Start corrected scan
            </Button>
            <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 sm:flex">
              <ShieldCheck className="h-4 w-4" />
              Draft only
            </div>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label>Company name</Label>
            <Input
              className="mt-2"
              value={draft.companyName}
              onChange={event =>
                setDraft({ ...draft, companyName: event.target.value })
              }
            />
          </div>
          <div>
            <Label>Colors</Label>
            <Input
              className="mt-2"
              value={draft.colors}
              onChange={event =>
                setDraft({ ...draft, colors: event.target.value })
              }
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {draft.colors
                .split(",")
                .map(value => value.trim())
                .filter(value => /^#[0-9a-f]{6}$/i.test(value))
                .map(value => (
                  <button
                    type="button"
                    key={value}
                    title={`Remove ${value}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        colors: draft.colors
                          .split(",")
                          .map(item => item.trim())
                          .filter(item => item !== value)
                          .join(", "),
                      })
                    }
                    className="h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-black/10"
                    style={{ background: value }}
                  />
                ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>Company summary</Label>
            <Textarea
              className="mt-2 min-h-24"
              value={draft.summary}
              onChange={event =>
                setDraft({ ...draft, summary: event.target.value })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Brand voice</Label>
            <Textarea
              className="mt-2 min-h-24"
              value={draft.voice}
              onChange={event =>
                setDraft({ ...draft, voice: event.target.value })
              }
            />
          </div>
          <div>
            <Label>Fonts</Label>
            <Input
              className="mt-2"
              value={draft.fonts}
              onChange={event =>
                setDraft({ ...draft, fonts: event.target.value })
              }
            />
          </div>
          <div>
            <Label>
              Required claims{" "}
              <span className="text-muted-foreground">(one per line)</span>
            </Label>
            <Textarea
              className="mt-2 min-h-28"
              value={draft.requiredClaims}
              onChange={event =>
                setDraft({ ...draft, requiredClaims: event.target.value })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label>
              Prohibited content{" "}
              <span className="text-muted-foreground">(one per line)</span>
            </Label>
            <Textarea
              className="mt-2 min-h-24"
              value={draft.prohibitedContent}
              onChange={event =>
                setDraft({ ...draft, prohibitedContent: event.target.value })
              }
            />
          </div>
        </div>
        {imported.logoUrls?.length ? (
          <div>
            <Label>Choose logos to import as pending assets</Label>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {imported.logoUrls.slice(0, 8).map(url => (
                <label
                  key={url}
                  className={`relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-2xl border p-3 ${draft.selectedLogoUrls.includes(url) ? "border-primary bg-primary/5 ring-2 ring-primary/10" : "hairline bg-muted/40"}`}
                >
                  <Checkbox
                    className="absolute left-3 top-3"
                    checked={draft.selectedLogoUrls.includes(url)}
                    onCheckedChange={() =>
                      setDraft({
                        ...draft,
                        selectedLogoUrls: draft.selectedLogoUrls.includes(url)
                          ? draft.selectedLogoUrls.filter(item => item !== url)
                          : [...draft.selectedLogoUrls, url],
                      })
                    }
                  />
                  <img
                    src={url}
                    alt="Discovered logo"
                    className="max-h-full max-w-full object-contain"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-3xl border hairline bg-muted/30 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="eyebrow">Product review</p>
              <h4 className="mt-2 text-lg font-semibold">
                {products.length} products discovered
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Edit, approve, or reject each record. Pending items stay
                unavailable to briefs.
              </p>
            </div>
            {pendingProducts.length > 0 && (
              <Button
                variant="outline"
                onClick={approveProducts}
                disabled={bulkReview.isPending}
              >
                <Check className="mr-2 h-4 w-4" />
                Approve all pending
              </Button>
            )}
          </div>
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
            {products.length === 0 ? (
              <p className="rounded-xl bg-background p-4 text-sm text-muted-foreground">
                No product pages were confidently identified. You can still
                activate the brand kit and add products later.
              </p>
            ) : (
              products.map(product => (
                <div
                  key={product.id}
                  className={`flex flex-col gap-3 rounded-xl border-l-4 bg-background p-3 sm:flex-row sm:items-center ${product.status === "approved" ? "border-l-emerald-500" : product.status === "rejected" ? "border-l-rose-400" : "border-l-amber-400"}`}
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {product.images[0] && (
                      <img
                        src={product.images[0].url}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {product.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {product.category || "Uncategorized"} ·{" "}
                      {Object.keys(product.specifications).length}{" "}
                      specifications
                    </p>
                  </div>
                  <StatusPill status={product.status} />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => beginEdit(product)}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => decideProduct(product.id, "rejected")}
                    >
                      <X className="h-3.5 w-3.5" />
                      <span className="sr-only">Reject</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => decideProduct(product.id, "approved")}
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span className="sr-only">Approve</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        <Button
          className="h-12 rounded-full px-6"
          onClick={saveAndContinue}
          disabled={!draft.companyName || applyDraft.isPending}
        >
          Activate imported brand kit
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Dialog
          open={!!editing}
          onOpenChange={open => !open && setEditing(null)}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-editorial text-4xl font-normal">
                Edit discovered product
              </DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="grid gap-4 py-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Name</Label>
                  <Input
                    className="mt-2"
                    value={editing.name}
                    onChange={event =>
                      setEditing({ ...editing, name: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input
                    className="mt-2"
                    value={editing.sku}
                    onChange={event =>
                      setEditing({ ...editing, sku: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input
                    className="mt-2"
                    value={editing.category}
                    onChange={event =>
                      setEditing({ ...editing, category: event.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    className="mt-2 min-h-24"
                    value={editing.description}
                    onChange={event =>
                      setEditing({
                        ...editing,
                        description: event.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Price</Label>
                  <Input
                    className="mt-2"
                    value={editing.price}
                    onChange={event =>
                      setEditing({ ...editing, price: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input
                    className="mt-2"
                    value={editing.currency}
                    onChange={event =>
                      setEditing({ ...editing, currency: event.target.value })
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>
                    Specifications{" "}
                    <span className="text-muted-foreground">(Name: value)</span>
                  </Label>
                  <Textarea
                    className="mt-2 min-h-40 font-mono text-xs"
                    value={editing.specifications}
                    onChange={event =>
                      setEditing({
                        ...editing,
                        specifications: event.target.value,
                      })
                    }
                  />
                </div>
                <Button
                  className="sm:col-span-2"
                  onClick={saveProduct}
                  disabled={!editing.name || updateProduct.isPending}
                >
                  Save for review
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );

  const active =
    !!job &&
    ["queued", "discovering", "crawling", "analyzing"].includes(job.status);
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Website intelligence</p>
        <h3 className="mt-2 text-2xl font-semibold">
          Scan your entire discoverable catalog
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          One continuous scan, processed in small batches. Progress is saved in
          the background, even when you close your browser. Website scanning
          finds publicly exposed products; add services manually or through CSV.
        </p>
      </div>
      <div>
        <Label htmlFor="scan-url">Company website</Label>
        <Input
          id="scan-url"
          className="mt-2"
          value={websiteUrl}
          onChange={e => setWebsiteUrl(e.target.value)}
          placeholder="https://company.com"
          disabled={active}
        />
      </div>
      {job && (
        <section className="rounded-2xl bg-muted/60 p-5" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-semibold">
              {job.status === "discovering"
                ? "Finding product pages…"
                : job.status === "analyzing"
                  ? "Organizing catalog entries…"
                  : job.status === "cancelled"
                    ? "Scan paused"
                    : job.status.replaceAll("_", " ")}
            </h4>
            {active && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <Progress
            className="mt-4"
            value={
              job.status === "discovering"
                ? undefined
                : job.pagesDiscovered
                  ? Math.min(
                      100,
                      (job.pagesProcessed / job.pagesDiscovered) * 100
                    )
                  : 0
            }
          />
          <p className="mt-2 text-sm">
            {job.pagesProcessed.toLocaleString()} of{" "}
            {job.pagesDiscovered.toLocaleString()} discovered pages read
            {job.status === "crawling"
              ? " · Total may grow as links are discovered"
              : ""}
          </p>
          {job.status === "analyzing" && (
            <p className="mt-2 text-sm">
              {job.analyzed} pages analyzed · {job.failedPages} failed pages.
              Catalog entries are being prepared for review.
            </p>
          )}
          {job.discovery?.failures.length ? (
            <p className="mt-2 text-sm text-amber-700">
              {job.discovery.failures.length} sitemap requests could not be
              read. Coverage may be incomplete.
            </p>
          ) : null}
          {job.errorMessage && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {job.errorMessage}
            </p>
          )}
          {active && (
            <Button
              className="mt-4"
              variant="outline"
              onClick={async () => {
                await cancel.mutateAsync({ organizationId, jobId: job.id });
                await refresh();
              }}
            >
              Pause scan
            </Button>
          )}
          {(["failed", "cancelled"].includes(job.status) ||
            (!job.background && ["crawling", "analyzing"].includes(job.status))) && (
            <Button
              className="mt-4"
              onClick={async () => {
                try {
                  await resume.mutateAsync({ organizationId, jobId: job.id });
                  await refresh();
                } catch (e) {
                  await reportScanError(e);
                }
              }}
            >
              {job.background ? "Resume saved import" : "Continue scan in background"}
            </Button>
          )}
        </section>
      )}
      {scanError && (
        <p role="alert" className="text-sm text-red-700">
          {scanError}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={startImport}
          disabled={active || start.isPending || websiteUrl.trim().length < 4}
        >
          {start.isPending
            ? "Starting…"
            : job
              ? "Scan website again"
              : "Scan entire catalog"}
        </Button>
        {reviewReady && (
          <Button variant="outline" onClick={onComplete}>
            Review catalog
          </Button>
        )}
        {job && !active && job.failedPages > 0 && (
          <Button
            variant="outline"
            onClick={() => retryPages.mutate({ organizationId, jobId: job.id })}
          >
            Retry {job.failedPages} failed pages
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Only public pages are read. Imported facts require review before use.
        There is no 250-page pass limit.
      </p>
    </div>
  );
}
