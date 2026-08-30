import { useMemo, useState } from "react";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Check, Copy, Download, Images, Loader2, MessageSquare, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

function CreativeStudio() {
  const { organizationId } = useWorkspace();
  const utils = trpc.useUtils();
  const query = trpc.creatives.overview.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId });
  const [briefId, setBriefId] = useState("");
  const [count, setCount] = useState("3");
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const generate = trpc.creatives.generate.useMutation({
    onSuccess: async result => { await Promise.all([utils.creatives.overview.invalidate(), utils.activity.list.invalidate()]); toast.success(`${result.variantCount} creative variants are ready for review`); },
    onError: error => toast.error(error.message),
  });
  const review = trpc.creatives.reviewVariant.useMutation({
    onSuccess: async () => { await Promise.all([utils.creatives.overview.invalidate(), utils.activity.list.invalidate()]); toast.success("Review decision recorded"); },
    onError: error => toast.error(error.message),
  });
  const addComment = trpc.creatives.addComment.useMutation({
    onSuccess: async () => { setComment(""); await Promise.all([utils.creatives.overview.invalidate(), utils.activity.list.invalidate()]); toast.success("Comment added"); },
    onError: error => toast.error(error.message),
  });
  const variants = query.data?.variants ?? [];
  const latestJob = query.data?.jobs[0];
  const latestFailedJob = latestJob?.status === "failed" ? latestJob : null;
  const selected = variants.find(variant => variant.id === selectedVariantId) ?? variants[0] ?? null;
  const comments = useMemo(() => (query.data?.comments ?? []).filter(item => item.variantId === selected?.id), [query.data?.comments, selected?.id]);
  const copyPackage = async (variant: typeof selected) => {
    if (!variant) return;
    await navigator.clipboard.writeText(`${variant.primaryText}\n\n${variant.headline}\n${variant.description ?? ""}\nCTA: ${variant.callToAction}`);
    toast.success("Ad copy copied");
  };

  return <><PageHeader eyebrow="AI studio" title="Creative review" description="Generate only from approved inputs, compare variants in one frame, and record the human decision that can unlock publishing." action={<div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-4 w-4"/>Approval gate active</div>} />
    <section className="surface mb-6 p-5 md:p-6"><div className="grid gap-4 lg:grid-cols-[1fr_150px_auto] lg:items-end"><div><Label>Approved campaign brief</Label><Select value={briefId} onValueChange={setBriefId}><SelectTrigger className="mt-2 h-11"><SelectValue placeholder="Choose an approved brief"/></SelectTrigger><SelectContent>{query.data?.briefs.map(brief => <SelectItem key={brief.id} value={String(brief.id)}>{brief.name}</SelectItem>)}</SelectContent></Select>{query.data?.briefs.length === 0 && <p className="mt-2 text-xs text-amber-700">No eligible briefs. Approve a brief and its source assets first.</p>}</div><div><Label>Variants</Label><Select value={count} onValueChange={setCount}><SelectTrigger className="mt-2 h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="2">2 variants</SelectItem><SelectItem value="3">3 variants</SelectItem><SelectItem value="4">4 variants</SelectItem></SelectContent></Select></div><Button className="h-11 rounded-full px-6" disabled={!briefId || generate.isPending} onClick={() => generate.mutate({ organizationId: organizationId!, briefId: Number(briefId), count: Number(count) })}>{generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Sparkles className="mr-2 h-4 w-4"/>}{generate.isPending ? "Building creative set…" : "Generate creative set"}</Button></div>{generate.isPending && <div className="mt-5 flex items-center gap-3 rounded-2xl bg-primary/[.05] p-4 text-sm text-muted-foreground"><div className="h-2 w-2 animate-pulse rounded-full bg-primary"/>Frame is planning distinct concepts, applying your brand policy, and generating the image variants in parallel.</div>}</section>

    {latestFailedJob && <section className="mb-6 flex flex-col gap-4 rounded-[1.35rem] border border-amber-300 bg-amber-50 p-5 text-amber-950 md:flex-row md:items-center"><div className="flex flex-1 gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="text-sm font-semibold">The latest generation attempt stopped safely.</p><p className="mt-1 text-sm leading-6 text-amber-900/75">{latestFailedJob.errorMessage || "The generation provider could not complete this attempt."} The failed attempt remains in the activity history.</p></div></div><Button variant="outline" className="shrink-0 rounded-full bg-white" disabled={generate.isPending} onClick={() => { setBriefId(String(latestFailedJob.briefId)); generate.mutate({ organizationId: organizationId!, briefId: latestFailedJob.briefId, count: Number(count) }); }}><RotateCcw className="mr-2 h-4 w-4"/>Retry as new attempt</Button></section>}

    {variants.length === 0 ? <div className="surface grid min-h-[440px] place-items-center text-center"><div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Images className="h-6 w-6"/></div><h2 className="mt-5 text-xl font-semibold">Your first contact sheet starts here</h2><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Select an approved brief. Frame will use only its approved brand and product assets.</p></div></div> : <div className="grid gap-6 2xl:grid-cols-[1fr_360px]"><section className="min-w-0"><div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">Contact sheet</p><p className="mt-1 text-sm text-muted-foreground">{variants.length} variants across {query.data?.jobs.length ?? 0} generation jobs</p></div></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2">{variants.map(variant => <article key={variant.id} onClick={() => setSelectedVariantId(variant.id)} className={`group cursor-pointer overflow-hidden rounded-[1.35rem] border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${selected?.id === variant.id ? "border-primary ring-2 ring-primary/10" : "hairline"}`}><div className="relative aspect-square overflow-hidden bg-muted"><img src={variant.imageUrl} alt={variant.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"/><div className="absolute left-3 top-3"><StatusPill status={variant.status}/></div><div className="absolute bottom-3 right-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">{variant.format.replaceAll("_", " · ")}</div></div><div className="p-5"><p className="eyebrow">{variant.name}</p><h3 className="mt-2 text-lg font-semibold leading-tight">{variant.headline}</h3><p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{variant.primaryText}</p><div className="mt-5 flex gap-2"><Button size="sm" className="flex-1" onClick={event => { event.stopPropagation(); review.mutate({ organizationId: organizationId!, variantId: variant.id, decision: "approved" }); }}><Check className="mr-1 h-3.5 w-3.5"/>Approve</Button><Button size="sm" variant="outline" onClick={event => { event.stopPropagation(); review.mutate({ organizationId: organizationId!, variantId: variant.id, decision: "rejected" }); }}><X className="h-3.5 w-3.5"/></Button></div></div></article>)}</div></section>
      {selected && <aside className="surface h-fit overflow-hidden 2xl:sticky 2xl:top-8"><div className="border-b hairline p-5"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Review detail</p><h2 className="mt-2 text-xl font-semibold">{selected.name}</h2></div><StatusPill status={selected.status}/></div><p className="mt-4 text-sm leading-6 text-muted-foreground">{selected.concept}</p></div><div className="space-y-5 p-5"><div><p className="eyebrow">Primary text</p><p className="mt-2 text-sm leading-6">{selected.primaryText}</p></div><div className="rounded-2xl bg-muted/60 p-4"><p className="text-sm font-semibold">{selected.headline}</p><p className="mt-1 text-xs text-muted-foreground">{selected.description}</p><span className="mt-3 inline-flex rounded-md bg-foreground px-3 py-1.5 text-[10px] font-bold text-background">{selected.callToAction.replaceAll("_", " ")}</span></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => copyPackage(selected)}><Copy className="mr-2 h-4 w-4"/>Copy text</Button><Button variant="outline" asChild><a href={selected.imageUrl} download><Download className="mr-2 h-4 w-4"/>Export image</a></Button></div><div className="border-t hairline pt-5"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary"/><p className="text-sm font-semibold">Review comments</p></div><div className="mt-3 max-h-44 space-y-2 overflow-y-auto">{comments.length === 0 ? <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">No comments yet.</p> : comments.map(item => <div key={item.id} className="rounded-xl bg-muted/60 p-3 text-xs leading-5">{item.body}<p className="mt-1 text-[10px] text-muted-foreground">{new Date(item.createdAtMs).toLocaleString()}</p></div>)}</div><div className="mt-3 flex gap-2"><Input value={comment} onChange={event => setComment(event.target.value)} placeholder="Add a review note…" onKeyDown={event => { if (event.key === "Enter" && comment.trim()) addComment.mutate({ organizationId: organizationId!, variantId: selected.id, body: comment.trim() }); }}/><Button size="icon" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate({ organizationId: organizationId!, variantId: selected.id, body: comment.trim() })}><MessageSquare className="h-4 w-4"/></Button></div></div></div></aside>}
    </div>}
  </>;
}

export default function CreativesPage(){ return <WorkspaceGate><CreativeStudio/></WorkspaceGate>; }
