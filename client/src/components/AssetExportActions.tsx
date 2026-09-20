import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { LibraryAsset } from "@shared/assetLibrary";
import { toast } from "sonner";
export function AssetExportActions({ asset, organizationId }: { asset: LibraryAsset; organizationId: number }) {
  const download = trpc.creatives.download.useMutation();
  async function exportImage() {
    try {
      const file = await download.mutateAsync({ organizationId, variantId: Number(asset.key.split(":")[1]) });
      const bytes = Uint8Array.from(atob(file.base64), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      const link = document.createElement("a"); link.href = url; link.download = file.fileName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Export failed."); }
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(asset.copyText ?? [asset.headline, asset.primaryText].filter(Boolean).join("\n")); toast.success("Creative text copied"); }
    catch { toast.error("Copy is unavailable. Select and copy the text directly."); }
  }
  if (asset.origin !== "generated") return null;
  return <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={copyText}><Copy className="mr-2 h-4 w-4" />Copy text</Button><Button variant="outline" disabled={download.isPending} onClick={exportImage}><Download className="mr-2 h-4 w-4" />Export</Button></div>;
}
