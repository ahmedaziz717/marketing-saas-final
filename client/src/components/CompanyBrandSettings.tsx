import { useEffect, useRef, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { BusinessProfileForm } from "@/components/BusinessProfileForm";
import { BrandContent } from "@/pages/BrandPage";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { libraryAssetLink } from "@shared/assetWorkflow";

export function CompanyBrandSettings() {
  const { organizationId, organization, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const search = useSearch();
  const tab =
    new URLSearchParams(search).get("tab") === "brand" ? "brand" : "profile";
  const canManage = ["owner", "admin"].includes(membership?.role ?? "");
  const [name, setName] = useState(organization?.name ?? "");
  const [selectedLogo, setSelectedLogo] = useState<number | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setName(organization?.name ?? "");
  }, [organizationId, organization?.name]);
  useEffect(() => {
    setSelectedLogo(null);
  }, [organizationId]);
  const assets = trpc.brand.assets.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const logos = (assets.data ?? []).filter(
    asset => asset.type === "logo" && asset.status !== "rejected"
  );
  const logo =
    logos.find(asset => asset.id === selectedLogo) ??
    logos.find(asset => asset.status === "approved") ??
    logos[0];
  const rename = trpc.workspace.rename.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.workspace.mine.invalidate(),
        utils.workspace.current.invalidate(),
        utils.activity.list.invalidate(),
      ]);
      toast.success("Workspace name saved");
    },
    onError: error => toast.error(error.message),
  });
  const upload = trpc.brand.uploadAsset.useMutation({
    onSuccess: async result => {
      setSelectedLogo(result.assetId);
      await Promise.all([
        utils.brand.assets.invalidate(),
        utils.assetLibrary.list.invalidate(),
      ]);
      toast.success(
        "Logo uploaded. Review it in Library before using it in content."
      );
    },
    onError: error => toast.error(error.message),
  });
  async function uploadLogo(file?: File) {
    if (!file || !organizationId || !canManage) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Choose a PNG, JPG, or WebP logo.");
      return;
    }
    if (!file.size || file.size > 8 * 1024 * 1024) {
      toast.error("Choose a logo smaller than 8 MB.");
      return;
    }
    setReadingFile(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () =>
          reject(new Error("This file could not be read. Please try again."));
        reader.readAsDataURL(file);
      });
      upload.mutate({
        organizationId,
        name: file.name.slice(0, 180).padEnd(2, "_"),
        type: "logo",
        mimeType: file.type,
        base64,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to read logo"
      );
    } finally {
      setReadingFile(false);
    }
  }
  return (
    <>
      <section
        className="surface p-6 md:p-8"
        aria-labelledby="company-brand-title"
      >
        <h2 id="company-brand-title" className="text-xl font-semibold">
          Company & brand
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Keep your workspace identity, business profile, and creative
          guidelines together.
        </p>
        <div className="mt-6 grid gap-8 md:grid-cols-[176px_minmax(0,1fr)]">
          <div>
            <p className="mb-3 text-sm font-medium">Company logo</p>
            <div className="flex h-32 w-40 items-center justify-center rounded-2xl border bg-muted/40 p-4">
              {logo ? (
                <img
                  src={logo.url}
                  alt={logo.name}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <ImagePlus
                  className="h-9 w-9 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </div>
            {logo && (
              <div className="mt-2">
                <StatusPill status={logo.status} />
              </div>
            )}
            {assets.isLoading && (
              <p className="mt-2 text-xs text-muted-foreground" role="status">
                Loading logos…
              </p>
            )}
            {assets.error && (
              <button
                className="mt-2 text-sm text-destructive underline"
                onClick={() => assets.refetch()}
              >
                Unable to load logos. Retry
              </button>
            )}
            {logos.length > 1 && (
              <div
                className="mt-3 flex max-w-44 gap-2 overflow-x-auto pb-1"
                aria-label="Company logos"
              >
                {logos.map(asset => (
                  <button
                    key={asset.id}
                    type="button"
                    aria-label={`Preview ${asset.name}`}
                    aria-pressed={logo?.id === asset.id}
                    onClick={() => setSelectedLogo(asset.id)}
                    className={`h-10 w-10 shrink-0 rounded-lg border p-1 ${logo?.id === asset.id ? "border-primary ring-1 ring-primary" : "bg-muted/30"}`}
                  >
                    <img
                      src={asset.url}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  </button>
                ))}
              </div>
            )}
            {canManage && (
              <>
                <input
                  ref={fileInput}
                  aria-label="Upload company logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={upload.isPending || readingFile}
                  onChange={event => {
                    void uploadLogo(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  disabled={upload.isPending || readingFile}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={14} className="mr-2" />
                  {upload.isPending || readingFile
                    ? "Uploading…"
                    : "Upload logo"}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  PNG, JPG, WebP · up to 8 MB
                </p>
              </>
            )}
          </div>
          <div className="min-w-0">
            <form
              onSubmit={event => {
                event.preventDefault();
                if (canManage)
                  rename.mutate({
                    organizationId: organizationId!,
                    name: name.trim(),
                  });
              }}
            >
              <Label htmlFor="workspace-name">Workspace name</Label>
              <div className="mt-2 flex flex-col items-start gap-3 sm:flex-row">
                <Input
                  id="workspace-name"
                  value={name}
                  minLength={2}
                  maxLength={160}
                  required
                  disabled={!canManage || rename.isPending}
                  onChange={event => setName(event.target.value)}
                  className="max-w-lg"
                />
                {canManage && (
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={
                      rename.isPending ||
                      name.trim().length < 2 ||
                      name.trim() === organization?.name
                    }
                  >
                    {rename.isPending ? "Saving…" : "Save name"}
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Shown in your workspace switcher and team settings.
              </p>
            </form>
            <div className="mt-6 rounded-xl bg-muted/50 p-4 text-sm">
              <p>
                Logos are shared with your creative library. Uploaded and
                scanned logos need approval before they can be used in content.
              </p>
              <Link
                href={`~${logo ? libraryAssetLink(`asset:${logo.id}`, logo.status === "approved" ? "approved" : "needs_review") : "/app/library?view=needs_review"}&type=source`}
                className="mt-2 inline-flex font-medium text-primary underline"
              >
                Manage logos in Library ↗
              </Link>
            </div>
            {!canManage && (
              <p className="mt-4 text-sm text-muted-foreground">
                Only workspace owners and administrators can edit company and
                brand settings.
              </p>
            )}
          </div>
        </div>
      </section>
      <Tabs
        value={tab}
        onValueChange={value =>
          navigate(
            `/app/brand${value === "brand" ? "?tab=brand" : ""}`
          )
        }
      >
        <TabsList className="mb-4" aria-label="Company and brand details">
          <TabsTrigger value="profile">Business profile</TabsTrigger>
          <TabsTrigger value="brand">Brand identity</TabsTrigger>
        </TabsList>
        <TabsContent
          value="profile"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <div className="surface p-6 md:p-8">
            <BusinessProfileForm
              organizationId={organizationId!}
              disabled={!canManage}
            />
          </div>
        </TabsContent>
        <TabsContent
          value="brand"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <BrandContent embedded />
        </TabsContent>
      </Tabs>
    </>
  );
}
