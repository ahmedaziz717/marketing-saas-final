import { useState } from "react";
import { catalogEntrySchema, type CatalogEntry } from "@shared/catalog";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { toast } from "sonner";
export function CatalogEntryForm({
  organizationId,
  onSaved,
}: {
  organizationId: number;
  onSaved: () => void;
}) {
  const [entry, setEntry] = useState<CatalogEntry>({
    ...catalogEntrySchema.parse({
      name: "Item",
      productUrl: "https://example.com",
    }),
    name: "",
    productUrl: "",
  });
  const [specs, setSpecs] = useState("");
  const save = trpc.catalogSources.addEntries.useMutation({
    onSuccess: r => {
      if (r[0]?.error) toast.error(r[0].error);
      else {
        toast.success("Saved for review");
        onSaved();
      }
    },
    onError: e => toast.error(e.message),
  });
  const field = (
    key:
      | "name"
      | "description"
      | "productUrl"
      | "sku"
      | "category"
      | "price"
      | "currency"
      | "imageUrl",
    label: string
  ) => (
    <div key={key}>
      <Label htmlFor={"entry-" + key}>{label}</Label>
      <Input
        id={"entry-" + key}
        value={entry[key]}
        onChange={e => setEntry({ ...entry, [key]: e.target.value })}
      />
    </div>
  );
  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault();
        save.mutate({
          organizationId,
          entries: [
            {
              ...entry,
              specifications: Object.fromEntries(
                specs
                  .split("\n")
                  .filter(s => s.includes(":"))
                  .map(s => [
                    s.slice(0, s.indexOf(":")).trim(),
                    s.slice(s.indexOf(":") + 1).trim(),
                  ])
              ),
            },
          ],
        });
      }}
    >
      <Label htmlFor="entry-type">What are you offering?</Label>
      <select
        id="entry-type"
        className="w-full rounded-lg border p-3"
        value={entry.recordType}
        onChange={e =>
          setEntry({
            ...entry,
            recordType: e.target.value as "service" | "standalone",
            serviceDetails:
              e.target.value === "service"
                ? {
                    pricing: "quote",
                    duration: "",
                    area: "",
                    delivery: "both",
                    packages: "",
                    cta: "Get a quote",
                  }
                : null,
          })
        }
      >
        <option value="standalone">Product</option>
        <option value="service">Service</option>
      </select>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Name")}
        {field("category", "Category")}
        {field(
          "productUrl",
          entry.recordType === "service"
            ? "Booking or inquiry URL"
            : "Product URL"
        )}
        {field("sku", "SKU / reference (optional)")}
        {field("price", "Price (optional)")}
        {field("currency", "Currency, e.g. USD")}
        {field("imageUrl", "Image URL (optional)")}
      </div>
      {entry.imageUrl && (
        <img
          src={entry.imageUrl}
          alt="Selected image preview"
          className="h-28 w-28 rounded-xl object-contain"
        />
      )}
      <Label htmlFor="entry-description">Description and benefits</Label>
      <Textarea
        id="entry-description"
        value={entry.description}
        onChange={e => setEntry({ ...entry, description: e.target.value })}
      />
      {entry.serviceDetails && (
        <div className="grid gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-2">
          {(["pricing", "delivery", "cta"] as const).map(key => (
            <div key={key}>
              <Label htmlFor={"service-" + key}>
                {key === "cta"
                  ? "Call to action"
                  : key === "pricing"
                    ? "Pricing model"
                    : "Delivery"}
              </Label>
              <select
                id={"service-" + key}
                className="w-full rounded-lg border p-2"
                value={entry.serviceDetails![key]}
                onChange={e =>
                  setEntry({
                    ...entry,
                    serviceDetails: {
                      ...entry.serviceDetails!,
                      [key]: e.target.value,
                    } as typeof entry.serviceDetails,
                  })
                }
              >
                {(key === "pricing"
                  ? ["fixed", "starting_at", "hourly", "recurring", "quote"]
                  : key === "delivery"
                    ? ["onsite", "remote", "both"]
                    : ["Book now", "Get a quote", "Contact us", "Learn more"]
                ).map(v => (
                  <option key={v} value={v}>
                    {v.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {(["duration", "area", "packages"] as const).map(key => (
            <div key={key}>
              <Label htmlFor={"service-" + key}>
                {key === "area"
                  ? "Service area"
                  : key === "duration"
                    ? "Duration"
                    : "Packages"}
              </Label>
              <Input
                id={"service-" + key}
                value={entry.serviceDetails![key]}
                onChange={e =>
                  setEntry({
                    ...entry,
                    serviceDetails: {
                      ...entry.serviceDetails!,
                      [key]: e.target.value,
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      )}
      <Label htmlFor="entry-specifications">
        Specifications or service facts (name: value, one per line)
      </Label>
      <Textarea
        id="entry-specifications"
        value={specs}
        onChange={e => setSpecs(e.target.value)}
      />
      <Button disabled={save.isPending} type="submit">
        {save.isPending ? "Saving…" : "Save for review"}
      </Button>
    </form>
  );
}
