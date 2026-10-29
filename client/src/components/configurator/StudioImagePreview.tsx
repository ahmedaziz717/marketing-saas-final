import { Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function StudioImagePreview({
  url,
  title,
}: {
  url: string;
  title: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="cfg-result-expand"
          aria-label={`Enlarge ${title}`}
        >
          <img src={url} alt={title} />
          <span className="cfg-result-expand-hint" aria-hidden="true">
            <Maximize2 size={16} />
            Enlarge
          </span>
        </button>
      </DialogTrigger>
      <DialogContent
        className="cfg-asset-lightbox"
        aria-describedby={undefined}
      >
        <DialogTitle className="cfg-asset-lightbox-title">{title}</DialogTitle>
        <img src={url} alt={title} className="cfg-asset-lightbox-image" />
      </DialogContent>
    </Dialog>
  );
}
