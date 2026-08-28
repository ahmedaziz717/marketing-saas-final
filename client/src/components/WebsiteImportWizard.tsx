import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Edit3, Globe2, Loader2, PauseCircle, ScanSearch, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type Draft = { companyName: string; summary: string; voice: string; colors: string; fonts: string; requiredClaims: string; prohibitedContent: string; selectedLogoUrls: string[] };
type ProductEdit = { id: number; name: string; sku: string; category: string; description: string; productUrl: string; price: string; currency: string; specifications: string };
const emptyDraft: Draft = { companyName: "", summary: "", voice: "", colors: "", fonts: "", requiredClaims: "", prohibitedContent: "", selectedLogoUrls: [] };

export function WebsiteImportWizard({ organizationId, onComplete }: { organizationId: number; onComplete: () => void }) {
  const utils = trpc.useUtils();
  const latest = trpc.crawl.latest.useQuery({ organizationId });
  const catalog = trpc.catalog.overview.useQuery({ organizationId });
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [maxPages, setMaxPages] = useState("100");
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [liveProgress, setLiveProgress] = useState<{ processed: number; discovered: number } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<ProductEdit | null>(null);
  const start = trpc.crawl.start.useMutation();
  const crawlBatch = trpc.crawl.processBatch.useMutation();
  const analyzeBatch = trpc.crawl.analyzeBatch.useMutation();
  const resume = trpc.crawl.resume.useMutation();
  const cancel = trpc.crawl.cancel.useMutation();
  const bulkReview = trpc.catalog.bulkReview.useMutation();
  const reviewProduct = trpc.catalog.reviewProduct.useMutation();
  const updateProduct = trpc.catalog.updateProduct.useMutation();
  const applyDraft = trpc.catalog.applyBrandDraft.useMutation();
  const job = latest.data;
  const imported = job?.brandDraft as Partial<Draft> & { colors?: string[]; fonts?: string[]; requiredClaims?: string[]; prohibitedContent?: string[]; logoUrls?: string[] } | null | undefined;
  const products = catalog.data?.products ?? [];
  const pendingProducts = useMemo(() => products.filter(product => product.status === "pending"), [products]);

  useEffect(() => {
    if (!imported) return;
    setDraft({ companyName: imported.companyName ?? "", summary: imported.summary ?? "", voice: imported.voice ?? "", colors: Array.isArray(imported.colors) ? imported.colors.join(", ") : "", fonts: Array.isArray(imported.fonts) ? imported.fonts.join(", ") : "", requiredClaims: Array.isArray(imported.requiredClaims) ? imported.requiredClaims.join("\n") : "", prohibitedContent: Array.isArray(imported.prohibitedContent) ? imported.prohibitedContent.join("\n") : "", selectedLogoUrls: imported.logoUrls?.slice(0, 3) ?? [] });
  }, [job?.id, job?.status]);

  const refresh = async () => Promise.all([utils.crawl.latest.invalidate(), utils.catalog.overview.invalidate(), utils.brand.get.invalidate(), utils.brand.assets.invalidate(), utils.activity.list.invalidate()]);
  const run = async (jobId: number, initialStatus = "crawling") => {
    setRunning(true); let status = initialStatus;
    try {
      while (["queued", "discovering", "crawling"].includes(status)) {
        setRunStatus("Mapping and reading public pages");
        const result = await crawlBatch.mutateAsync({ organizationId, jobId, batchSize: 4 });
        setLiveProgress({ processed: result.pagesProcessed, discovered: result.pagesDiscovered }); status = result.status;
      }
      while (status === "analyzing") {
        setRunStatus("GPT-5.5 is organizing brand and product evidence");
        const result = await analyzeBatch.mutateAsync({ organizationId, jobId, batchSize: 5 }); status = result.status; if (result.done) break;
      }
      await refresh(); toast.success("Website analysis is ready to review");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Website import paused safely"); }
    finally { setRunning(false); }
  };
  const startImport = async () => {
    try { setRunning(true); setRunStatus("Discovering the public sitemap"); const result = await start.mutateAsync({ organizationId, websiteUrl, maxPages: Number(maxPages) }); setLiveProgress({ processed: 0, discovered: result.pagesDiscovered }); await run(result.jobId); }
    catch (error) { setRunning(false); toast.error(error instanceof Error ? error.message : "Website discovery failed"); }
  };
  const decideProduct = async (productId: number, decision: "approved" | "rejected") => { try { await reviewProduct.mutateAsync({ organizationId, productId, decision }); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Product review failed"); } };
  const approveProducts = async () => { if (!pendingProducts.length) return; try { await bulkReview.mutateAsync({ organizationId, productIds: pendingProducts.map(product => product.id), decision: "approved" }); await refresh(); toast.success(`${pendingProducts.length} products approved`); } catch (error) { toast.error(error instanceof Error ? error.message : "Products could not be approved"); } };
  const beginEdit = (product: (typeof products)[number]) => setEditing({ id: product.id, name: product.name, sku: product.sku ?? "", category: product.category ?? "", description: product.description ?? "", productUrl: product.productUrl, price: product.price ?? "", currency: product.currency ?? "", specifications: Object.entries(product.specifications).map(([name, value]) => `${name}: ${value}`).join("\n") });
  const saveProduct = async () => {
    if (!editing) return;
    const specifications = Object.fromEntries(editing.specifications.split("\n").map(line => line.split(":" )).filter(parts => parts[0]?.trim() && parts.slice(1).join(":").trim()).map(parts => [parts[0]!.trim(), parts.slice(1).join(":").trim()]));
    try { await updateProduct.mutateAsync({ organizationId, productId: editing.id, product: { name: editing.name, sku: editing.sku || null, category: editing.category || null, description: editing.description || null, productUrl: editing.productUrl, price: editing.price || null, currency: editing.currency || null, specifications } }); setEditing(null); await refresh(); toast.success("Product updated and returned to pending review"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Product could not be updated"); }
  };
  const saveAndContinue = async () => {
    if (!job) return;
    try { await applyDraft.mutateAsync({ organizationId, jobId: job.id, draft: { companyName: draft.companyName, summary: draft.summary, voice: draft.voice, colors: draft.colors.split(",").map(value => value.trim().toUpperCase()).filter(value => /^#[0-9A-F]{6}$/.test(value)), fonts: draft.fonts.split(",").map(value => value.trim()).filter(Boolean), requiredClaims: draft.requiredClaims.split("\n").map(value => value.trim()).filter(Boolean), prohibitedContent: draft.prohibitedContent.split("\n").map(value => value.trim()).filter(Boolean), selectedLogoUrls: draft.selectedLogoUrls }, activate: true }); await refresh(); toast.success("Imported brand kit activated"); onComplete(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Brand kit could not be activated"); }
  };

  const progress = liveProgress ?? (job ? { processed: job.pagesProcessed, discovered: job.pagesDiscovered } : null);
  const reviewReady = job?.status === "review_ready" || job?.status === "completed";
  if (reviewReady && imported) return <div className="space-y-7">
    <div className="flex items-center justify-between gap-4"><div><p className="eyebrow">Review discovered identity</p><h3 className="mt-2 text-2xl font-semibold">Everything remains editable.</h3></div><div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 sm:flex"><ShieldCheck className="h-4 w-4"/>Draft only</div></div>
    <div className="grid gap-5 sm:grid-cols-2"><div><Label>Company name</Label><Input className="mt-2" value={draft.companyName} onChange={event => setDraft({ ...draft, companyName: event.target.value })}/></div><div><Label>Colors</Label><Input className="mt-2" value={draft.colors} onChange={event => setDraft({ ...draft, colors: event.target.value })}/><div className="mt-3 flex flex-wrap gap-2">{draft.colors.split(",").map(value => value.trim()).filter(value => /^#[0-9a-f]{6}$/i.test(value)).map(value => <button type="button" key={value} title={`Remove ${value}`} onClick={() => setDraft({ ...draft, colors: draft.colors.split(",").map(item => item.trim()).filter(item => item !== value).join(", ") })} className="h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-black/10" style={{ background: value }}/>)}</div></div><div className="sm:col-span-2"><Label>Company summary</Label><Textarea className="mt-2 min-h-24" value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })}/></div><div className="sm:col-span-2"><Label>Brand voice</Label><Textarea className="mt-2 min-h-24" value={draft.voice} onChange={event => setDraft({ ...draft, voice: event.target.value })}/></div><div><Label>Fonts</Label><Input className="mt-2" value={draft.fonts} onChange={event => setDraft({ ...draft, fonts: event.target.value })}/></div><div><Label>Required claims <span className="text-muted-foreground">(one per line)</span></Label><Textarea className="mt-2 min-h-28" value={draft.requiredClaims} onChange={event => setDraft({ ...draft, requiredClaims: event.target.value })}/></div><div className="sm:col-span-2"><Label>Prohibited content <span className="text-muted-foreground">(one per line)</span></Label><Textarea className="mt-2 min-h-24" value={draft.prohibitedContent} onChange={event => setDraft({ ...draft, prohibitedContent: event.target.value })}/></div></div>
    {imported.logoUrls?.length ? <div><Label>Choose logos to import as pending assets</Label><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{imported.logoUrls.slice(0, 8).map(url => <label key={url} className={`relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-2xl border p-3 ${draft.selectedLogoUrls.includes(url) ? "border-primary bg-primary/5 ring-2 ring-primary/10" : "hairline bg-muted/40"}`}><Checkbox className="absolute left-3 top-3" checked={draft.selectedLogoUrls.includes(url)} onCheckedChange={() => setDraft({ ...draft, selectedLogoUrls: draft.selectedLogoUrls.includes(url) ? draft.selectedLogoUrls.filter(item => item !== url) : [...draft.selectedLogoUrls, url] })}/><img src={url} alt="Discovered logo" className="max-h-full max-w-full object-contain"/></label>)}</div></div> : null}
    <div className="rounded-3xl border hairline bg-muted/30 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="eyebrow">Product review</p><h4 className="mt-2 text-lg font-semibold">{products.length} products discovered</h4><p className="mt-1 text-xs text-muted-foreground">Edit, approve, or reject each record. Pending items stay unavailable to briefs.</p></div>{pendingProducts.length > 0 && <Button variant="outline" onClick={approveProducts} disabled={bulkReview.isPending}><Check className="mr-2 h-4 w-4"/>Approve all pending</Button>}</div><div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">{products.length === 0 ? <p className="rounded-xl bg-background p-4 text-sm text-muted-foreground">No product pages were confidently identified. You can still activate the brand kit and add products later.</p> : products.map(product => <div key={product.id} className={`flex flex-col gap-3 rounded-xl border-l-4 bg-background p-3 sm:flex-row sm:items-center ${product.status === "approved" ? "border-l-emerald-500" : product.status === "rejected" ? "border-l-rose-400" : "border-l-amber-400"}`}><div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">{product.images[0] && <img src={product.images[0].url} alt="" className="h-full w-full object-contain"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{product.name}</p><p className="truncate text-[11px] text-muted-foreground">{product.category || "Uncategorized"} · {Object.keys(product.specifications).length} specifications</p></div><StatusPill status={product.status}/><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => beginEdit(product)}><Edit3 className="h-3.5 w-3.5"/><span className="sr-only">Edit</span></Button><Button size="sm" variant="ghost" onClick={() => decideProduct(product.id, "rejected")}><X className="h-3.5 w-3.5"/><span className="sr-only">Reject</span></Button><Button size="sm" variant="ghost" onClick={() => decideProduct(product.id, "approved")}><Check className="h-3.5 w-3.5"/><span className="sr-only">Approve</span></Button></div></div>)}</div></div>
    <Button className="h-12 rounded-full px-6" onClick={saveAndContinue} disabled={!draft.companyName || applyDraft.isPending}>Activate imported brand kit<ArrowRight className="ml-2 h-4 w-4"/></Button>
    <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="font-editorial text-4xl font-normal">Edit discovered product</DialogTitle></DialogHeader>{editing && <div className="grid gap-4 py-3 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Name</Label><Input className="mt-2" value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })}/></div><div><Label>SKU</Label><Input className="mt-2" value={editing.sku} onChange={event => setEditing({ ...editing, sku: event.target.value })}/></div><div><Label>Category</Label><Input className="mt-2" value={editing.category} onChange={event => setEditing({ ...editing, category: event.target.value })}/></div><div className="sm:col-span-2"><Label>Description</Label><Textarea className="mt-2 min-h-24" value={editing.description} onChange={event => setEditing({ ...editing, description: event.target.value })}/></div><div><Label>Price</Label><Input className="mt-2" value={editing.price} onChange={event => setEditing({ ...editing, price: event.target.value })}/></div><div><Label>Currency</Label><Input className="mt-2" value={editing.currency} onChange={event => setEditing({ ...editing, currency: event.target.value })}/></div><div className="sm:col-span-2"><Label>Specifications <span className="text-muted-foreground">(Name: value)</span></Label><Textarea className="mt-2 min-h-40 font-mono text-xs" value={editing.specifications} onChange={event => setEditing({ ...editing, specifications: event.target.value })}/></div><Button className="sm:col-span-2" onClick={saveProduct} disabled={!editing.name || updateProduct.isPending}>Save for review</Button></div>}</DialogContent></Dialog>
  </div>;

  return <div><div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Globe2 className="h-5 w-5"/></div><div><p className="eyebrow">Website intelligence</p><h3 className="mt-2 text-2xl font-semibold">Import the company and catalog</h3><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Frame follows the public sitemap, reads same-site pages in safe batches, and organizes editable brand and product evidence with GPT-5.5.</p></div></div><div className="mt-7 grid gap-4 sm:grid-cols-[1fr_130px]"><div><Label>Company website</Label><Input className="mt-2 h-12" value={websiteUrl} onChange={event => setWebsiteUrl(event.target.value)} placeholder="https://company.com" disabled={running}/></div><div><Label>Page ceiling</Label><Input className="mt-2 h-12" type="number" min="10" max="250" value={maxPages} onChange={event => setMaxPages(event.target.value)} disabled={running}/></div></div>{running ? <div className="mt-6 rounded-3xl bg-[#201c25] p-5 text-white"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><Loader2 className="h-4 w-4 animate-spin text-violet-300"/><div><p className="text-sm font-medium">{runStatus}</p><p className="mt-1 text-xs text-white/45">Progress is saved after every request-sized batch.</p></div></div>{job && <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={async () => { await cancel.mutateAsync({ organizationId, jobId: job.id }); setRunning(false); await refresh(); }}><PauseCircle className="mr-2 h-4 w-4"/>Cancel</Button>}</div>{progress && <><Progress className="mt-5 bg-white/10" value={progress.discovered ? Math.min(100, progress.processed / progress.discovered * 100) : 0}/><p className="mt-2 text-right text-[10px] uppercase tracking-wider text-white/45">{progress.processed} of {progress.discovered} pages read</p></>}</div> : <div className="mt-6 flex flex-wrap gap-3"><Button className="h-12 rounded-full px-6" onClick={startImport} disabled={websiteUrl.trim().length < 4 || start.isPending}><ScanSearch className="mr-2 h-4 w-4"/>Analyze full website</Button>{job && ["crawling", "analyzing", "failed", "cancelled"].includes(job.status) && <Button variant="outline" className="h-12 rounded-full px-6" onClick={async () => { const result = await resume.mutateAsync({ organizationId, jobId: job.id }); await run(job.id, result.status); }}>Resume saved import</Button>}</div>}<div className="mt-6 flex gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"/>Only public HTTP(S) pages on the same company site are read. Private networks, unsafe redirects, unsupported files, and oversized responses are blocked.</div></div>;
}
