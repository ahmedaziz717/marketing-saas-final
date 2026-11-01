import { ActionCredits } from "./ActionCredits";
import { useState } from "react";
import { ScanSearch, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ScannedBrand = {
  name: string;
  colors: string[];
  fonts: string[];
  voice: string;
  logoUrls: string[];
};
export function BrandWebsiteScanner({
  organizationId,
  website,
  onApply,
  onClose,
}: {
  organizationId: number;
  website: string;
  onApply: (brand: ScannedBrand) => void;
  onClose: () => void;
}) {
  const [address, setAddress] = useState(website);
  const [selectedLogos, setSelectedLogos] = useState<string[]>([]);
  const scan = trpc.brand.scanWebsite.useMutation({
    onSuccess: result => setSelectedLogos(result.logoUrls.slice(0, 1)),
  });
  const result = scan.data;
  return (
    <section
      className="surface mb-6 space-y-5 p-6"
      aria-label="Website brand scan"
    >
      <div>
        <h2 className="text-xl font-semibold">
          Discover your brand from your website
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Find logos, colors, fonts, and suggested brand voice. Review the
          results before saving your brand kit.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={e => {
          e.preventDefault();
          scan.reset();
          scan.mutate({ organizationId, website: address });
        }}
      >
        <div className="min-w-0 flex-1 basis-64">
          <Label htmlFor="brand-website">Website address</Label>
          <Input
            id="brand-website"
            className="mt-2"
            placeholder="learnlikethis.com"
            value={address}
            onChange={e => setAddress(e.target.value)}
            disabled={scan.isPending}
            required
          />
        </div>
        <Button type="submit" disabled={scan.isPending || !address.trim()}>
          {scan.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="mr-2 h-4 w-4" />
          )}
          {scan.isPending ? "Scanning website…" : "Scan website"}{" "}
          <ActionCredits
            organizationId={organizationId}
            operation="brand.scanWebsite"
          />
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={scan.isPending}
        >
          Close
        </Button>
      </form>
      {scan.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Reading public website content and styles, then preparing a brand
          voice suggestion. This may take a minute.
        </p>
      )}
      {scan.error && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm">
          {scan.error.message}
        </p>
      )}
      {result && (
        <div className="space-y-5 border-t pt-5">
          <p className="break-all text-xs text-muted-foreground">
            Scanned: {result.sourceUrl}
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">Brand name</p>
              <p className="mt-1">{result.name || "Not detected"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">Detected fonts</p>
              <p className="mt-1">
                {result.fonts.join(", ") || "Not detected"}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-semibold">Detected palette</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {result.colors.length ? (
                  result.colors.map(c => (
                    <span key={c} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-8 w-8 rounded-full border"
                        style={{ background: c }}
                      />
                      {c}
                    </span>
                  ))
                ) : (
                  <p className="text-sm">Not detected</p>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-semibold">Suggested brand voice</p>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {result.voice || "Not enough evidence to suggest a voice."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Inferred from website copy; editable before saving.
              </p>
            </div>
          </div>
          {!!result.logoUrls.length && (
            <div>
              <p className="mb-3 text-sm font-semibold">
                Choose logos to import
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {result.logoUrls.map((url, index) => (
                  <label
                    key={url}
                    className="min-w-0 cursor-pointer rounded-xl border p-3"
                  >
                    <div className="grid h-24 place-items-center rounded-lg bg-muted/50 p-2">
                      <img
                        src={url}
                        alt={`Detected logo ${index + 1}`}
                        className="max-h-20 max-w-full object-contain"
                        referrerPolicy="no-referrer"
                        onError={e => {
                          e.currentTarget.alt =
                            "Preview unavailable — try another logo or upload manually";
                        }}
                      />
                    </div>
                    <span className="mt-3 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedLogos.includes(url)}
                        onChange={e =>
                          setSelectedLogos(current =>
                            e.target.checked
                              ? [...current, url]
                              : current.filter(item => item !== url)
                          )
                        }
                      />
                      Logo {index + 1}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Imported logos go to Asset Library for review before creative
                use.
              </p>
            </div>
          )}
          {!!result.warnings.length && (
            <ul
              className="space-y-1 rounded-xl bg-muted p-4 text-sm"
              role="status"
            >
              {result.warnings.map(w => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <Button
            onClick={() =>
              onApply({
                name: result.name,
                colors: result.colors,
                fonts: result.fonts,
                voice: result.voice,
                logoUrls: selectedLogos,
              })
            }
          >
            Use scanned details
          </Button>
          <p className="text-xs text-muted-foreground">
            Missing details keep your current values. Required claims,
            prohibited content, and your business profile stay as you set them.
          </p>
        </div>
      )}
    </section>
  );
}
