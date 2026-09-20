import { useState } from "react";
import { Link } from "wouter";
import { WorkspaceGate } from "@/components/WorkspaceGate";
import { PageHeader } from "@/components/PageHeader";
import { CreativeBuilder } from "@/components/CreativeBuilder";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/hooks/useWorkspace";
import { trpc } from "@/lib/trpc";
import { CREATIVE_CHANNELS, formatDetails } from "@shared/creativeBuilder";
import { assetStateLabel, canSubmitAsset } from "@shared/assetLibrary";
import { AlertTriangle, Copy, Download, FolderOpen, Images, Loader2 } from "lucide-react";
import { toast } from "sonner";

function CreativeStudio() {
  const { organizationId, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"create" | "results">("create");
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const query = trpc.creatives.overview.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId, refetchInterval: query => query.state.data?.jobs.some(job => ["running", "queued"].includes(job.status)) ? 5000 : false });
  const library = trpc.assetLibrary.list.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId && tab === "results" });
  const download = trpc.creatives.download.useMutation();
  const submit = trpc.assetLibrary.submit.useMutation({ onSuccess: async () => { await Promise.all([utils.assetLibrary.list.invalidate(), utils.activity.list.invalidate()]); toast.success("Submitted to Asset Library for review"); }, onError: error => { toast.error(error.message); void utils.assetLibrary.list.invalidate(); } });
  const canCreate = ["owner", "admin", "creator"].includes(membership?.role ?? "");
  const variants = query.data?.variants ?? [];
  const selected = variants.find(variant => variant.id === selectedVariantId) ?? variants[0] ?? null;
  const selectedAsset = library.data?.find(asset => asset.key === `creative:${selected?.id}`);
  const latestJob = query.data?.jobs[0];
  async function exportCreative() {
    if (!selected) return;
    try {
      const file = await download.mutateAsync({ organizationId: organizationId!, variantId: selected.id });
      const bytes = Uint8Array.from(atob(file.base64), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      const link = document.createElement("a"); link.href = url; link.download = file.fileName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Download failed."); }
  }
  async function copyPackage() {
    if (!selected) return;
    try {
      const copy = selected.renderMetadata?.copy;
      await navigator.clipboard.writeText(copy ? [copy.headline, copy.subheadline, "CTA: " + copy.cta].join("\n") : [selected.primaryText, "", selected.headline, selected.description ?? "", "CTA: " + selected.callToAction].join("\n"));
      toast.success("Creative copy copied");
    } catch { toast.error("Copy was unavailable. Select and copy the text directly."); }
  }
  return <>
    <PageHeader eyebrow="Content Studio" title="Creative Builder" description="Create and refine images here. Every successful result is saved in Asset Library as a draft, ready to submit when you choose." action={<Link href="/app/library"><Button variant="outline"><FolderOpen className="mr-2 h-4 w-4" />Asset Library</Button></Link>} />
    <div className="mb-6 flex gap-2 border-b pb-3" role="tablist" aria-label="Creative workspace">
      <Button role="tab" id="creative-create-tab" aria-controls="creative-create-panel" aria-selected={tab === "create"} variant={tab === "create" ? "default" : "ghost"} onClick={() => setTab("create")}>Create</Button>
      <Button role="tab" id="creative-results-tab" aria-controls="creative-results-panel" aria-selected={tab === "results"} variant={tab === "results" ? "default" : "ghost"} onClick={() => setTab("results")}>Results{variants.length ? " / " + variants.length : ""}</Button>
    </div>
    <div id="creative-create-panel" role="tabpanel" aria-labelledby="creative-create-tab" hidden={tab !== "create"}><CreativeBuilder onGenerated={() => { setSelectedVariantId(null); setTab("results"); void utils.assetLibrary.list.invalidate(); }} /></div>
    <div id="creative-results-panel" role="tabpanel" aria-labelledby="creative-results-tab" hidden={tab !== "results"}>
      {query.isLoading && <p className="surface p-5" role="status"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading results...</p>}
      {query.error && <div role="alert" className="surface p-5"><p>Results could not be loaded.</p><Button className="mt-3" variant="outline" onClick={() => query.refetch()}>Try again</Button></div>}
      {latestJob?.status === "failed" && <section className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" /><div><p className="font-medium">The latest attempt could not finish.</p><p className="mt-1 text-sm">{latestJob.errorMessage}</p><Button variant="outline" className="mt-3" onClick={() => setTab("create")}>Return to saved setups</Button></div></section>}
      {query.data?.jobs.some(job => ["running", "queued"].includes(job.status)) && <p role="status" className="mb-5 rounded-xl bg-primary/5 p-4 text-sm"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />A creative set is being generated. Results appear when the set is ready.</p>}
      {!query.isLoading && !query.error && !variants.length && <div className="surface grid min-h-80 place-items-center p-6 text-center"><div><Images className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-4 text-xl font-semibold">Your creatives will appear here</h2><p className="mt-2 text-sm text-muted-foreground">Results are saved in the shared library without a download and re-upload.</p><Button className="mt-5" onClick={() => setTab("create")}>Create your first set</Button></div></div>}
      {!!variants.length && <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_350px]"><section><h2 className="mb-4 text-lg font-semibold">Creative results</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2">{variants.map(variant => {
        const format = formatDetails(variant.format);
        const channel = CREATIVE_CHANNELS.find(channel => channel.id === variant.channel)?.name ?? "Meta";
        const asset = library.data?.find(asset => asset.key === `creative:${variant.id}`);
        return <article key={variant.id} className={`overflow-hidden rounded-2xl border bg-card ${selected?.id === variant.id ? "border-primary ring-2 ring-primary/10" : "border-border"}`}><button type="button" className="grid h-64 w-full place-items-center bg-muted/50 p-3" aria-label={"Inspect " + variant.name} onClick={() => setSelectedVariantId(variant.id)}><img src={variant.imageUrl} alt={variant.name} className="max-h-full max-w-full object-contain" loading="lazy" /></button><div className="p-4"><p className="text-xs text-muted-foreground">{channel} / {format ? format.width + " x " + format.height : variant.format.replaceAll("_", " ")}</p><button className="mt-2 text-left font-medium" onClick={() => setSelectedVariantId(variant.id)}>{variant.name}</button><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{variant.headline}</p><p className="mt-3 text-xs">{asset ? assetStateLabel(asset.state) : "Saved in library"}</p><Link className="mt-3 inline-block text-sm font-medium text-primary" href={`/app/library?asset=${encodeURIComponent(`creative:${variant.id}`)}`}>View in Library</Link></div></article>;
      })}</div></section>{selected && <aside className="surface h-fit p-5 2xl:sticky 2xl:top-6"><h2 className="text-lg font-medium">{selected.name}</h2><a href={selected.imageUrl} target="_blank" rel="noreferrer"><img src={selected.imageUrl} alt={selected.name} className="mt-4 max-h-96 w-full rounded-xl object-contain" /></a><p className="mt-4 font-medium">{selected.headline}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selected.primaryText}</p><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" onClick={copyPackage}><Copy className="mr-2 h-4 w-4" />Copy text</Button><Button variant="outline" disabled={download.isPending} onClick={exportCreative}><Download className="mr-2 h-4 w-4" />Export</Button></div><div className="mt-5 border-t pt-5"><p className="text-sm font-semibold">Saved in Asset Library</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Submit this version when ready. Approvals, change requests, and review comments are managed in the library.</p>{canCreate && selectedAsset && canSubmitAsset(selectedAsset.state) && <Button className="mt-4 w-full" disabled={submit.isPending} onClick={() => submit.mutate({ organizationId: organizationId!, key: selectedAsset.key, revision: selectedAsset.revision })}>Submit for Review</Button>}<Link className="mt-4 block text-center text-sm font-medium text-primary" href={`/app/library?asset=${encodeURIComponent(`creative:${selected.id}`)}`}>View in Library</Link></div></aside>}</div>}
    </div>
  </>;
}
export default function CreativesPage() { return <WorkspaceGate><CreativeStudio /></WorkspaceGate>; }
