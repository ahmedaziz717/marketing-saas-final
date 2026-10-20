import { ApiProductDetails } from "@/components/ApiProductDetails";
import { CatalogFactsFields } from "@/components/CatalogFactsFields";
import { catalogRefreshChanges } from "@shared/catalogRefresh";
import {
  structuredCatalogFacts,
  specificationsFromLines,
  availabilityLabel,
} from "@shared/catalogFacts";
import "@/styles/catalogFacts.css";
import { VisualSelect } from "@/components/choices/VisualSelect";
import { offeringLabel } from "@shared/businessProfile";
import { CatalogSources } from "@/components/CatalogSources";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  Check,
  Edit3,
  ExternalLink,
  Loader2,
  PackageSearch,
  RotateCcw,
  ScanSearch,
  ShieldX,
  Trash2,
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
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { getCatalogApprovalAction } from "./catalogReviewState";

type Editable = {
  serviceDetails:
    | import("zod").z.infer<
        typeof import("@shared/catalog").serviceDetailsSchema
      >
    | null;
  id: number;
  name: string;
  sku: string;
  category: string;
  recordType: string;
  description: string;
  productUrl: string;
  price: string;
  currency: string;
  specifications: string;
  features: string[];
  availability: string;
  variants: Array<{
    id: number;
    name: string;
    sku: string | null;
    price: string | null;
    currency: string | null;
    availability: string | null;
  }>;
};

