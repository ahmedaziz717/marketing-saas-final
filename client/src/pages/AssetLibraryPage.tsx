import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { FolderOpen, Upload, Search, Loader2, ExternalLink, RefreshCw, Image, Film } from "lucide-react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { ASSET_STATES, ASSET_VIEWS, assetMatchesView, assetStateLabel, canReviewAsset, canSubmitAsset, type AssetState, type AssetView, type LibraryAsset } from "@shared/assetLibrary";
import { toast } from "sonner";
const inputClass = "h-10 rounded-xl border bg-background px-3 text-sm";
const types = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"] as const;
type FileMime = (typeof types)[number];
async function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}
function State({ value }: { value: AssetState }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${value === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : value === "needs_review" ? "border-amber-200 bg-amber-50 text-amber-800" : value === "rejected" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-border bg-muted text-muted-foreground"}`}>{assetStateLabel(value)}</span>;
}
function Library() {
  const { organizationId, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const selectedKey = new URLSearchParams(searchParams).get("asset");
  const [view, setView] = useState<AssetView>("all");
  const [state, setState] = useState<AssetState | "all">("all");
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [parent, setParent] = useState<LibraryAsset | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [purpose, setPurpose] = useState<"source" | "finished">("finished");
  const [sourceType, setSourceType] = useState<"logo" | "product" | "reference" | "other">("other");
  const [isUgc, setIsUgc] = useState(false);
  const [rights, setRights] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const query = trpc.assetLibrary.list.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId });
  const assets = query.data ?? [];
  const selected = assets.find(asset => asset.key === selectedKey);
  const history = trpc.assetLibrary.history.useQuery({ organizationId: organizationId!, key: selectedKey ?? "asset:1" }, { enabled: !!organizationId && !!selected });
  const canCreate = ["owner", "admin", "creator"].includes(membership?.role ?? "");
  const canReview = ["owner", "admin", "reviewer"].includes(membership?.role ?? "");
  const visible = useMemo(() => assets.filter(asset => assetMatchesView(asset, view) && (state === "all" || asset.state === state) && `${asset.name} ${asset.headline ?? ""}`.toLowerCase().includes(search.toLowerCase())), [assets, view, state, search]);
  const reviewCount = assets.filter(asset => asset.state === "needs_review").length;
  const refresh = async () => Promise.all([utils.assetLibrary.list.invalidate(), utils.assetLibrary.history.invalidate(), utils.creatives.overview.invalidate(), utils.brand.assets.invalidate(), utils.meta.overview.invalidate(), utils.activity.list.invalidate()]);
  const fail = (error: { message: string }) => { toast.error(error.message); void refresh(); };
  const submit = trpc.assetLibrary.submit.useMutation({ onSuccess: async () => { await refresh(); toast.success("Submitted to the library review queue"); }, onError: fail });
  const review = trpc.assetLibrary.review.useMutation({ onSuccess: async () => { await refresh(); setNote(""); toast.success("Review decision saved for this asset version"); }, onError: fail });
  const comment = trpc.assetLibrary.comment.useMutation({ onSuccess: async () => { await refresh(); setNote(""); }, onError: fail });
  const upload = trpc.assetLibrary.upload.useMutation();
  const busy = submit.isPending || review.isPending || comment.isPending;
  const inspect = (key: string | null) => { setNote(""); navigate(key ? `/app/library?asset=${encodeURIComponent(key)}` : "/app/library"); };
  const openUpload = (previous: LibraryAsset | null = null) => {
    setParent(previous); setFiles([]); setPurpose(previous?.purpose ?? "finished"); setIsUgc(previous?.isUgc ?? false); setRights(false); setUploadProgress(""); setUploadOpen(true);
  };
  async function uploadFiles() {
    if (!organizationId || !files.length) return;
    setUploading(true);
    const failed: File[] = [];
    let lastKey: string | null = null;
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      setUploadProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      try {
        if (!types.includes(file.type as FileMime)) throw new Error("Use a JPEG, PNG, WebP, GIF, MP4, or WebM file.");
        const max = file.type.startsWith("video/") ? 20 : 12;
        if (file.size > max * 1024 * 1024) throw new Error(`Maximum size is ${max} MB.`);
        const result = await upload.mutateAsync({ organizationId, name: file.name.slice(0, 180), mimeType: file.type as FileMime, base64: await readFile(file), purpose, sourceType, isUgc, usagePermissionConfirmed: rights, parentKey: parent?.key });
        lastKey = result.key;
      } catch (error) { failed.push(file); toast.error(`${file.name}: ${error instanceof Error ? error.message : "Upload failed"}`); }
    }
    const saved = files.length - failed.length;
    setFiles(failed); setUploading(false); setUploadProgress(failed.length ? `${saved} saved as drafts. ${failed.length} could not be uploaded.` : "");
    await refresh();
    if (!failed.length) { setUploadOpen(false); if (lastKey) inspect(lastKey); }
    if (saved) toast.success(`${saved} asset${saved === 1 ? "" : "s"} saved as drafts. Submit when ready for review.`);
  }
  const decide = (decision: "approved" | "changes_requested" | "rejected") => {
    if (selected) review.mutate({ organizationId: organizationId!, key: selected.key, revision: selected.revision, decision, note });
  };
  return <>
    <PageHeader eyebrow="Shared content" title="Asset Library" description="Upload, organize, and review image, video, and creator assets. Content Studio results appear here automatically as drafts." action={canCreate ? <Button onClick={() => openUpload()}><Upload className="mr-2 h-4 w-4" />Upload assets</Button> : undefined} />
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Button variant={state === "needs_review" ? "default" : "outline"} onClick={() => { setState(state === "needs_review" ? "all" : "needs_review"); }}>Needs Review <span className="ml-2 rounded-full border px-2">{reviewCount}</span></Button>
      <Button variant="ghost" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
      <Link href="/app/creatives" className="ml-auto text-sm font-medium text-primary">Open Content Studio</Link>
    </div>
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Asset types" className="flex flex-wrap gap-2 lg:block lg:space-y-1">{ASSET_VIEWS.map(item => <button key={item.id} aria-current={view === item.id ? "page" : undefined} onClick={() => setView(item.id)} className={`rounded-xl px-4 py-3 text-left text-sm lg:w-full ${view === item.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}>{item.label}</button>)}</nav>
      <section className="min-w-0">
        <div className="mb-5 flex flex-wrap gap-3"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Search assets" placeholder="Search assets..." value={search} onChange={event => setSearch(event.target.value)} /></div><select className={inputClass} aria-label="Review status" value={state} onChange={event => setState(event.target.value as AssetState | "all")}><option value="all">All review statuses</option>{ASSET_STATES.map(value => <option key={value} value={value}>{assetStateLabel(value)}</option>)}</select></div>
        {query.isLoading ? <p role="status" className="surface p-8"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading your library...</p> : query.error ? <div role="alert" className="surface p-8"><p>The library could not be loaded. Your assets have not changed.</p><Button className="mt-4" variant="outline" onClick={() => query.refetch()}>Try again</Button></div> : !visible.length ? <div className="surface grid min-h-72 place-items-center p-8 text-center"><div><FolderOpen className="mx-auto h-9 w-9 text-primary" /><h2 className="mt-4 text-xl font-semibold">{assets.length ? "No matching assets" : "Your shared asset library"}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{assets.length ? "Change the asset type, review status, or search." : "Upload your first asset or create an image in Content Studio. Saving a draft does not approve or publish it."}</p>{canCreate && !assets.length && <Button className="mt-5" onClick={() => openUpload()}>Upload assets</Button>}</div></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(asset => <button key={asset.key} onClick={() => inspect(asset.key)} className="overflow-hidden rounded-2xl border bg-card text-left transition hover:border-primary focus-visible:ring-2 focus-visible:ring-primary"><div className="relative grid h-52 place-items-center bg-muted/50 p-3">{asset.mediaType === "image" ? <img src={asset.url} alt={asset.name} loading="lazy" className="max-h-full max-w-full object-contain" /> : asset.mediaType === "video" ? <Film className="h-12 w-12 text-muted-foreground" /> : <FolderOpen className="h-12 w-12 text-muted-foreground" />}<div className="absolute left-2 top-2"><State value={asset.state} /></div></div><div className="p-4"><p className="truncate font-medium">{asset.name}</p><p className="mt-2 text-xs text-muted-foreground">{asset.origin === "generated" ? "Created in Studio" : "Uploaded"}{asset.isUgc ? " / UGC" : ""} / {asset.purpose === "source" ? "Source material" : "Finished asset"}</p></div></button>)}</div>}
      </section>
    </div>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) inspect(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>{selected?.name ?? "Asset"}</DialogTitle><DialogDescription>Review this saved version. Asset approval does not approve a post, caption, schedule, or advertising spend.</DialogDescription></DialogHeader>{selected && <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]"><section className="min-w-0"><div className="grid min-h-52 place-items-center rounded-2xl bg-muted/50 p-4">{selected.mediaType === "video" ? <video key={selected.key} controls preload="metadata" src={selected.url} className="max-h-[50vh] w-full" /> : selected.mediaType === "image" ? <img src={selected.url} alt={selected.name} className="max-h-[50vh] max-w-full object-contain" /> : <Image className="h-12 w-12" />}</div>{selected.headline && <p className="mt-4 font-semibold">{selected.headline}</p>}{selected.primaryText && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{selected.primaryText}</p>}<a className="mt-4 inline-flex items-center text-sm text-primary" href={selected.url} target="_blank" rel="noreferrer">Open original<ExternalLink className="ml-2 h-4 w-4" /></a>{selected.parentKey && <Button variant="link" onClick={() => inspect(selected.parentKey)}>View previous version</Button>}<div className="mt-3 flex flex-wrap gap-2">{assets.filter(asset => asset.parentKey === selected.key).map(asset => <Button key={asset.key} variant="outline" size="sm" onClick={() => inspect(asset.key)}>New version: {asset.name}</Button>)}</div></section><section className="space-y-4"><State value={selected.state} /><p className="text-sm text-muted-foreground">{selected.purpose === "source" ? "Source material: approval allows use during creation, not direct publishing." : "Finished asset: approval makes this version available for a separate publishing review."}</p>{selected.reviewedAtMs && <p className="text-xs text-muted-foreground">Reviewed {new Date(selected.reviewedAtMs).toLocaleString()}</p>}{canCreate && canSubmitAsset(selected.state) && <Button className="w-full" disabled={busy} onClick={() => submit.mutate({ organizationId: organizationId!, key: selected.key, revision: selected.revision })}>Submit for review</Button>}{canCreate && <Button className="w-full" variant="outline" onClick={() => openUpload(selected)}>Upload a new version</Button>}<div><Label htmlFor="library-note">Review note</Label><textarea id="library-note" className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-sm" value={note} onChange={event => setNote(event.target.value)} maxLength={3000} placeholder="Add feedback or describe the changes needed..." /></div>{canReview && <div className="flex flex-wrap gap-2">{canReviewAsset(selected.state, "approved") && <Button disabled={busy} onClick={() => decide("approved")}>Approve</Button>}{canReviewAsset(selected.state, "changes_requested") && <Button variant="outline" disabled={busy || !note.trim()} onClick={() => decide("changes_requested")}>Request changes</Button>}{canReviewAsset(selected.state, "rejected") && <Button variant="outline" disabled={busy} onClick={() => decide("rejected")}>Reject</Button>}</div>}<Button size="sm" variant="ghost" disabled={busy || !note.trim()} onClick={() => comment.mutate({ organizationId: organizationId!, key: selected.key, revision: selected.revision, body: note })}>Add comment</Button><div className="border-t pt-4"><h3 className="text-sm font-semibold">Review history</h3>{history.isLoading ? <p className="mt-3 text-xs">Loading history...</p> : history.error ? <p role="alert" className="mt-3 text-xs">History could not be loaded.</p> : !history.data?.length ? <p className="mt-3 text-xs text-muted-foreground">No review activity yet.</p> : <div className="mt-3 max-h-56 space-y-3 overflow-y-auto">{history.data.map(item => <div key={item.id} className="rounded-xl bg-muted/50 p-3 text-xs"><p className="font-medium">{assetStateLabel(item.action)} / {item.author}</p>{item.body && <p className="mt-2 whitespace-pre-wrap leading-5">{item.body}</p>}<p className="mt-2 text-muted-foreground">{new Date(item.createdAtMs).toLocaleString()}</p></div>)}</div>}</div></section></div>}</DialogContent></Dialog>
    <Dialog open={uploadOpen} onOpenChange={open => { if (!uploading) setUploadOpen(open); }}><DialogContent><DialogHeader><DialogTitle>{parent ? "Upload a new asset version" : "Upload assets"}</DialogTitle><DialogDescription>{parent ? "The original and its approval stay unchanged. This upload becomes a new draft linked to the original." : "Files are saved as drafts. Images: up to 12 MB. MP4/WebM videos: up to 20 MB per file."}</DialogDescription></DialogHeader><div className="space-y-4"><div><Label htmlFor="library-files">{parent ? "New version" : "Choose files"}</Label><Input id="library-files" type="file" className="mt-2" multiple={!parent} accept={types.join(",")} disabled={uploading} onChange={event => setFiles(Array.from(event.target.files ?? []))} /></div><div><Label htmlFor="library-purpose">Asset purpose</Label><select id="library-purpose" className={`${inputClass} mt-2 w-full`} value={purpose} disabled={uploading} onChange={event => setPurpose(event.target.value as "source" | "finished")}><option value="finished">Finished image or video</option><option value="source">Brand / product source material</option></select></div>{purpose === "source" && <div><Label htmlFor="library-source">Source type</Label><select id="library-source" className={`${inputClass} mt-2 w-full`} value={sourceType} disabled={uploading} onChange={event => setSourceType(event.target.value as typeof sourceType)}><option value="logo">Logo</option><option value="product">Product image</option><option value="reference">Reference</option><option value="other">Other</option></select></div>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isUgc} disabled={uploading} onChange={event => setIsUgc(event.target.checked)} />User-generated / creator content</label>{isUgc && <label className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm"><input type="checkbox" className="mt-1" checked={rights} disabled={uploading} onChange={event => setRights(event.target.checked)} />I confirm that we have permission to use this content.</label>}{!!files.length && <p className="text-xs text-muted-foreground">{files.length} file{files.length === 1 ? "" : "s"} selected</p>}{uploadProgress && <p role="status" className="text-sm">{uploadProgress}</p>}<Button className="w-full" disabled={uploading || !files.length || (isUgc && !rights)} onClick={() => void uploadFiles()}>{uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save as draft{files.length === 1 ? "" : "s"}</Button></div></DialogContent></Dialog>
  </>;
}
export default function AssetLibraryPage() { return <WorkspaceGate><Library /></WorkspaceGate>; }
