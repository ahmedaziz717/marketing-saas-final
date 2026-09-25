import { PartnerLogo } from "./PartnerLogo";
import { useState } from "react";
import { Link } from "wouter";
import { Globe, Upload, RefreshCw, Plus, Plug } from "lucide-react";
import { toast } from "sonner";
import { STORE_PROVIDERS, type StoreProvider } from "@shared/catalog";
import { parseCatalogCsv } from "@shared/catalogCsv";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { CatalogEntryForm } from "./CatalogEntryForm";
const names = {
  shopify: "Shopify",
  bigcommerce: "BigCommerce",
  woocommerce: "WooCommerce",
};
export function CatalogSources({
  organizationId,
  storesOnly = false,
  search = "",
}: {
  organizationId: number;
  storesOnly?: boolean;
  search?: string;
}) {
  const utils = trpc.useUtils();
  const query = trpc.catalogSources.list.useQuery(
    { organizationId },
    { refetchInterval: 5000 }
  );
  const website = trpc.crawl.latest.useQuery(
    { organizationId },
    { enabled: !storesOnly, refetchInterval: storesOnly ? false : 5000 }
  );
  const catalog = trpc.catalog.overview.useQuery(
    { organizationId },
    { enabled: !storesOnly, refetchInterval: storesOnly ? false : 5000 }
  );
  const [provider, setProvider] = useState<StoreProvider | null>(null);
  const [address, setAddress] = useState("");
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [manual, setManual] = useState(false);
  const [csvProgress, setCsvProgress] = useState<number | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const refresh = async () => {
    await Promise.all([
      utils.catalogSources.list.invalidate(),
      utils.catalog.overview.invalidate(),
    ]);
  };
  const connect = trpc.catalogSources.connect.useMutation({
    onSuccess: () => {
      setProvider(null);
      setToken("");
      setSecret("");
      void refresh();
      toast.success("Connected. Catalog import queued.");
    },
    onError: e => toast.error(e.message),
  });
  const action = trpc.catalogSources.action.useMutation({
    onSuccess: () => {
      void refresh();
    },
    onError: e => toast.error(e.message),
  });
  const add = trpc.catalogSources.addEntries.useMutation();
  const upload = async (file: File) => {
    try {
      setCsvErrors([]);
      const rows = parseCatalogCsv(await file.text());
      if (!rows.length) throw new Error("CSV is empty.");
      setCsvProgress(0);
      const failures: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const result = await add.mutateAsync({
          organizationId,
          entries: [rows[i]],
        });
        if (result[0]?.error) failures.push(`Row ${i + 2}: ${result[0].error}`);
        setCsvProgress(Math.round(((i + 1) / rows.length) * 100));
      }
      setCsvErrors(failures);
      await refresh();
      toast.success(
        `${rows.length - failures.length} entries imported for review`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setCsvProgress(null);
    }
  };
  return (
    <div className="space-y-6">
      {!storesOnly && (
        <>
          <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">
                Total catalog · All imports and sources
              </p>
              <p className="mt-1 text-3xl font-semibold">
                {catalog.data ? catalog.data.total.toLocaleString() : "…"}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  products and services
                </span>
              </p>
            </div>
            <Link href="/app/catalog" className="text-sm text-primary">
              View catalog
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Link
              href="/app/import"
              className="surface p-6 hover:border-primary"
            >
              <Globe className="mb-4 text-primary" />
              <h3 className="font-semibold">Scan website</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Find products across public pages. Continues in the background.
              </p>
            </Link>
            <button
              className="surface p-6 text-left hover:border-primary"
              onClick={() => setManual(true)}
            >
              <Plus className="mb-4 text-primary" />
              <h3 className="font-semibold">Add product or service</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Describe what you sell, with accurate facts and images.
              </p>
            </button>
            <div className="surface p-6">
              <Upload className="mb-4 text-primary" />
              <Label htmlFor="catalog-csv" className="font-semibold">
                Import CSV
              </Label>
              <p className="my-2 text-sm text-muted-foreground">
                Required columns: name, productUrl. Optional: recordType
                (service or standalone), description, sku, price, currency,
                imageUrl, category, pricing, duration, area, delivery, packages,
                cta.
              </p>
              <Input
                id="catalog-csv"
                type="file"
                accept=".csv,text/csv"
                disabled={csvProgress !== null}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
              {csvProgress !== null && (
                <>
                  <Progress className="mt-3" value={csvProgress} />
                  <p className="text-xs">
                    {csvProgress}% · Keep this tab open for CSV upload
                  </p>
                </>
              )}
              {csvErrors.length > 0 && (
                <div
                  role="alert"
                  className="mt-3 max-h-32 overflow-auto text-xs text-red-700"
                >
                  {csvErrors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
          {website.data && (
            <div className="surface p-5">
              <h3 className="font-semibold">
                Latest website scan · {website.data.sourceOrigin}
              </h3>
              <p className="mt-2 text-sm">
                {["review_ready", "completed"].includes(website.data.status)
                  ? "Scan complete — results ready to review"
                  : website.data.status.replaceAll("_", " ")}{" "}
                · {website.data.pagesProcessed} / {website.data.pagesDiscovered}{" "}
                pages read in this scan
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Page counts describe this scan only. Your total catalog includes
                items saved across all scans and imports; a page may contain
                multiple products or none.
              </p>
              <Progress
                className="my-3"
                value={
                  website.data.pagesDiscovered
                    ? (website.data.pagesProcessed /
                        website.data.pagesDiscovered) *
                      100
                    : 0
                }
              />
              <Link href="/app/import" className="text-sm text-primary">
                View scan and progress
              </Link>
            </div>
          )}
        </>
      )}
      {!!query.data?.length && (
        <h3 className="text-xl font-semibold">Your store connections</h3>
      )}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data
        ?.filter(source =>
          (names[source.provider as StoreProvider] || source.provider)
            .toLowerCase()
            .includes(search.toLowerCase())
        )
        .map(source => (
          <div key={source.id} className="surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <PartnerLogo
                  slug={source.provider}
                  name={
                    names[source.provider as StoreProvider] || source.provider
                  }
                />
                <h4 className="mt-3 font-semibold">
                  {names[source.provider as StoreProvider] || source.provider}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {source.storeUrl}
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                {source.status}
              </span>
            </div>
            <p className="mt-3 text-sm">
              {source.processed}
              {source.total !== null ? ` of ${source.total}` : ""} products
              processed ·{" "}
              {source.lastSyncAt
                ? `Last sync ${new Date(source.lastSyncAt).toLocaleString()}`
                : "No completed sync yet"}
            </p>
            {["queued", "syncing"].includes(source.status) && (
              <Progress
                className="mt-3"
                value={
                  source.total
                    ? (source.processed / source.total) * 100
                    : undefined
                }
              />
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {source.autoSync
                ? "Automatic sync every 6 hours"
                : "Automatic sync off"}
            </p>
            {source.error && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {source.error}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {source.status !== "disconnected" && (
                <>
                  {["queued", "syncing"].includes(source.status) ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        action.mutate({
                          organizationId,
                          sourceId: source.id,
                          action: "pause",
                        })
                      }
                    >
                      Pause
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() =>
                        action.mutate({
                          organizationId,
                          sourceId: source.id,
                          action: ["paused", "error"].includes(source.status)
                            ? "resume"
                            : "sync",
                        })
                      }
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {["paused", "error"].includes(source.status)
                        ? "Resume sync"
                        : "Sync now"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      action.mutate({
                        organizationId,
                        sourceId: source.id,
                        action: source.autoSync
                          ? "automatic_off"
                          : "automatic_on",
                      })
                    }
                  >
                    {source.autoSync
                      ? "Turn auto-sync off"
                      : "Turn auto-sync on"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Disconnect this store? Imported items will remain in your catalog."
                        )
                      )
                        action.mutate({
                          organizationId,
                          sourceId: source.id,
                          action: "disconnect",
                        });
                    }}
                  >
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      <div className="grid gap-4 md:grid-cols-3">
        {STORE_PROVIDERS.filter(p =>
          names[p].toLowerCase().includes(search.toLowerCase())
        ).map(p => (
          <div key={p} className="surface p-6">
            <PartnerLogo slug={p} name={names[p]} />
            <h4 className="mt-4 font-semibold">{names[p]}</h4>
            <p className="my-3 text-sm text-muted-foreground">
              Import products, variants, pricing, and images using read-only
              store credentials.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setAddress("");
                setToken("");
                setSecret("");
                setProvider(p);
              }}
            >
              <Plug className="mr-2 h-4 w-4" />
              Connect {names[p]}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Planned next: Wix, Squarespace, and Square. Adobe Commerce and
        PrestaShop follow later. Booking and appointment integrations are a
        separate phase.
      </p>
      <Dialog
        open={!!provider}
        onOpenChange={v => {
          if (!v) {
            setProvider(null);
            setToken("");
            setSecret("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {provider ? names[provider] : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Use credentials with catalog read permissions. They are encrypted on
            the server. This connection never changes your store.
          </p>
          <Label htmlFor="store-address">
            {provider === "bigcommerce" ? "Store API address" : "Store URL"}
          </Label>
          <Input
            id="store-address"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder={
              provider === "shopify"
                ? "https://your-store.myshopify.com"
                : provider === "bigcommerce"
                  ? "https://api.bigcommerce.com/stores/STORE_HASH"
                  : "https://your-store.com"
            }
          />
          <Label htmlFor="store-token">
            {provider === "woocommerce"
              ? "Consumer key"
              : "Admin API access token"}
          </Label>
          <Input
            id="store-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={e => setToken(e.target.value)}
          />
          {provider === "woocommerce" && (
            <>
              <Label htmlFor="store-secret">Consumer secret</Label>
              <Input
                id="store-secret"
                type="password"
                autoComplete="off"
                value={secret}
                onChange={e => setSecret(e.target.value)}
              />
            </>
          )}
          <Button
            disabled={!address || !token || connect.isPending}
            onClick={() =>
              provider &&
              connect.mutate({
                organizationId,
                provider,
                storeUrl: address,
                token,
                secret,
              })
            }
          >
            {connect.isPending
              ? "Verifying connection…"
              : "Connect and import catalog"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={manual} onOpenChange={setManual}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a product or service</DialogTitle>
          </DialogHeader>
          <CatalogEntryForm
            organizationId={organizationId}
            onSaved={() => {
              setManual(false);
              void refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
