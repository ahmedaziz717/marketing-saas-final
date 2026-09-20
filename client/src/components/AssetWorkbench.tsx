import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Film, FolderOpen, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { ASSET_VIEWS, assetMatchesView, assetStateLabel, type AssetState, type AssetView, type LibraryAsset } from "@shared/assetLibrary";
import { isWorkingAsset, libraryAssetLink, mayCreateAssets, studioAssetLink, workflowLabel, type AssetSurface } from "@shared/assetWorkflow";
import { AssetWorkflowActions } from "./AssetWorkflowActions";
import { AssetUploadDialog } from "./AssetUploadDialog";
import { toast } from "sonner";

const libraryViews = [{ id: "approved", label: "Approved Assets" }, { id: "needs_review", label: "Needs Review" }, { id: "history", label: "Review history" }];
const studioViews = [{ id: "drafts", label: "Drafts" }, { id: "returned", label: "Changes requested / rejected" }, { id: "submitted", label: "Submitted" }, { id: "all", label: "All saved work" }];
function matchesState(asset: LibraryAsset, surface: AssetSurface, view: string) {
  if (surface === "library") return view === "history" ? ["changes_requested", "rejected"].includes(asset.state) : asset.state === view;
  if (view === "all") return true;
  if (view === "drafts") return asset.state === "draft";
  if (view === "returned") return ["changes_requested", "rejected"].includes(asset.state);
  return ["needs_review", "approved"].includes(asset.state);
}
function AssetStatus({ state }: { state: AssetState }) {
  return <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${state === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : state === "needs_review" ? "border-amber-200 bg-amber-50 text-amber-900" : "bg-muted text-muted-foreground"}`}>{workflowLabel(state)}</span>;
}
export function AssetWorkbench({ surface }: { surface: AssetSurface }) {
  const { organizationId, membership } = useWorkspace();
  const role = membership?.role ?? "";
  const canCreate = mayCreateAssets(role);
  const params = new URLSearchParams(useSearch());
  const selectedKey = params.get("asset"), reviseKey = params.get("revise");
  const [, navigate] = useLocation();
  const views = surface === "studio" ? studioViews : libraryViews;
  const requestedView = params.get("view");
  const view = views.some(item => item.id === requestedView) ? requestedView! : surface === "studio" ? "drafts" : "approved";
  const base = surface === "studio" ? "/app/creatives?tab=saved" : "/app/library";
  const separator = surface === "studio" ? "&" : "?";
  const [type, setType] = useState<AssetView>("all"), [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false), [parent, setParent] = useState<LibraryAsset | null>(null);
  const utils = trpc.useUtils();
  const library = trpc.assetLibrary.list.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId && surface === "library" });
  const studio = trpc.assetLibrary.studioList.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId && surface === "studio" && canCreate, refetchInterval: surface === "studio" && canCreate ? 5000 : false });
  const query = surface === "studio" ? studio : library;
  const assets = query.data ?? [];
  const selected = assets.find(item => item.key === selectedKey);
  const visible = assets.filter(item => matchesState(item, surface, view) && assetMatchesView(item, type) && `${item.name} ${item.headline ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const history = trpc.assetLibrary.history.useQuery({ organizationId: organizationId!, key: selectedKey ?? "asset:1" }, { enabled: !!organizationId && !!selected });
  const refresh = async () => Promise.all([utils.assetLibrary.list.invalidate(), utils.assetLibrary.studioList.invalidate(), utils.assetLibrary.history.invalidate(), utils.creatives.overview.invalidate(), utils.brand.assets.invalidate(), utils.meta.overview.invalidate(), utils.activity.list.invalidate()]);
  const failure = (error: { message: string }) => { toast.error(error.message); void refresh(); };
  const submit = trpc.assetLibrary.submit.useMutation({ onSuccess: async (_, input) => { await refresh(); toast.success("Submitted to Asset Library for approval"); navigate(libraryAssetLink(input.key, "needs_review")); }, onError: failure });
  const direct = trpc.assetLibrary.approveAndAdd.useMutation({ onSuccess: async (_, input) => { await refresh(); toast.success("Approved and added to Asset Library. Nothing was published."); navigate(libraryAssetLink(input.key, "approved")); }, onError: failure });
  const review = trpc.assetLibrary.review.useMutation({ onSuccess: async (_, input) => { await refresh(); setNote(""); toast.success(input.decision === "approved" ? "Version approved" : "Feedback saved. This version is returned to Studio."); navigate(libraryAssetLink(input.key, input.decision)); }, onError: failure });
  const comment = trpc.assetLibrary.comment.useMutation({ onSuccess: async () => { await refresh(); setNote(""); }, onError: failure });
  const busy = submit.isPending || direct.isPending || review.isPending || comment.isPending;
  const navigateView = (value: string) => navigate(`${base}${separator}view=${value}`);
  const inspect = (key: string) => navigate(surface === "studio" ? `${base}&view=${view}&asset=${encodeURIComponent(key)}` : `${base}?view=${view}&asset=${encodeURIComponent(key)}`);
  useEffect(() => setNote(""), [selectedKey]);
  useEffect(() => {
    if (surface !== "studio" || !canCreate || !reviseKey || !studio.data) return;
    const prior = studio.data.find(item => item.key === reviseKey);
    if (prior) { setParent(prior); setUploadOpen(true); }
    else toast.error("The original asset is not available in this workspace.");
    navigate(prior ? studioAssetLink(prior.key) : "/app/creatives?tab=saved", { replace: true });
  }, [surface, canCreate, reviseKey, studio.data, navigate]);
  function revisedVersion() {
    if (!selected) return;
    if (surface === "library") navigate(`/app/creatives?tab=saved&revise=${encodeURIComponent(selected.key)}`);
    else { setParent(selected); setUploadOpen(true); }
  }
  const completedUpload = (key: string, state: AssetState) => navigate(state === "draft" ? studioAssetLink(key) : libraryAssetLink(key, state));
  if (surface === "studio" && !canCreate) return <div className="surface p-6"><p>Your role can review submitted assets in the library, but cannot create or submit drafts.</p><Link className="mt-3 inline-block text-primary" href="/app/library?view=needs_review">Open Needs Review</Link></div>;
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-semibold">{surface === "studio" ? "Saved work" : "Your shared collection"}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{surface === "studio" ? "Drafts and experiments stay here. Submit only the versions you want reviewed." : "Only submitted and approved assets appear here. Working drafts stay in Content Studio."}</p></div>
      <div className="flex gap-2"><Button aria-label="Refresh assets" variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /></Button>{canCreate && <Button onClick={() => { setParent(null); setUploadOpen(true); }}><Upload className="mr-2 h-4 w-4" />Upload assets</Button>}</div>
    </div>
    <nav aria-label={surface === "library" ? "Library views" : "Saved work views"} className="mb-6 flex flex-wrap gap-2 border-b pb-4">{views.map(item => <Button key={item.id} variant={view === item.id ? "default" : "outline"} aria-pressed={view === item.id} className="h-auto whitespace-normal py-2" onClick={() => navigateView(item.id)}>{item.label}<span className="ml-2 rounded-full border px-2 text-xs">{assets.filter(asset => matchesState(asset, surface, item.id)).length}</span></Button>)}</nav>
    <div className="mb-5 flex flex-wrap gap-3"><Input className="min-w-40 flex-1" aria-label="Search assets" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search names and headlines..." /><select aria-label="Asset type" className="h-10 max-w-full rounded-xl border bg-background px-3 text-sm" value={type} onChange={event => setType(event.target.value as AssetView)}>{ASSET_VIEWS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
    {selectedKey && !selected && !query.isLoading && !query.error && <div role="status" className="mb-5 rounded-xl border p-4 text-sm">This version is not in this collection. {canCreate && surface === "library" ? <Link className="text-primary underline" href={studioAssetLink(selectedKey)}>Check saved work in Content Studio.</Link> : "Refresh the list or choose an available version."}</div>}
    {query.isLoading ? <p role="status" className="surface p-8"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading assets...</p> : query.error ? <div role="alert" className="surface p-8"><p>Assets could not be loaded. Your saved work has not changed.</p><Button variant="outline" className="mt-4" onClick={() => query.refetch()}>Try again</Button></div> : !visible.length ? <div className="surface grid min-h-64 place-items-center p-8 text-center"><div><FolderOpen className="mx-auto h-8 w-8 text-primary" /><h3 className="mt-4 text-lg font-semibold">{surface === "library" && view === "approved" ? "No approved assets in this view" : surface === "library" && view === "needs_review" ? "No submissions waiting for review" : "No matching saved assets"}</h3><p className="mt-2 max-w-lg text-sm text-muted-foreground">{surface === "library" ? "Create or upload in Studio, then submit selected versions. Only approved versions are available for use." : "Generate an image or upload a file. It will be saved as a draft until you choose the next step."}</p><Link className="mt-4 inline-block text-sm text-primary underline" href={surface === "library" ? "/app/creatives?tab=saved" : "/app/creatives"}>{surface === "library" ? "Open saved work in Studio" : "Create an image"}</Link></div></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(asset => <button key={asset.key} className="min-w-0 overflow-hidden rounded-2xl border bg-card text-left hover:border-primary focus-visible:ring-2 focus-visible:ring-primary" onClick={() => inspect(asset.key)}><div className="relative grid h-52 place-items-center bg-muted/50 p-3">{asset.mediaType === "image" ? <img src={asset.url} alt={asset.name} loading="lazy" className="max-h-full max-w-full object-contain" /> : <Film className="h-12 w-12 text-muted-foreground" />}<div className="absolute left-2 top-2"><AssetStatus state={asset.state} /></div></div><div className="p-4"><p className="truncate font-medium">{asset.name}</p><p className="mt-2 text-xs text-muted-foreground">{asset.origin === "generated" ? "Generated" : "Uploaded"}{asset.isUgc ? " / UGC" : ""} / {asset.purpose === "source" ? "Source material" : "Finished asset"}</p><p className="mt-3 text-sm text-primary">{surface === "studio" ? "Open saved version" : asset.state === "needs_review" ? "Open submission" : "View asset"}</p></div></button>)}</div>}
    <Dialog open={!!selected && !uploadOpen} onOpenChange={open => { if (!open && !busy) navigateView(view); }}><DialogContent className="max-h-[90dvh] overflow-x-hidden overflow-y-auto sm:max-w-5xl"><DialogHeader className="min-w-0 pr-8"><DialogTitle className="break-words">{selected?.name}</DialogTitle><DialogDescription>{surface === "studio" ? "This saved version stays in Studio until you submit or explicitly approve it." : "Review the submitted version here. Approval does not publish a post or authorize advertising spend."}</DialogDescription></DialogHeader>{selected && <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"><section className="min-w-0"><div className="grid min-h-40 place-items-center rounded-xl bg-muted/50 p-3">{selected.mediaType === "video" ? <video src={selected.url} controls preload="metadata" className="max-h-[50dvh] w-full" /> : <img src={selected.url} alt={selected.name} className="max-h-[50dvh] max-w-full object-contain" />}</div>{selected.headline && <h3 className="mt-4 break-words font-semibold">{selected.headline}</h3>}{selected.primaryText && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{selected.primaryText}</p>}<a href={selected.url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm text-primary underline">Open original</a>{selected.parentKey && <p className="mt-4 text-sm"><Link href={surface === "studio" ? studioAssetLink(selected.parentKey) : libraryAssetLink(selected.parentKey, "approved")} className="text-primary underline">View previous version</Link></p>}{assets.filter(item => item.parentKey === selected.key).map(child => <p key={child.key} className="mt-3 break-words text-sm"><Link className="text-primary underline" href={surface === "studio" ? studioAssetLink(child.key) : libraryAssetLink(child.key, child.state)}>Revised version: {child.name}</Link></p>)}</section><section className="min-w-0 space-y-4"><AssetStatus state={selected.state} /><p className="text-xs leading-5 text-muted-foreground">{selected.purpose === "source" ? "Source material: approval permits use during creation, not direct publishing." : "Finished content: approval makes it eligible for a separate post or advertising review."}</p><AssetWorkflowActions surface={surface} state={selected.state} role={role} busy={busy} note={note} onNoteChange={setNote} onSubmit={() => submit.mutate({ organizationId: organizationId!, key: selected.key, revision: selected.revision })} onApproveAndAdd={() => direct.mutate({ organizationId: organizationId!, key: selected.key, revision: selected.revision })} onReview={decision => review.mutate({ organizationId: organizationId!, key: selected.key, revision: selected.revision, decision, note })} onComment={() => comment.mutate({ organizationId: organizationId!, key: selected.key, revision: selected.revision, body: note })} onRevise={revisedVersion} onViewSubmission={() => navigate(libraryAssetLink(selected.key, selected.state))} /><div className="border-t pt-4"><h3 className="font-semibold">Review history & feedback</h3>{history.isLoading ? <p role="status" className="mt-3 text-sm">Loading feedback...</p> : history.error ? <p role="alert" className="mt-3 text-sm">History could not be loaded.</p> : !history.data?.length ? <p className="mt-3 text-sm text-muted-foreground">No review activity yet.</p> : <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">{history.data.map(event => <article key={event.id} className="rounded-xl bg-muted/50 p-3 text-xs"><p className="font-medium">{assetStateLabel(event.action)} / {event.author}</p>{event.body && <p className="mt-2 whitespace-pre-wrap break-words leading-5">{event.body}</p>}<p className="mt-2 text-muted-foreground">{new Date(event.createdAtMs).toLocaleString()}</p></article>)}</div>}</div></section></div>}</DialogContent></Dialog>
    {organizationId && canCreate && <AssetUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} organizationId={organizationId} role={role} parent={parent} defaultDisposition={surface === "library" ? "submit" : "draft"} onSaved={refresh} onComplete={completedUpload} />}
  </>;
}
