import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import type { AssetState, LibraryAsset } from "@shared/assetLibrary";
import { mayApproveAndAdd, type UploadDisposition } from "@shared/assetWorkflow";
import { toast } from "sonner";
const types = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"] as const;
const fieldClass = "mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm";
async function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(new Error("File could not be read.")); reader.readAsDataURL(file); });
}
export function AssetUploadDialog({ open, onClose, organizationId, role, parent, defaultDisposition, onSaved, onComplete }: {
  open: boolean; onClose: () => void; organizationId: number; role: string;
  parent: LibraryAsset | null; defaultDisposition: "draft" | "submit";
  onSaved: () => Promise<unknown>; onComplete: (key: string, state: AssetState) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [purpose, setPurpose] = useState<"source" | "finished">("finished");
  const [sourceType, setSourceType] = useState<"logo" | "product" | "reference" | "other">("other");
  const [ugc, setUgc] = useState(false), [rights, setRights] = useState(false);
  const [disposition, setDisposition] = useState<UploadDisposition>(defaultDisposition);
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState("");
  const upload = trpc.assetLibrary.upload.useMutation();
  useEffect(() => { if (open) { setFiles([]); setPurpose(parent?.purpose ?? "finished"); setUgc(parent?.isUgc ?? false); setSourceType("other"); setRights(false); setProgress(""); setDisposition(parent ? "draft" : defaultDisposition); } }, [open, parent?.key, defaultDisposition]);
  useEffect(() => { const next = files.map(file => ({ file, url: URL.createObjectURL(file) })); setPreviews(next); return () => next.forEach(item => URL.revokeObjectURL(item.url)); }, [files]);
  async function save() {
    if (!files.length || busy) return;
    setBusy(true);
    const failed: File[] = [];
    let last: { key: string; state: AssetState } | null = null;
    for (let i = 0; i < files.length; i++) {
      const file = files[i]; setProgress(`Saving ${i + 1} of ${files.length}: ${file.name}`);
      try {
        if (!types.includes(file.type as (typeof types)[number])) throw new Error("Choose JPEG, PNG, WebP, GIF, MP4 or WebM.");
        const max = file.type.startsWith("video/") ? 20 : 12;
        if (file.size > max * 1024 * 1024) throw new Error(`Maximum file size is ${max} MB.`);
        last = await upload.mutateAsync({ organizationId, name: file.name.slice(0, 180), mimeType: file.type as (typeof types)[number], base64: await base64(file), purpose, sourceType, isUgc: ugc, usagePermissionConfirmed: rights, parentKey: parent?.key, disposition });
      } catch (error) { failed.push(file); toast.error(`${file.name}: ${error instanceof Error ? error.message : "Upload failed"}`); }
    }
    const count = files.length - failed.length;
    setFiles(failed); setBusy(false); setProgress(failed.length ? `${count} saved. ${failed.length} files need retrying.` : "");
    if (count) { await onSaved(); toast.success(disposition === "draft" ? `${count} saved in Content Studio. Not added to the library.` : disposition === "submit" ? `${count} submitted to the library for approval.` : `${count} approved and added to the library.`); }
    if (!failed.length && last) { onClose(); onComplete(last.key, last.state); }
  }
  const label = disposition === "draft" ? "Save draft in Studio" : disposition === "submit" ? "Submit for approval" : "Approve & add to library";
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-x-hidden overflow-y-auto"><DialogHeader className="min-w-0 pr-6"><DialogTitle>{parent ? "Prepare a revised version" : "Upload assets"}</DialogTitle><DialogDescription>{parent ? "The original stays unchanged. Preview the new version before choosing its next step." : "Preview and categorize your files. Selecting files alone does not add them to the library."}</DialogDescription></DialogHeader>
    <div className="min-w-0 space-y-4"><div><Label htmlFor="workflow-files">Choose files</Label><Input id="workflow-files" type="file" accept={types.join(",")} multiple={!parent} disabled={busy} className="mt-2" onChange={event => { const selected = Array.from(event.target.files ?? []); if (selected.length > 20) toast.error("Choose up to 20 files at a time."); setFiles(selected.slice(0, 20)); }} /><p className="mt-2 text-xs text-muted-foreground">Images up to 12 MB; MP4/WebM videos up to 20 MB each.</p></div>
      {!!previews.length && <div aria-label="Upload preview" className="grid max-h-56 grid-cols-2 gap-3 overflow-y-auto">{previews.map((item, i) => <div key={item.url} className="min-w-0 rounded-xl border p-2">{item.file.type.startsWith("video/") ? <video src={item.url} controls preload="metadata" className="h-24 w-full object-contain" /> : <img src={item.url} alt={`Preview ${i + 1}`} className="h-24 w-full object-contain" />}<p className="mt-2 truncate text-xs" title={item.file.name}>{item.file.name}</p></div>)}</div>}
      <div><Label htmlFor="workflow-purpose">Purpose</Label><select id="workflow-purpose" className={fieldClass} value={purpose} disabled={busy} onChange={event => setPurpose(event.target.value as typeof purpose)}><option value="finished">Finished image or video</option><option value="source">Brand / product source material</option></select></div>
      {purpose === "source" && <div><Label htmlFor="workflow-source">Source type</Label><select id="workflow-source" className={fieldClass} value={sourceType} disabled={busy} onChange={event => setSourceType(event.target.value as typeof sourceType)}><option value="other">Other</option><option value="logo">Logo</option><option value="product">Product image</option><option value="reference">Reference</option></select></div>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={ugc} disabled={busy} onChange={event => setUgc(event.target.checked)} />User-generated / creator content</label>
      {ugc && <label className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm"><input className="mt-1" type="checkbox" checked={rights} disabled={busy} onChange={event => setRights(event.target.checked)} />We have permission to use this content.</label>}
      <div><Label htmlFor="workflow-disposition">After upload</Label><select id="workflow-disposition" className={fieldClass} value={disposition} disabled={busy} onChange={event => setDisposition(event.target.value as UploadDisposition)}><option value="draft">Keep as a draft in Content Studio</option><option value="submit">Send to Asset Library for approval</option>{mayApproveAndAdd(role) && <option value="approve">Approve and add to Asset Library</option>}</select><p className="mt-2 text-xs leading-5 text-muted-foreground">{disposition === "draft" ? "Your work is saved, but stays out of the shared library until submitted." : disposition === "submit" ? "An authorized reviewer must approve the submitted version before use." : "You are explicitly approving these files. Nothing will be published."}</p></div>
      {progress && <p role="status" className="break-words text-sm">{progress}</p>}
      <Button className="h-auto w-full whitespace-normal py-3" disabled={busy || !files.length || (ugc && !rights)} onClick={() => void save()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{label}</Button>
    </div>
  </DialogContent></Dialog>;
}
