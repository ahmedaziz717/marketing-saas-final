import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import {
  BRAND_PDF_MAX_BYTES,
  BRAND_VOICE_MAX_LENGTH,
} from "@shared/brandGuidelines";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function BrandGuidelineImport({
  organizationId,
  voice,
  onApply,
  disabled = false,
}: {
  organizationId: number;
  voice: string;
  onApply: (text: string) => void;
  disabled?: boolean;
}) {
  const extract = trpc.brand.extractGuidelines.useMutation();
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{
    name: string;
    text: string;
    pages: number;
  } | null>(null);
  const [mode, setMode] = useState<"append" | "replace">("append");
  const combined =
    mode === "replace"
      ? (draft?.text.trim() ?? "")
      : [voice.trim(), draft?.text.trim()].filter(Boolean).join("\n\n");
  const over = combined.length > BRAND_VOICE_MAX_LENGTH;
  const upload = async (file: File) => {
    const id = ++request.current;
    setError("");
    setDraft(null);
    setMode("append");
    if (
      !/\.pdf$/i.test(file.name) ||
      (file.type && file.type !== "application/pdf")
    ) {
      setError("Choose a PDF file.");
      return;
    }
    if (file.size > BRAND_PDF_MAX_BYTES) {
      setError("PDFs must be 8 MB or smaller.");
      return;
    }
    setReading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () =>
          reject(new Error("This file could not be opened. Try again."));
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const result = await extract.mutateAsync({
        organizationId,
        name: file.name.slice(0, 180),
        mimeType: "application/pdf",
        base64,
      });
      if (id === request.current) setDraft({ name: file.name, ...result });
    } catch (e) {
      if (id === request.current)
        setError(
          e instanceof Error ? e.message : "This PDF could not be read."
        );
    } finally {
      if (id === request.current) setReading(false);
    }
  };
  return (
    <div className="mt-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Import brand guidelines</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Text-based PDF · Up to 8 MB and 40 pages. Review the extracted text
            before adding it.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || reading}
          onClick={() => fileInput.current?.click()}
        >
          <FileUp className="h-4 w-4" />
          {reading ? "Reading PDF…" : "Upload PDF"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,application/pdf"
          aria-label="Brand guidelines PDF"
          className="sr-only"
          disabled={disabled || reading}
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </div>
      {reading && (
        <p className="mt-3 text-sm" role="status">
          Extracting document text…
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <section
          className="mt-4"
          aria-label="Review extracted brand guidelines"
        >
          <p className="text-sm font-medium">Review extracted text</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {draft.name} · {draft.pages} {draft.pages === 1 ? "page" : "pages"}.
            Your saved brand kit has not changed.
          </p>
          <Textarea
            className="mt-3 min-h-48"
            aria-label="Extracted brand guidelines"
            value={draft.text}
            disabled={disabled}
            onChange={e => setDraft({ ...draft, text: e.target.value })}
          />
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            Apply text
            <select
              aria-label="How to apply PDF text"
              className="rounded-md border bg-background p-2"
              value={mode}
              disabled={disabled}
              onChange={e => setMode(e.target.value as "append" | "replace")}
            >
              <option value="append">Add to current brand voice</option>
              <option value="replace">Replace current brand voice</option>
            </select>
          </label>
          <p
            className={`mt-2 text-xs ${over ? "text-destructive" : "text-muted-foreground"}`}
            role={over ? "alert" : undefined}
          >
            {combined.length.toLocaleString()} / 30,000 characters after
            applying.
            {over
              ? " Shorten the extracted text or choose Replace before applying."
              : " Save your brand kit after applying."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled || over || !draft.text.trim()}
              onClick={() => {
                onApply(combined);
                setDraft(null);
              }}
            >
              Use reviewed text
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                request.current++;
                setDraft(null);
                setError("");
              }}
            >
              Discard
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
