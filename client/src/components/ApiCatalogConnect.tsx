import { ActionCredits } from "./ActionCredits";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  API_CATALOG_FIELDS,
  type ApiCatalogConfig,
  type ApiInstructionFile,
} from "@shared/apiCatalog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function ApiCatalogConnect({
  organizationId,
  onConnected,
}: {
  organizationId: number;
  onConnected: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="surface p-6">
        <h4 className="font-semibold">API endpoint</h4>
        <p className="my-3 text-sm text-muted-foreground">
          Import a public or authenticated JSON catalog. Add instructions only
          if the feed needs explanation.
        </p>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Connect API endpoint
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect a catalog API</DialogTitle>
            <DialogDescription>
              A public JSON feed usually needs only its URL. Preview the
              products before importing them for review.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ApiCatalogForm
              organizationId={organizationId}
              onConnected={async () => {
                await onConnected();
                setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApiCatalogForm({
  organizationId,
  onConnected,
}: {
  organizationId: number;
  onConnected: () => Promise<void>;
}) {
  const [endpoint, setEndpoint] = useState("");
  const [config, setConfig] = useState<ApiCatalogConfig>({
    auth: { type: "none" },
    itemsPath: "",
    nextPath: "",
    fields: {},
    notes: "",
  });
  const [files, setFiles] = useState<ApiInstructionFile[]>([]);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [verified, setVerified] = useState("");
  const preview = trpc.catalogSources.previewApi.useMutation();
  const connect = trpc.catalogSources.connect.useMutation();
  const busy = reading || preview.isPending || connect.isPending;
  const signature = (value = config) =>
    JSON.stringify({ endpoint, config: value });
  async function addFiles(incoming: File[]) {
    setReading(true);
    setError("");
    setVerified("");
    try {
      if (files.length + incoming.length > 3)
        throw new Error("Attach up to three files.");
      const next: ApiInstructionFile[] = [];
      for (const file of incoming) {
        const mimeType = /\.md$/i.test(file.name)
          ? "text/markdown"
          : /\.json$/i.test(file.name)
            ? "application/json"
            : /\.txt$/i.test(file.name)
              ? "text/plain"
              : file.type;
        if (
          ![
            "image/png",
            "image/jpeg",
            "image/webp",
            "application/pdf",
            "text/plain",
            "text/markdown",
            "application/json",
          ].includes(mimeType)
        )
          throw new Error(
            "Use PNG, JPG, WebP, PDF, TXT, Markdown or JSON. Export Word documents as PDF."
          );
        if (file.size > 4 * 1024 * 1024)
          throw new Error("Each attachment must be 4 MB or smaller.");
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("File could not be read."));
          reader.readAsDataURL(file);
        });
        next.push({
          name: file.name,
          mimeType: mimeType as ApiInstructionFile["mimeType"],
          base64,
        });
      }
      if (
        [...files, ...next].reduce((n, f) => n + f.base64.length * 0.75, 0) >
        6 * 1024 * 1024
      )
        throw new Error("Attachments must total 6 MB or less.");
      setFiles([...files, ...next]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach files.");
    } finally {
      setReading(false);
    }
  }
  return (
    <div className="space-y-4">
      <label className="block text-sm">
        API endpoint
        <Input
          className="mt-1"
          type="url"
          placeholder="https://example.com/api/products"
          value={endpoint}
          onChange={e => setEndpoint(e.target.value)}
          autoComplete="off"
        />
      </label>
      <label className="block text-sm">
        Authentication
        <select
          className="mt-1 w-full rounded border bg-background p-2"
          value={config.auth.type}
          onChange={e => {
            const type = e.target.value;
            setConfig({
              ...config,
              auth:
                type === "basic"
                  ? { type, username: "", password: "" }
                  : type === "bearer"
                    ? { type, token: "" }
                    : type === "header"
                      ? { type, name: "X-API-Key", value: "" }
                      : { type: "none" },
            });
          }}
        >
          <option value="none">None · public endpoint</option>
          <option value="basic">Username and password</option>
          <option value="bearer">Bearer token</option>
          <option value="header">API key header</option>
        </select>
      </label>
      {config.auth.type === "basic" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Username
            <Input
              autoComplete="off"
              value={config.auth.username}
              onChange={e => {
                if (config.auth.type === "basic")
                  setConfig({
                    ...config,
                    auth: { ...config.auth, username: e.target.value },
                  });
              }}
            />
          </label>
          <label className="text-sm">
            Password
            <Input
              type="password"
              autoComplete="new-password"
              value={config.auth.password}
              onChange={e => {
                if (config.auth.type === "basic")
                  setConfig({
                    ...config,
                    auth: { ...config.auth, password: e.target.value },
                  });
              }}
            />
          </label>
        </div>
      )}
      {config.auth.type === "bearer" && (
        <label className="block text-sm">
          Bearer token
          <Input
            type="password"
            autoComplete="new-password"
            value={config.auth.token}
            onChange={e => {
              if (config.auth.type === "bearer")
                setConfig({
                  ...config,
                  auth: { ...config.auth, token: e.target.value },
                });
            }}
          />
        </label>
      )}
      {config.auth.type === "header" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Header name
            <Input
              value={config.auth.name}
              onChange={e => {
                if (config.auth.type === "header")
                  setConfig({
                    ...config,
                    auth: { ...config.auth, name: e.target.value },
                  });
              }}
            />
          </label>
          <label className="text-sm">
            API key
            <Input
              type="password"
              autoComplete="new-password"
              value={config.auth.value}
              onChange={e => {
                if (config.auth.type === "header")
                  setConfig({
                    ...config,
                    auth: { ...config.auth, value: e.target.value },
                  });
              }}
            />
          </label>
        </div>
      )}
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Instructions & attachments · optional
        </summary>
        <label className="mt-3 block text-sm">
          Explain your API
          <textarea
            className="mt-1 min-h-28 w-full rounded border bg-background p-2"
            maxLength={12000}
            value={config.notes}
            placeholder="For example: products are in data.items; use details.url as the product link. Paste an instruction screenshot here, or attach a document below."
            onChange={e => setConfig({ ...config, notes: e.target.value })}
            onPaste={e => {
              const pasted = Array.from(e.clipboardData.files);
              if (pasted.length) {
                e.preventDefault();
                void addFiles(pasted);
              }
            }}
          />
        </label>
        <label className="mt-3 block text-sm">
          Attach instructions or screenshots
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            multiple
            disabled={busy}
            accept=".pdf,.txt,.md,.json,image/png,image/jpeg,image/webp"
            onChange={e => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
        {files.map((file, i) => (
          <div
            key={i}
            className="mt-2 flex items-center justify-between gap-2 text-sm"
          >
            <span className="truncate">{file.name}</span>
            <button
              type="button"
              className="underline"
              onClick={() => {
                setFiles(files.filter((_, n) => n !== i));
                setVerified("");
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <p className="mt-2 text-xs text-muted-foreground">
          PDF, TXT, Markdown, JSON or images. Up to 3 files; 4 MB each, 6 MB
          total. AI reads these as reference material to suggest field mappings.
          Keep passwords and API keys in the authentication fields. EvokeLoop
          does not store instruction files.
        </p>
      </details>
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Field mapping · automatic unless specified
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["itemsPath", "nextPath"] as const).map(key => (
            <label key={key} className="text-sm">
              {key === "itemsPath"
                ? "Product array path"
                : "Next-page URL path"}
              <Input
                value={config[key]}
                placeholder={
                  key === "itemsPath" ? "data.products" : "links.next"
                }
                onChange={e => setConfig({ ...config, [key]: e.target.value })}
              />
            </label>
          ))}
          {API_CATALOG_FIELDS.map(key => (
            <label key={key} className="text-sm">
              {key}
              <Input
                value={config.fields[key] ?? ""}
                placeholder="Automatic"
                onChange={e =>
                  setConfig({
                    ...config,
                    fields: { ...config.fields, [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Read-only GET JSON endpoints. Pagination follows same-origin next-page
          URLs; up to 200 pages. Cursor tokens and POST/GraphQL APIs need a
          dedicated connector.
        </p>
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        disabled={!endpoint || busy}
        onClick={async () => {
          setError("");
          setVerified("");
          try {
            const result = await preview.mutateAsync({
              organizationId,
              endpoint,
              config,
              files,
              interpretInstructions: !!config.notes.trim() || !!files.length,
            });
            const next = { ...config, ...result.mapping };
            setConfig(next);
            setVerified(signature(next));
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not preview this catalog."
            );
          }
        }}
      >
        {preview.isPending
          ? "Reading catalog…"
          : config.notes.trim() || files.length
            ? "Read instructions & preview products"
            : "Preview products"}
        {(!!config.notes.trim() || !!files.length) && (
          <ActionCredits
            organizationId={organizationId}
            operation="catalogSources.previewApi"
          />
        )}
      </Button>
      {preview.data && verified === signature() && (
        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">
            {preview.data.count} products on this page
            {preview.data.hasNext ? " · more pages available" : ""}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {preview.data.samples.map((sample, i) => (
              <li key={i}>
                {sample.name}
                {sample.sku ? ` · ${sample.sku}` : ""}
                {sample.price ? ` · ${sample.currency} ${sample.price}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Imports are saved for review. Credentials are encrypted; requests
            are limited to public HTTPS addresses.
          </p>
        </div>
      )}
      <Button
        className="w-full"
        disabled={
          busy || !verified || verified !== signature() || !preview.data?.count
        }
        onClick={async () => {
          setError("");
          try {
            await connect.mutateAsync({
              organizationId,
              provider: "api",
              storeUrl: endpoint,
              api: config,
            });
            await onConnected();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not connect this API."
            );
          }
        }}
      >
        {connect.isPending ? "Connecting…" : "Connect and import catalog"}
      </Button>
    </div>
  );
}
