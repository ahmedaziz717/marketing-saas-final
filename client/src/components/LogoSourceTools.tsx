import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AssetUploadDialog } from "./AssetUploadDialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function LogoSourceTools({
  organizationId,
  role,
  upload = true,
  onChanged,
}: {
  organizationId: number;
  role: string;
  upload?: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scan = trpc.brand.discoverDriveLogos.useMutation();
  const add = trpc.brand.importDriveLogos.useMutation();
  if (!["owner", "admin", "creator"].includes(role)) return null;
  return (
    <div className="my-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {upload && (
          <Button variant="outline" onClick={() => setUploadOpen(true)}>
            Upload logos
          </Button>
        )}
        <Button variant="outline" onClick={() => setDriveOpen(!driveOpen)}>
          Import logos from Google Drive
        </Button>
      </div>
      {driveOpen && (
        <section
          className="space-y-3 rounded-lg border p-3"
          aria-label="Google Drive logo import"
        >
          <label className="block text-sm">
            Shared Drive file or folder link
            <Input
              className="mt-1"
              type="url"
              value={url}
              placeholder="https://drive.google.com/drive/folders/…"
              onChange={e => {
                setUrl(e.target.value);
                setSelected([]);
                scan.reset();
                setNotice("");
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Use an “Anyone with the link” file or folder. Scans up to 50 image
            files in that folder; nested folders and private Drive files are not
            included.
          </p>
          <Button
            variant="outline"
            disabled={!url || scan.isPending || add.isPending}
            onClick={async () => {
              setError("");
              setNotice("");
              setSelected([]);
              try {
                await scan.mutateAsync({ organizationId, url });
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not scan this Drive link."
                );
              }
            }}
          >
            {scan.isPending ? "Scanning…" : "Scan for logos"}
          </Button>
          {scan.data && (
            <div className="space-y-2">
              {scan.data.map(file => (
                <label
                  key={file.url}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(file.url)}
                    disabled={
                      add.isPending ||
                      (!selected.includes(file.url) && selected.length >= 20)
                    }
                    onChange={e =>
                      setSelected(
                        e.target.checked
                          ? [...selected, file.url]
                          : selected.filter(url => url !== file.url)
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <a
                    href={file.viewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    View file
                  </a>
                </label>
              ))}
              <Button
                disabled={!selected.length || add.isPending}
                onClick={async () => {
                  setError("");
                  try {
                    const result = await add.mutateAsync({
                      organizationId,
                      urls: selected,
                    });
                    await onChanged();
                    setNotice(
                      `${result.imported} logos added for review.${result.failed.length ? ` ${result.failed.length} files could not be imported; check their sharing and image format.` : " Existing imports are kept without duplicates."}`
                    );
                    setSelected([]);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not import these logos."
                    );
                  }
                }}
              >
                {add.isPending
                  ? "Importing…"
                  : `Import selected logos (${selected.length})`}
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
        </section>
      )}
      {upload && (
        <AssetUploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          organizationId={organizationId}
          role={role}
          parent={null}
          defaultDisposition="draft"
          defaultPurpose="source"
          defaultSourceType="logo"
          mediaFilter="image"
          onSaved={onChanged}
          onComplete={() => setUploadOpen(false)}
        />
      )}
    </div>
  );
}
