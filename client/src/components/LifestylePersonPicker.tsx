import { useState } from "react";
import { Link } from "wouter";
import {
  HAIR_COLORS,
  findLifestylePerson,
  personOptions,
  type LifestylePerson,
} from "@shared/lifestylePeople";
import type { CreativeSetup } from "@shared/creativeBuilder";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function PersonPortrait({ person }: { person: LifestylePerson }) {
  return (
    <div
      role="img"
      aria-label={person.name}
      className="aspect-square w-full rounded-lg bg-muted"
      style={{
        backgroundImage: `url(${person.sheet})`,
        backgroundSize: "500% 200%",
        backgroundPosition: `${person.column * 25}% ${person.row * 100}%`,
      }}
    />
  );
}
export function LifestylePersonPicker({
  setup,
  onChange,
}: {
  setup: CreativeSetup;
  onChange: (setup: CreativeSetup) => void;
}) {
  const { organizationId } = useWorkspace();
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState("library");
  const [confirmed, setConfirmed] = useState(false);
  const [upload, setUpload] = useState<{ name: string; base64: string } | null>(
    null
  );
  const people = trpc.creativeBuilder.people.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );
  const save = trpc.creativeBuilder.savePerson.useMutation({
    onSuccess: data => {
      void people.refetch();
      toast.success(
        data.status === "pending"
          ? "Portrait uploaded. Approve it in Brand before use."
          : "Person saved to Brand Assets"
      );
      setUpload(null);
    },
    onError: e => toast.error(e.message),
  });
  const gender = setup.shot === "male" ? "male" : "female";
  const hair = setup.personHair || "any";
  const selected =
    setup.person?.kind === "library"
      ? findLifestylePerson(setup.person.id)
      : null;
  const selectedAsset =
    setup.person?.kind === "asset"
      ? people.data?.find(
          p => p.id === (setup.person as { assetId: number }).assetId
        )
      : null;
  const options = personOptions(gender, hair, page);
  return (
    <div className="mt-5 rounded-xl border p-4 sm:p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-semibold">Person / Model</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose who appears. Describe the scene and pose in Creative
            Direction.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange({ ...setup, person: null })}
        >
          Let AI choose
        </Button>
      </div>
      {setup.person && (
        <div className="my-4 flex items-center gap-4 rounded-xl bg-primary/5 p-3">
          <div className="w-24 shrink-0">
            {selected ? (
              <PersonPortrait person={selected} />
            ) : selectedAsset ? (
              <img
                className="aspect-square w-full rounded-lg object-cover"
                src={selectedAsset.url}
                alt={selectedAsset.name}
              />
            ) : (
              <div className="text-sm">Saved reference</div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Selected person · pinned
            </p>
            <p className="mt-1 text-sm">
              {selected?.name ||
                selectedAsset?.name ||
                "Saved person reference"}
            </p>
            {selected && (
              <Button
                type="button"
                variant="ghost"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    organizationId: organizationId!,
                    libraryId: selected.id,
                    name: selected.name,
                    gender,
                  })
                }
              >
                Save favorite to Brand
              </Button>
            )}
          </div>
        </div>
      )}
      <div
        className="my-4 flex flex-wrap gap-2"
        role="group"
        aria-label="Person sources"
      >
        {["library", "saved", "upload"].map(t => (
          <Button
            key={t}
            type="button"
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
          >
            {t === "library"
              ? "AI portrait library"
              : t === "saved"
                ? "Saved people"
                : "Upload reference"}
          </Button>
        ))}
      </div>
      {tab === "library" && (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <label className="text-sm">
              Hair color
              <select
                className="ml-3 rounded-lg border bg-background p-2"
                value={hair}
                onChange={e => {
                  setPage(0);
                  onChange({
                    ...setup,
                    personHair: e.target.value as CreativeSetup["personHair"],
                  });
                }}
              >
                <option value="any">Any</option>
                {HAIR_COLORS.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPage(p => p + 1)}
            >
              Refresh options
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {options.map(person => (
              <button
                key={person.id}
                type="button"
                aria-pressed={selected?.id === person.id}
                onClick={() =>
                  onChange({
                    ...setup,
                    person: { kind: "library", id: person.id },
                  })
                }
                className={`rounded-xl border-2 p-1 text-left ${selected?.id === person.id ? "border-primary" : "border-transparent hover:border-primary/40"}`}
              >
                <PersonPortrait person={person} />
                <span className="mt-2 block px-1 text-xs">{person.name}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Fictional AI-generated adults. Refresh cycles through matching
            portraits without generating new images. Filters change the options,
            not your pinned selection.
          </p>
        </>
      )}
      {tab === "saved" && (
        <>
          {people.isLoading && <p>Loading saved people…</p>}
          {people.error && (
            <p role="alert">
              Unable to load saved people.{" "}
              <button type="button" onClick={() => people.refetch()}>
                Retry
              </button>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {people.data
              ?.filter(p => p.gender === gender)
              .map(person => (
                <button
                  type="button"
                  key={person.id}
                  disabled={person.status !== "approved"}
                  className="rounded-xl border p-2 text-left disabled:opacity-50"
                  aria-pressed={
                    setup.person?.kind === "asset" &&
                    setup.person.assetId === person.id
                  }
                  onClick={() =>
                    onChange({
                      ...setup,
                      person: { kind: "asset", assetId: person.id },
                    })
                  }
                >
                  <img
                    src={person.url}
                    alt={person.name}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                  <span className="mt-2 block text-xs">
                    {person.name} · {person.status}
                  </span>
                </button>
              ))}
          </div>
          {people.data && !people.data.some(p => p.gender === gender) && (
            <p className="text-sm text-muted-foreground">
              No saved people for this lifestyle setting yet.
            </p>
          )}
          <Link
            className="mt-3 inline-block text-sm text-primary underline"
            href="~/app/brand"
          >
            Manage and approve references in Brand
          </Link>
        </>
      )}
      {tab === "upload" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a clear portrait of one adult. JPG, PNG, or WebP, up to 6 MB.
            Uploads require Brand approval before generation.
          </p>
          <Input
            type="file"
            aria-label="Person reference image"
            accept="image/jpeg,image/png,image/webp"
            onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (
                file.size > 6 * 1024 * 1024 ||
                !["image/jpeg", "image/png", "image/webp"].includes(file.type)
              ) {
                toast.error("Choose a JPG, PNG, or WebP under 6 MB");
                return;
              }
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(file);
              }).catch(() => "");
              if (!base64) {
                toast.error("Could not read the image");
                return;
              }
              setUpload({ name: file.name.slice(0, 120), base64 });
              setConfirmed(false);
            }}
          />
          {upload && (
            <img
              src={upload.base64}
              alt="Person reference upload preview"
              className="h-32 w-32 rounded-xl object-cover"
            />
          )}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
            />
            I confirm this person is an adult and I have permission to use this
            image in advertising.
          </label>
          <Button
            type="button"
            disabled={!upload || !confirmed || save.isPending}
            onClick={() =>
              upload &&
              save.mutate({
                organizationId: organizationId!,
                gender,
                name:
                  upload.name.length >= 2 ? upload.name : "Person reference",
                base64: upload.base64,
                permissionConfirmed: confirmed,
              })
            }
          >
            {save.isPending ? "Uploading…" : "Upload for approval"}
          </Button>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        The selected portrait is sent with the product and logo to help preserve
        identity across sizes. Generated appearances may vary.
      </p>
    </div>
  );
}