function CatalogContent() {
  const { organizationId, membership } = useWorkspace();
  const canReview = ["owner", "admin", "reviewer"].includes(
    membership?.role ?? ""
  );
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const searchParams = new URLSearchParams(useSearch());
  const requestedTab = searchParams.get("view");
  const tab =
    requestedTab === "services" || requestedTab === "sources"
      ? requestedTab
      : "products";
  const setTab = (value: string) => setLocation(`/app/catalog?view=${value}`);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [offset, setOffset] = useState(0);
  const filters = {
    search,
    status: status as "all" | "pending" | "approved" | "rejected",
    category,
    kind: tab === "services" ? ("services" as const) : ("products" as const),
  };
  const query = trpc.catalog.overview.useQuery(
    {
      organizationId: organizationId!,
      offset,
      ...filters,
    },
    { enabled: !!organizationId }
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [allMatching, setAllMatching] = useState(false);
  const clearSelection = () => {
    setSelected([]);
    setAllMatching(false);
  };
  useEffect(() => {
    setSelected([]);
    setAllMatching(false);
    setOffset(0);
  }, [tab, organizationId]);
  const [editing, setEditing] = useState<Editable | null>(null);
  const refresh = async () =>
    Promise.all([
      utils.catalog.overview.invalidate(),
      utils.activity.list.invalidate(),
    ]);
  const review = trpc.catalog.reviewProduct.useMutation({
    onSuccess: async (_, variables) => {
      await refresh();
      toast.success(
        variables.decision === "pending"
          ? "Product unapproved"
          : variables.decision === "approved"
            ? "Product approved"
            : "Product rejected"
      );
    },
    onError: error => toast.error(error.message),
  });
  const bulk = trpc.catalog.bulkReview.useMutation({
    onSuccess: async (result, variables) => {
      clearSelection();
      setOffset(0);
      await refresh();
      toast.success(
        `${result.updated} catalog ${result.updated === 1 ? "entry" : "entries"} ${variables.decision}`
      );
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.catalog.updateProduct.useMutation({
    onSuccess: async () => {
      setEditing(null);
      await refresh();
      toast.success("Product updated and returned to pending review");
    },
    onError: error => toast.error(error.message),
  });
  const cleanup = trpc.catalog.cleanupNonProducts.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(
        result.removed
          ? `${result.removed} non-product records removed`
          : "No unapproved non-product records found"
      );
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.catalog.deleteProduct.useMutation({
    onSuccess: async () => {
      await refresh();
      toast.success("Catalog record removed");
    },
    onError: error => toast.error(error.message),
  });
  const categories = query.data?.categories ?? [];
  const products = useMemo(() => {
    const categoryPriority: Record<string, number> = {
      "3D Printers": 0,
      "Material Systems": 1,
      Products: 2,
      "Filaments & Materials": 3,
      "Accessories & Parts": 4,
      Software: 5,
    };
    const typePriority: Record<string, number> = {
      family: 0,
      standalone: 1,
      bundle: 2,
      material: 3,
      accessory: 4,
      software: 5,
      service: 6,
    };
    return [...(query.data?.products ?? [])].sort(
      (a, b) =>
        (categoryPriority[a.category ?? ""] ?? 20) -
          (categoryPriority[b.category ?? ""] ?? 20) ||
        (typePriority[a.recordType] ?? 20) -
          (typePriority[b.recordType] ?? 20) ||
        a.name.localeCompare(b.name)
    );
  }, [query.data?.products]);
  const visibleIds = products.map(product => product.id);
  const selectedIds = selected.filter(id => visibleIds.includes(id));
  const selectedCount = allMatching
    ? (query.data?.total ?? 0)
    : selectedIds.length;
  const pageSelected =
    products.length > 0 &&
    (allMatching || selectedIds.length === products.length);
  const selectionDisabled =
    !canReview || bulk.isPending || review.isPending || query.isFetching;
  const reviewSelected = (decision: "approved" | "rejected") => {
    if (!selectedCount || selectionDisabled) return;
    bulk.mutate({
      organizationId: organizationId!,
      decision,
      ...(allMatching ? { filter: filters } : { productIds: selectedIds }),
    });
  };
  const summary = useMemo(
    () => ({
      products: query.data?.total ?? 0,
      families:
        query.data?.products.filter(product => product.recordType === "family")
          .length ?? 0,
      variants:
        query.data?.products.reduce(
          (sum, product) => sum + product.variants.length,
          0
        ) ?? 0,
    }),
    [query.data?.products, query.data?.total]
  );
  const beginEdit = (product: (typeof products)[number]) =>
    setEditing({
      serviceDetails: product.serviceDetails as Editable["serviceDetails"],
      id: product.id,
      name: product.name,
      sku: product.sku ?? "",
      category: product.category ?? "",
      recordType: product.recordType,
      description: product.description ?? "",
      productUrl: product.productUrl,
      price: product.price ?? "",
      currency: product.currency ?? "",
      features: structuredCatalogFacts(product).features,
      availability: structuredCatalogFacts(product).availability,
      specifications: Object.entries(
        structuredCatalogFacts(product).specifications
      )
        .map(([name, value]) => `${name}: ${value}`)
        .join("\n"),
      variants: product.variants,
    });
  const save = () => {
    if (!editing) return;
    const specifications = specificationsFromLines(editing.specifications);
    update.mutate({
      organizationId: organizationId!,
      productId: editing.id,
      product: {
        serviceDetails: editing.serviceDetails,
        name: editing.name,
        sku: editing.sku || null,
        category: editing.category || null,
        description: editing.description || null,
        productUrl: editing.productUrl,
        price: editing.price || null,
        currency: editing.currency || null,
        specifications,
        features: editing.features.map(f => f.trim()).filter(Boolean),
        availability: editing.availability || null,
      },
    });
  };

  const tabs = (
    <div className="mb-6 flex flex-wrap gap-2 border-b pb-4">
      {["products", "services", "sources"].map(t => (
        <Button
          key={t}
          variant={tab === t ? "default" : "ghost"}
          className="rounded-full capitalize"
          disabled={bulk.isPending}
          onClick={() => {
            setTab(t);
            clearSelection();
            setOffset(0);
          }}
        >
          {t === "services" ? "Services & subscriptions" : t}
        </Button>
      ))}
    </div>
  );
  if (tab === "sources")
    return (
      <>
        <PageHeader
          compact
          eyebrow="Catalog"
          title="Catalog & offerings"
          description="Scan a website, connect a store, or add your own products and services."
        />
        {tabs}
        <CatalogSources organizationId={organizationId!} />
      </>
    );
  return (
    <>
      <PageHeader
        compact
        eyebrow="Approved product truth"
        title="Catalog & offerings"
        description="Your products, services, subscriptions, and platform offerings, connected to every creative. Review facts and approve what your team can use."
        action={
          <div className="flex flex-wrap gap-2">
            <Button disabled={bulk.isPending} onClick={() => setTab("sources")}>
              Add source or item
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={cleanup.isPending || bulk.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Remove all unapproved records that do not have verified product-page evidence? Approved products will be preserved."
                  )
                )
                  cleanup.mutate({ organizationId: organizationId! });
              }}
            >
              <ShieldX className="mr-2 h-4 w-4" />
              Clean non-products
            </Button>
            <Button
              className="rounded-full"
              disabled={bulk.isPending}
              onClick={() => setLocation("/app/catalog/import")}
            >
              <ScanSearch className="mr-2 h-4 w-4" />
              Import website
            </Button>
          </div>
        }
      />
      {tabs}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-primary/10 px-3 py-1.5 font-semibold text-primary">
          {summary.products} catalog entries
        </span>
        <span className="rounded-full bg-muted px-3 py-1.5 font-semibold">
          {summary.families} product families
        </span>
        <span className="rounded-full bg-muted px-3 py-1.5 font-semibold">
          {summary.variants} source variants
        </span>
      </div>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center">
        <Input
          className="h-11 max-w-md"
          value={search}
          disabled={bulk.isPending}
          aria-label="Search catalog"
          onChange={event => {
            setSearch(event.target.value);
            setOffset(0);
            clearSelection();
          }}
          placeholder="Search products, SKUs, or categories…"
        />
        <VisualSelect
          density="compact"
          aria-label="Review status"
          value={status}
          disabled={bulk.isPending}
          onValueChange={v => {
            setStatus(v);
            setOffset(0);
            clearSelection();
          }}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </VisualSelect>
        <VisualSelect
          density="compact"
          aria-label="Catalog category"
          value={category}
          disabled={bulk.isPending}
          onValueChange={v => {
            setCategory(v);
            setOffset(0);
            clearSelection();
          }}
        >
          <option value="all">All categories</option>
          {categories.map(item => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </VisualSelect>
      </div>
      <div
        className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 sm:p-4"
        aria-label="Catalog selection"
      >
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm font-medium">
          <Checkbox
            checked={
              pageSelected ? true : selectedIds.length ? "indeterminate" : false
            }
            disabled={!products.length || selectionDisabled}
            onCheckedChange={checked => {
              setAllMatching(false);
              setSelected(checked === true ? visibleIds : []);
            }}
          />
          Select all on this page
        </label>
        <span className="text-sm text-muted-foreground" role="status">
          {allMatching
            ? `All ${selectedCount} matching entries selected`
            : `${selectedCount} selected`}
        </span>
        {pageSelected &&
          !allMatching &&
          (query.data?.total ?? 0) > products.length && (
            <Button
              variant="link"
              className="h-auto whitespace-normal px-0 text-left"
              disabled={selectionDisabled}
              onClick={() => setAllMatching(true)}
            >
              Select all {query.data?.total} matching entries
            </Button>
          )}
        {selectedCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={bulk.isPending}
            onClick={clearSelection}
          >
            Clear selection
          </Button>
        )}
        {selectedCount > 0 && (
          <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={selectionDisabled}
              onClick={() => reviewSelected("rejected")}
            >
              <X className="mr-2 h-4 w-4" />
              Reject {selectedCount}
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              disabled={selectionDisabled}
              onClick={() => reviewSelected("approved")}
            >
              {bulk.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Approve {selectedCount}
            </Button>
          </div>
        )}
      </div>
      {products.length === 0 ? (
        <div className="surface grid min-h-[420px] place-items-center border-l-4 border-l-violet-400 text-center">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <PackageSearch className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-xl font-semibold">
              No entries in this view
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Import a public company website or adjust the catalog filters.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {products.map(product => {
            const facts = structuredCatalogFacts(product);
            const sourceChanges = catalogRefreshChanges(product.provenance);
            const approvalAction = getCatalogApprovalAction(product.status);
            const approvalPending =
              review.isPending && review.variables?.productId === product.id;
            return (
              <article
                key={product.id}
                className={`surface overflow-hidden border-l-4 ${product.status === "approved" ? "border-l-emerald-500" : product.status === "rejected" ? "border-l-rose-400" : "border-l-amber-400"}`}
              >
                <div className="flex gap-4 p-5">
                  <Checkbox
                    aria-label={`Select ${product.name}`}
                    checked={allMatching || selectedIds.includes(product.id)}
                    disabled={selectionDisabled}
                    onCheckedChange={checked => {
                      const current = allMatching ? visibleIds : selectedIds;
                      setAllMatching(false);
                      setSelected(
                        checked === true
                          ? Array.from(new Set([...current, product.id]))
                          : current.filter(id => id !== product.id)
                      );
                    }}
                  />
                  <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-muted">
                    {product.images[0] ? (
                      <img
                        src={product.images[0].url}
                        alt={product.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <PackageSearch className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="line-clamp-2 font-semibold leading-tight">
                          {product.name}
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {product.category || "Uncategorized"} ·{" "}
                          {offeringLabel(product)}
                          {product.variantCount > 1
                            ? ` · ${product.variantCount} variants`
                            : ""}
                        </p>
                      </div>
                      <StatusPill status={product.status} />
                    </div>
                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {product.description ||
                        "No product description was found."}
                    </p>
                  </div>
                </div>
                <div className="catalog-card-facts px-5 pb-4">
                  {product.provenance["api.detailUrl"] && (
                    <ApiProductDetails
                      organizationId={organizationId!}
                      productId={product.id}
                    />
                  )}
                  {sourceChanges && product.status === "pending" && (
                    <details className="mb-4 rounded-lg border border-amber-300 p-3">
                      <summary className="cursor-pointer font-medium">
                        Review source changes ·{" "}
                        {Object.keys(sourceChanges.after).length} fields
                      </summary>
                      <p className="my-2 text-xs text-muted-foreground">
                        Updated{" "}
                        {new Date(
                          sourceChanges.observedAt
                        ).toLocaleDateString()}
                        . Manual corrections are preserved. Approve this product
                        after reviewing the updated facts.
                      </p>
                      {Object.entries(sourceChanges.after).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className="border-t py-2 text-xs break-words"
                          >
                            <strong className="capitalize">{key}</strong>
                            <p>
                              Before:{" "}
                              {typeof sourceChanges.before[key] === "object"
                                ? Object.entries(
                                    sourceChanges.before[key] ?? {}
                                  )
                                    .map(([name, value]) => `${name}: ${value}`)
                                    .join("; ")
                                : String(
                                    sourceChanges.before[key] ?? "Not supplied"
                                  )}
                            </p>
                            <p>
                              Updated:{" "}
                              {typeof value === "object"
                                ? Object.entries(value ?? {})
                                    .map(
                                      ([name, detail]) => `${name}: ${detail}`
                                    )
                                    .join("; ")
                                : String(value ?? "Not supplied")}
                            </p>
                          </div>
                        )
                      )}
                    </details>
                  )}
                  <dl>
                    <div>
                      <dt>Price</dt>
                      <dd>
                        {product.price
                          ? `${product.currency || ""} ${product.price}`
                          : "Not supplied"}
                      </dd>
                    </div>
                    <div>
                      <dt>Availability</dt>
                      <dd>{availabilityLabel(facts.availability)}</dd>
                    </div>
                  </dl>
                  {!!Object.keys(facts.specifications).length && (
                    <>
                      <h3>Specifications</h3>
                      <ul>
                        {Object.entries(facts.specifications)
                          .slice(0, 4)
                          .map(([key, value]) => (
                            <li key={key}>
                              <strong>{key}:</strong> {value}
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                  {!!facts.features.length && (
                    <>
                      <h3>Features</h3>
                      <ul>
                        {facts.features.slice(0, 2).map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div className="border-t hairline px-5 py-4">
                  <div className="mb-4 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {Object.keys(facts.specifications).length} specifications
                      {product.variants.length
                        ? ` · ${product.variants.length} variant records`
                        : ""}
                    </span>
                    <a
                      href={product.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary"
                    >
                      Source
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulk.isPending}
                      onClick={() => beginEdit(product)}
                    >
                      <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulk.isPending || remove.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${product.name} from the catalog?`
                          )
                        )
                          remove.mutate({
                            organizationId: organizationId!,
                            productId: product.id,
                          });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !canReview || bulk.isPending || review.isPending
                      }
                      onClick={() =>
                        review.mutate({
                          organizationId: organizationId!,
                          productId: product.id,
                          decision: "rejected",
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        product.status === "approved" ? "outline" : "default"
                      }
                      className={`flex-1 ${approvalAction.className}`}
                      disabled={
                        !canReview || review.isPending || bulk.isPending
                      }
                      aria-label={`${approvalAction.label} ${product.name}`}
                      onClick={() =>
                        review.mutate({
                          organizationId: organizationId!,
                          productId: product.id,
                          decision: approvalAction.decision,
                        })
                      }
                    >
                      {approvalPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : product.status === "approved" ? (
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {approvalAction.label}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className="my-6 flex items-center justify-between">
        <Button
          variant="outline"
          disabled={offset === 0 || bulk.isPending || query.isFetching}
          onClick={() => {
            setOffset(Math.max(0, offset - 60));
            clearSelection();
          }}
        >
          Previous
        </Button>
        <span className="text-sm">
          {query.data?.total ? offset + 1 : 0}–{offset + products.length} of{" "}
          {query.data?.total ?? 0}
        </span>
        <Button
          variant="outline"
          disabled={!query.data?.hasMore || bulk.isPending || query.isFetching}
          onClick={() => {
            setOffset(offset + 60);
            clearSelection();
          }}
        >
          Next
        </Button>
      </div>
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold">
              Review product details
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-3 sm:grid-cols-2">
              <div className="sm:col-span-2 rounded-2xl bg-muted/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">
                  {editing.recordType} · {editing.variants.length} source
                  variants
                </p>
                {editing.variants.length > 0 && (
                  <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                    {editing.variants.map(variant => (
                      <div
                        key={variant.id}
                        className="grid gap-1 rounded-xl bg-background p-3 text-xs sm:grid-cols-[1fr_auto]"
                      >
                        <div>
                          <p className="font-semibold">{variant.name}</p>
                          <p className="mt-1 text-muted-foreground">
                            {variant.sku || "No SKU"}
                            {variant.availability
                              ? ` · ${variant.availability}`
                              : ""}
                          </p>
                        </div>
                        <p className="font-semibold">
                          {variant.price
                            ? `${variant.currency || ""} ${variant.price}`.trim()
                            : "No price"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                  className="mt-2 min-h-28"
                  value={editing.description}
                  onChange={event =>
                    setEditing({ ...editing, description: event.target.value })
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
                <Label>Source URL</Label>
                <Input
                  className="mt-2"
                  value={editing.productUrl}
                  onChange={event =>
                    setEditing({ ...editing, productUrl: event.target.value })
                  }
                />
              </div>
              {editing.serviceDetails && (
                <div className="sm:col-span-2 grid gap-3 rounded-xl bg-muted p-4 sm:grid-cols-2">
                  {(
                    [
                      "offeringType",
                      "audience",
                      "billingPeriod",
                      "trial",
                      "benefits",
                      "ownership",
                      "pricing",
                      "duration",
                      "area",
                      "delivery",
                      "packages",
                      "cta",
                    ] as const
                  ).map(key => (
                    <div key={key}>
                      <Label htmlFor={"edit-service-" + key}>
                        {key === "cta" ? "Call to action" : key}
                      </Label>
                      {[
                        "pricing",
                        "delivery",
                        "cta",
                        "offeringType",
                        "ownership",
                        "billingPeriod",
                      ].includes(key) ? (
                        <VisualSelect
                          id={"edit-service-" + key}
                          className="w-full rounded-lg border p-2"
                          value={editing.serviceDetails![key] ?? ""}
                          onChange={e =>
                            setEditing({
                              ...editing,
                              serviceDetails: {
                                ...editing.serviceDetails!,
                                [key]: e.target.value,
                              } as Editable["serviceDetails"],
                            })
                          }
                        >
                          {(key === "offeringType"
                            ? [
                                "service",
                                "subscription",
                                "membership",
                                "platform",
                                "directory_category",
                                "directory_listing",
                                "free_offer",
                              ]
                            : key === "ownership"
                              ? ["own", "third_party"]
                              : key === "billingPeriod"
                                ? ["none", "monthly", "annual", "other"]
                                : key === "pricing"
                                  ? [
                                      "fixed",
                                      "starting_at",
                                      "hourly",
                                      "recurring",
                                      "quote",
                                    ]
                                  : key === "delivery"
                                    ? ["onsite", "remote", "both"]
                                    : [
                                        "Book now",
                                        "Get a quote",
                                        "Contact us",
                                        "Learn more",
                                        "Sign up",
                                        "Start trial",
                                        "Claim listing",
                                        "Explore directory",
                                      ]
                          ).map(v => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </VisualSelect>
                      ) : (
                        <Input
                          id={"edit-service-" + key}
                          value={editing.serviceDetails![key] ?? ""}
                          onChange={e =>
                            setEditing({
                              ...editing,
                              serviceDetails: {
                                ...editing.serviceDetails!,
                                [key]: e.target.value,
                              },
                            })
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="sm:col-span-2">
                <CatalogFactsFields
                  specifications={editing.specifications}
                  features={editing.features}
                  availability={editing.availability}
                  onChange={patch => setEditing({ ...editing, ...patch })}
                />
              </div>
              <Button
                className="sm:col-span-2"
                onClick={save}
                disabled={
                  !editing.name || !editing.productUrl || update.isPending
                }
              >
                Save changes for review
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CatalogPage() {
  return (
    <WorkspaceGate>
      <CatalogContent />
    </WorkspaceGate>
  );
}
