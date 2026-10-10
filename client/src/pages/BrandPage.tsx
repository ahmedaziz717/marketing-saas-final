import { BrandWebsiteScanner } from "@/components/BrandWebsiteScanner";
import { useEffect, useRef, useState } from "react";
import { Check, FolderOpen, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";

export function BrandContent({ embedded = false }: { embedded?: boolean }) {
  const { organizationId, membership } = useWorkspace();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [showScanner, setShowScanner] = useState(false);
  const [websiteLogoUrls, setWebsiteLogoUrls] = useState<string[]>([]);
  const [scanApplied, setScanApplied] = useState(false);
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = false;
    setShowScanner(false);
    setWebsiteLogoUrls([]);
    setScanApplied(false);
  }, [organizationId]);
  const kit = trpc.brand.get.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId, refetchOnWindowFocus: false }
  );
  const library = trpc.assetLibrary.list.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId && !embedded }
  );
  const sources = (library.data ?? []).filter(
    asset => asset.purpose === "source"
  );
  const canManage = ["owner", "admin"].includes(membership?.role ?? "");
  const [form, setForm] = useState({
    name: "",
    colors: "",
    fonts: "",
    voice: "",
    requiredClaims: "",
    prohibitedContent: "",
  });
  useEffect(() => {
    if (kit.data && !dirty.current)
      setForm({
        name: kit.data.name,
        colors: kit.data.colors.join(", "),
        fonts: kit.data.fonts.join(", "),
        voice: kit.data.voice ?? "",
        requiredClaims: kit.data.requiredClaims ?? "",
        prohibitedContent: kit.data.prohibitedContent ?? "",
      });
  }, [kit.data]);
  const update = trpc.brand.update.useMutation({
    onSuccess: async result => {
      dirty.current = false;
      await Promise.all([
        utils.brand.get.invalidate(),
        utils.brand.assets.invalidate(),
        utils.assetLibrary.list.invalidate(),
      ]);
      setWebsiteLogoUrls(result.failedLogoUrls);
      setScanApplied(result.failedLogoUrls.length > 0);
      toast.success(
        result.importedLogos
          ? `Brand kit saved. ${result.importedLogos} logo(s) imported for review in Asset Library.`
          : "Brand kit updated"
      );
      if (result.failedLogoUrls.length)
        toast.error(
          "Brand details were saved, but some logos could not be imported. Retry saving or use Upload logo in Company & brand."
        );
    },
    onError: error => toast.error(error.message),
  });
  const save = (activate: boolean) =>
    update.mutate({
      organizationId: organizationId!,
      name: form.name,
      colors: form.colors
        .split(",")
        .map(value => value.trim())
        .filter(Boolean),
      fonts: form.fonts
        .split(",")
        .map(value => value.trim())
        .filter(Boolean),
      voice: form.voice,
      requiredClaims: form.requiredClaims,
      prohibitedContent: form.prohibitedContent,
      activate,
      websiteLogoUrls,
    });
  const openLibrary = () => navigate("/app/library");

  return (
    <>
      {embedded ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Brand identity</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Colors, typography, voice, and rules for your creative content.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <Button
                variant="outline"
                disabled={update.isPending}
                onClick={() => setShowScanner(value => !value)}
              >
                <ScanSearch className="mr-2 h-4 w-4" />
                Scan website
              </Button>
            )}
            {kit.data && <StatusPill status={kit.data.status} />}
          </div>
        </div>
      ) : (
        <PageHeader
          eyebrow="Brand source of truth"
          title="Brand kit"
          description="Define your identity and brand rules. Source assets are uploaded and reviewed in the shared Asset Library."
          action={
            <div className="flex gap-2">
              {canManage && (
                <Button
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() => setShowScanner(value => !value)}
                >
                  <ScanSearch className="mr-2 h-4 w-4" />
                  Scan website
                </Button>
              )}
              {kit.data && <StatusPill status={kit.data.status} />}
            </div>
          }
        />
      )}
      {showScanner && canManage && (
        <BrandWebsiteScanner
          organizationId={organizationId!}
          website={kit.data?.businessProfile?.website || ""}
          onClose={() => setShowScanner(false)}
          onApply={brand => {
            dirty.current = true;
            setForm(current => ({
              ...current,
              name: brand.name || current.name,
              colors: brand.colors.length
                ? brand.colors.join(", ")
                : current.colors,
              fonts: brand.fonts.length
                ? brand.fonts.join(", ")
                : current.fonts,
              voice: brand.voice || current.voice,
            }));
            setWebsiteLogoUrls(brand.logoUrls);
            setScanApplied(true);
            setShowScanner(false);
            toast.info(
              "Review the suggested details, then save your brand kit."
            );
          }}
        />
      )}
      {scanApplied && (
        <div className="surface mb-6 p-5" role="status">
          <p className="font-medium">Scanned details are ready for review</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Edit the fields below, then save.{" "}
            {websiteLogoUrls.length
              ? `${websiteLogoUrls.length} selected logo(s) will be imported into Asset Library for approval.`
              : "No new logos selected."}
          </p>
          {!!websiteLogoUrls.length && (
            <div className="mt-3 flex flex-wrap gap-3">
              {websiteLogoUrls.map(url => (
                <div key={url} className="rounded-lg border p-2">
                  <img
                    src={url}
                    alt="Selected website logo"
                    className="h-16 max-w-40 object-contain"
                    referrerPolicy="no-referrer"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setWebsiteLogoUrls(current =>
                        current.filter(u => u !== url)
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Tabs defaultValue="kit">
        {!embedded && (
          <TabsList className="mb-6">
            <TabsTrigger value="kit">Brand kit</TabsTrigger>
            <TabsTrigger value="assets">Source assets</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="kit">
          {kit.isLoading ? (
            <p role="status" className="surface p-8">
              Loading your brand kit...
            </p>
          ) : kit.error ? (
            <div role="alert" className="surface p-8">
              <p>Your brand kit could not be loaded.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => kit.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <section className="surface p-6 md:p-8">
              {!canManage && (
                <p className="mb-5 text-sm text-muted-foreground">
                  Only workspace owners and administrators can change brand
                  rules.
                </p>
              )}
              <fieldset
                onChange={() => {
                  dirty.current = true;
                }}
                disabled={!canManage || update.isPending}
                className="grid gap-6 md:grid-cols-2"
              >
                <div>
                  <Label htmlFor="brand-name">Brand name</Label>
                  <Input
                    id="brand-name"
                    className="mt-2"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="brand-colors">Color palette</Label>
                  <Input
                    id="brand-colors"
                    className="mt-2"
                    value={form.colors}
                    onChange={e => setForm({ ...form, colors: e.target.value })}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Array.from(
                      new Set(
                        form.colors
                          .split(",")
                          .map(color => color.trim())
                          .filter(color => /^#[0-9a-f]{6}$/i.test(color))
                      )
                    ).map(color => (
                      <span
                        key={color}
                        className="h-7 w-7 rounded-full border"
                        style={{ background: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="brand-fonts">Fonts</Label>
                  <Input
                    id="brand-fonts"
                    className="mt-2"
                    value={form.fonts}
                    onChange={e => setForm({ ...form, fonts: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="brand-voice">Brand voice</Label>
                  <Textarea
                    id="brand-voice"
                    className="mt-2 min-h-28"
                    value={form.voice}
                    onChange={e => setForm({ ...form, voice: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="brand-claims">Required claims</Label>
                  <Textarea
                    id="brand-claims"
                    className="mt-2 min-h-36"
                    value={form.requiredClaims}
                    onChange={e =>
                      setForm({ ...form, requiredClaims: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="brand-prohibited">Prohibited content</Label>
                  <Textarea
                    id="brand-prohibited"
                    className="mt-2 min-h-36"
                    value={form.prohibitedContent}
                    onChange={e =>
                      setForm({ ...form, prohibitedContent: e.target.value })
                    }
                  />
                </div>
              </fieldset>
              {canManage && (
                <div className="mt-7 flex gap-3">
                  <Button
                    variant="outline"
                    disabled={update.isPending}
                    onClick={() => save(false)}
                  >
                    Save draft
                  </Button>
                  <Button
                    disabled={update.isPending}
                    onClick={() => save(true)}
                  >
                    Save & activate
                    <Check className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </section>
          )}
        </TabsContent>
        <TabsContent value="assets">
          <section className="surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Brand & product source assets
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  One library, one review history. Upload, submit, approve,
                  reject, and manage versions in Asset Library; no separate
                  approval queue is kept here.
                </p>
              </div>
              <Button onClick={openLibrary}>
                <FolderOpen className="mr-2 h-4 w-4" />
                Open Asset Library
              </Button>
            </div>
            {library.isLoading ? (
              <p className="mt-6" role="status">
                Loading source assets...
              </p>
            ) : library.error ? (
              <div role="alert" className="mt-6">
                <p>Source assets could not be loaded.</p>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => library.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : !sources.length ? (
              <p className="mt-6 rounded-xl bg-muted p-6 text-sm text-muted-foreground">
                Upload a logo, product photo, or reference in Asset Library and
                select Source material.
              </p>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sources.map(asset => (
                  <button
                    key={asset.key}
                    className="overflow-hidden rounded-2xl border bg-background text-left hover:border-primary focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() =>
                      navigate(
                        `/app/library?asset=${encodeURIComponent(asset.key)}`
                      )
                    }
                  >
                    <div className="grid h-40 place-items-center bg-muted/50 p-4">
                      {asset.mediaType === "image" ? (
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="max-h-full max-w-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <FolderOpen className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="p-4">
                      <p className="truncate font-medium">{asset.name}</p>
                      <p className="mt-2 text-xs capitalize text-muted-foreground">
                        {asset.state.replaceAll("_", " ")}
                      </p>
                      <p className="mt-2 text-xs text-primary">
                        View and review in library
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function BrandPage() {
  return (
    <WorkspaceGate>
      <BrandContent />
    </WorkspaceGate>
  );
}
