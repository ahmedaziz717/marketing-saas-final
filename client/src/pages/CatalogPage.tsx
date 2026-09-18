import { CatalogSources } from "@/components/CatalogSources";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { getCatalogApprovalAction } from "./catalogReviewState";

type Editable = {
  serviceDetails: {
    pricing: "fixed" | "starting_at" | "hourly" | "recurring" | "quote";
    duration: string;
    area: string;
    delivery: "onsite" | "remote" | "both";
    packages: string;
    cta: "Book now" | "Get a quote" | "Contact us" | "Learn more";
  } | null;
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
  const { organizationId } = useWorkspace();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState("products");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [offset, setOffset] = useState(0);
  const query = trpc.catalog.overview.useQuery(
    {
      organizationId: organizationId!,
      offset,
      search,
      status: status as "all" | "pending" | "approved" | "rejected",
      category,
      kind: tab === "services" ? "services" : "products",
    },
    { enabled: !!organizationId }
  );
  const [selected, setSelected] = useState<number[]>([]);
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
    onSuccess: async result => {
      setSelected([]);
      await refresh();
      toast.success(`${result.updated} products updated`);
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
    return (query.data?.products ?? [])
      .filter(
        product =>
          (tab === "services"
            ? product.recordType === "service"
            : product.recordType !== "service") &&
          (status === "all" || product.status === status) &&
          (category === "all" || product.category === category) &&
          `${product.name} ${product.sku ?? ""} ${product.category ?? ""} ${product.recordType}`
            .toLowerCase()
            .includes(search.toLowerCase())
      )
      .sort(
        (a, b) =>
          (categoryPriority[a.category ?? ""] ?? 20) -
            (categoryPriority[b.category ?? ""] ?? 20) ||
          (typePriority[a.recordType] ?? 20) -
            (typePriority[b.recordType] ?? 20) ||
          a.name.localeCompare(b.name)
      );
  }, [query.data?.products, search, status, category, tab]);
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
    [query.data?.products]
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
      specifications: Object.entries(product.specifications)
        .map(([name, value]) => `${name}: ${value}`)
        .join("\n"),
      variants: product.variants,
    });
  const save = () => {
    if (!editing) return;
    const specifications = Object.fromEntries(
      editing.specifications
        .split("\n")
        .map(line => line.split(":"))
        .filter(parts => parts[0]?.trim() && parts.slice(1).join(":").trim())
        .map(parts => [parts[0]!.trim(), parts.slice(1).join(":").trim()])
    );
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
      },
    });
  };

  const tabs = (
    <div className="mb-6 flex gap-2 border-b pb-4">
      {["products", "services", "sources"].map(t => (
        <Button
          key={t}
          variant={tab === t ? "default" : "ghost"}
          className="rounded-full capitalize"
          onClick={() => {
            setTab(t);
            setSelected([]);
            setOffset(0);
          }}
        >
          {t}
        </Button>
      ))}
    </div>
  );
  if (tab === "sources")
    return (
      <>
        <PageHeader
          eyebrow="Catalog"
          title="Catalog sources"
          description="Scan a website, connect a store, or add your own products and services."
        />
        {tabs}
        <CatalogSources organizationId={organizationId!} />
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow="Approved product truth"
        title="Catalog"
        description="Your products and services, connected to every creative. Review facts and approve what your team can use."
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setTab("sources")}>
              Add source or item
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={cleanup.isPending}
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
              onClick={() => setLocation("/app/import")}
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
          onChange={event => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          placeholder="Search products, SKUs, or categories…"
        />
        <Select
          value={status}
          onValueChange={v => {
            setStatus(v);
            setOffset(0);
          }}
        >
          <SelectTrigger className="h-11 w-full xl:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={v => {
            setCategory(v);
            setOffset(0);
          }}
        >
          <SelectTrigger className="h-11 w-full xl:w-52">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(item => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {selected.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                bulk.mutate({
                  organizationId: organizationId!,
                  productIds: selected,
                  decision: "rejected",
                })
              }
            >
              <X className="mr-2 h-4 w-4" />
              Reject {selected.length}
            </Button>
            <Button
              onClick={() =>
                bulk.mutate({
                  organizationId: organizationId!,
                  productIds: selected,
                  decision: "approved",
                })
              }
            >
              <Check className="mr-2 h-4 w-4" />
              Approve {selected.length}
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
                    checked={selected.includes(product.id)}
                    onCheckedChange={() =>
                      setSelected(
                        selected.includes(product.id)
                          ? selected.filter(id => id !== product.id)
                          : [...selected, product.id]
                      )
                    }
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
                          {product.recordType.replaceAll("_", " ")}
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
                <div className="border-t hairline px-5 py-4">
                  <div className="mb-4 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {Object.keys(product.specifications).length}{" "}
                      specifications
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
                      onClick={() => beginEdit(product)}
                    >
                      <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
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
                      disabled={review.isPending}
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
          disabled={offset === 0}
          onClick={() => {
            setOffset(Math.max(0, offset - 60));
            setSelected([]);
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
          disabled={!query.data?.hasMore}
          onClick={() => {
            setOffset(offset + 60);
            setSelected([]);
          }}
        >
          Next
        </Button>
      </div>
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-editorial text-4xl font-normal">
              Review product truth
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
                      {["pricing", "delivery", "cta"].includes(key) ? (
                        <select
                          id={"edit-service-" + key}
                          className="w-full rounded-lg border p-2"
                          value={editing.serviceDetails![key]}
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
                          {(key === "pricing"
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
                                ]
                          ).map(v => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          id={"edit-service-" + key}
                          value={editing.serviceDetails![key]}
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
                <Label>
                  Specifications{" "}
                  <span className="text-muted-foreground">
                    (Name: value, one per line)
                  </span>
                </Label>
                <Textarea
                  className="mt-2 min-h-48 font-mono text-xs"
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
