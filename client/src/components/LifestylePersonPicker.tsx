import { useState } from "react";
import { Link } from "wouter";
import { Check, Search, UsersRound, X } from "lucide-react";
import {
  HAIR_COLORS,
  MODEL_AGES,
  LIFESTYLE_PEOPLE,
  findLifestylePerson,
  filterLifestylePeople,
  modelMatchesShot,
  isChildModel,
  type LifestylePerson,
  type ModelAge,
} from "@shared/lifestylePeople";
import {
  selectedPeople,
  personReferenceKey,
  type CreativeSetup,
  type PersonReference,
} from "@shared/creativeBuilder";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export function PersonPortrait({ person }: { person: LifestylePerson }) {
  return (
    <div
      role="img"
      aria-label={person.name}
      className="aspect-square w-full rounded-lg bg-muted"
      style={{
        backgroundImage: `url(${person.sheet})`,
        backgroundSize: `${person.columns * 100}% ${person.rows * 100}%`,
        backgroundPosition: `${(person.column * 100) / (person.columns - 1)}% ${(person.row * 100) / (person.rows - 1)}%`,
      }}
    />
  );
}
const selectClass =
  "mt-1 h-10 w-full min-w-0 rounded-lg border bg-background px-2 text-sm";
const pageSize = 24;
export function LifestylePersonPicker({
  setup,
  onChange,
}: {
  setup: CreativeSetup;
  onChange: (setup: CreativeSetup) => void;
}) {
  const { organizationId } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<PersonReference[]>([]);
  const [tab, setTab] = useState("library");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("any");
  const [age, setAge] = useState("any");
  const [hair, setHair] = useState("any");
  const [uploadGender, setUploadGender] = useState<"male" | "female">(
    setup.shot === "male" ? "male" : "female"
  );
  const [uploadAge, setUploadAge] = useState<ModelAge>(
    setup.shot === "child" ? "child" : "adult_unspecified"
  );
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
          ? "Portrait uploaded. Approve it in Asset Library before use."
          : "Model saved to Brand Assets"
      );
      setUpload(null);
      setConfirmed(false);
    },
    onError: e => toast.error(e.message),
  });
  const selected = selectedPeople(setup);
  const limit = 4;
  function assetFor(ref: PersonReference) {
    return ref.kind === "asset"
      ? people.data?.find(p => p.id === ref.assetId)
      : undefined;
  }
  function libraryFor(ref: PersonReference) {
    const id = ref.kind === "library" ? ref.id : assetFor(ref)?.libraryId;
    return typeof id === "string" ? findLifestylePerson(id) : undefined;
  }
  function identity(ref: PersonReference) {
    const model = libraryFor(ref);
    return model ? `library:${model.id}` : personReferenceKey(ref);
  }
  function name(ref: PersonReference) {
    return assetFor(ref)?.name || libraryFor(ref)?.name || "Saved model";
  }
  function portrait(ref: PersonReference) {
    const model = libraryFor(ref),
      asset = assetFor(ref);
    return model ? (
      <PersonPortrait person={model} />
    ) : asset ? (
      <img
        src={asset.url}
        alt={asset.name}
        loading="lazy"
        className="aspect-square w-full rounded-lg object-cover"
      />
    ) : (
      <div className="flex aspect-square items-center justify-center rounded-lg bg-muted">
        <UsersRound aria-label="Saved model" />
      </div>
    );
  }
  function apply(next: PersonReference[]) {
    // The existing group setting supports one to four people. Keep old saved
    // single-person references until the user applies a new selection.
    onChange({ ...setup, shot: "multiple", person: null, people: next });
  }
  function toggle(ref: PersonReference) {
    setDraft(current => {
      const exists = current.some(p => identity(p) === identity(ref));
      if (exists) return current.filter(p => identity(p) !== identity(ref));
      return current.length < limit ? [...current, ref] : current;
    });
  }
  function resetFilters() {
    setSearch("");
    setGender("any");
    setAge("any");
    setHair("any");
    setPage(0);
  }
  const matches = filterLifestylePeople({
    shot: "multiple",
    gender,
    age,
    hair,
    search,
  });
  const savedMatches =
    people.data?.filter(p => {
      const ref: PersonReference = { kind: "asset", assetId: p.id };
      const model = libraryFor(ref);
      return (
        modelMatchesShot(model ?? p, "multiple") &&
        (gender === "any" || p.gender === gender) &&
        (age === "any" || (model?.age ?? p.age) === age) &&
        (hair === "any" || model?.hair === hair) &&
        (!search.trim() ||
          `${p.name} ${model?.id ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()))
      );
    }) ?? [];
  const entries =
    tab === "library"
      ? matches.map(p => ({
          ref: { kind: "library", id: p.id } as PersonReference,
          age: p.age,
          status: "approved",
        }))
      : savedMatches.map(p => ({
          ref: { kind: "asset", assetId: p.id } as PersonReference,
          age: libraryFor({ kind: "asset", assetId: p.id })?.age ?? p.age,
          status: p.status,
        }));
  const pages = Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className="mt-5 rounded-xl border border-violet-200 bg-violet-50/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <UsersRound className="h-5 w-5 text-violet-600" />
            Models
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose one to four people for your scene. Describe the scene and
            pose in Creative Direction.
          </p>
        </div>
        {selected.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => apply([])}>
            Let AI choose
          </Button>
        )}
      </div>
      {selected.length > 0 ? (
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {selected.map(ref => (
            <div
              key={personReferenceKey(ref)}
              className="relative rounded-xl border bg-background p-2"
            >
              <button
                type="button"
                aria-label={`Remove ${name(ref)}`}
                className="absolute right-3 top-3 z-10 rounded-full border bg-background p-1 shadow-sm"
                onClick={() =>
                  apply(
                    selected.filter(
                      p => personReferenceKey(p) !== personReferenceKey(ref)
                    )
                  )
                }
              >
                <X className="h-4 w-4" />
              </button>
              {portrait(ref)}
              <p className="mt-2 text-sm font-medium">{name(ref)}</p>
              {libraryFor(ref) && (
                <button
                  type="button"
                  className="mt-1 text-xs text-violet-700 underline disabled:opacity-50"
                  disabled={save.isPending}
                  onClick={() => {
                    const model = libraryFor(ref)!;
                    save.mutate({
                      organizationId: organizationId!,
                      libraryId: model.id,
                      name: model.name,
                      gender: model.gender,
                      age: model.age,
                    });
                  }}
                >
                  Save to favorites
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="my-4 text-sm text-muted-foreground">
          {setup.shot === "multiple"
            ? "AI will choose two adults unless you select one or more models."
            : setup.shot === "child"
              ? "AI will choose an age-appropriate child model."
              : "AI will choose a model unless you select one."}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className="gap-2 bg-background"
        onClick={() => {
          setDraft([...selected]);
          setOpen(true);
        }}
      >
        <UsersRound className="h-4 w-4" />
        Browse {LIFESTYLE_PEOPLE.length} models
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        Fictional AI models, including kids, teens and adults. Selected
        identities are used across sizes; generated appearances may vary.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[90dvh] max-h-[900px] min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left sm:px-6">
            <DialogTitle>Choose your models</DialogTitle>
            <DialogDescription>
              {LIFESTYLE_PEOPLE.length} fictional portraits. Select one to four
              people.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
            <div
              role="group"
              aria-label="Model sources"
              className="grid grid-cols-3 gap-2 py-3 sm:flex"
            >
              {[
                ["library", "Model library"],
                ["saved", "Saved people"],
                ["upload", "Upload reference"],
              ].map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  variant={tab === id ? "default" : "outline"}
                  aria-label={label}
                  className="min-w-0 px-2 text-xs sm:px-4 sm:text-sm"
                  aria-pressed={tab === id}
                  onClick={() => {
                    setTab(id);
                    setPage(0);
                  }}
                >
                  <span className="sm:hidden">
                    {id === "library"
                      ? "Library"
                      : id === "saved"
                        ? "Saved"
                        : "Upload"}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </Button>
              ))}
            </div>
            {tab !== "upload" ? (
              <>
                <div className="rounded-xl bg-muted/50 p-3">
                  <div className="flex items-end gap-2">
                    <label className="min-w-0 flex-1 text-xs font-medium">
                      Search models
                      <div className="relative mt-1">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Name or number"
                          value={search}
                          onChange={e => {
                            setSearch(e.target.value);
                            setPage(0);
                          }}
                        />
                      </div>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      className="sm:hidden"
                      aria-label="Model filters"
                      aria-expanded={filtersOpen}
                      aria-controls="model-filter-fields"
                      onClick={() => setFiltersOpen(v => !v)}
                    >
                      Filters
                      {[gender, age, hair].filter(v => v !== "any").length
                        ? ` (${[gender, age, hair].filter(v => v !== "any").length})`
                        : ""}
                    </Button>
                  </div>
                  <div
                    id="model-filter-fields"
                    className={`${filtersOpen ? "grid" : "hidden"} mt-3 grid-cols-2 gap-3 sm:grid sm:grid-cols-4`}
                  >
                    <label className="text-xs font-medium">
                      Gender
                      <select
                        className={selectClass}
                        value={gender}
                        onChange={e => {
                          setGender(e.target.value);
                          setPage(0);
                        }}
                      >
                        <option value="any">All genders</option>
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium">
                      Age group
                      <select
                        className={selectClass}
                        value={age}
                        onChange={e => {
                          setAge(e.target.value);
                          setPage(0);
                        }}
                      >
                        <option value="any">All ages</option>
                        {MODEL_AGES.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium">
                      Hair color
                      <select
                        className={selectClass}
                        value={hair}
                        onChange={e => {
                          setHair(e.target.value);
                          setPage(0);
                        }}
                      >
                        <option value="any">All colors</option>
                        {HAIR_COLORS.map(h => (
                          <option key={h.id} value={h.id}>
                            {h.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      className="self-end"
                      onClick={resetFilters}
                    >
                      Reset filters
                    </Button>
                  </div>
                </div>
                <div className="my-3 flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                  <span aria-live="polite">
                    {entries.length} matching models
                  </span>
                  <span>Select up to 4</span>
                </div>
                {tab === "saved" && people.isLoading && (
                  <p>Loading saved people…</p>
                )}
                {tab === "saved" && people.error && (
                  <p role="alert">
                    Unable to load saved people.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => people.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {entries
                    .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
                    .map(entry => {
                      const chosen = draft.some(
                        p => identity(p) === identity(entry.ref)
                      );
                      const disabled =
                        entry.status !== "approved" ||
                        (draft.length >= limit && !chosen);
                      return (
                        <button
                          key={personReferenceKey(entry.ref)}
                          type="button"
                          aria-label={name(entry.ref)}
                          aria-pressed={chosen}
                          disabled={disabled}
                          onClick={() => toggle(entry.ref)}
                          className={`relative min-w-0 rounded-xl border-2 bg-background p-1.5 text-left transition disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 ${chosen ? "border-violet-600 bg-violet-50" : "border-transparent hover:border-violet-300"}`}
                        >
                          {portrait(entry.ref)}
                          {chosen && (
                            <span className="absolute right-2 top-2 rounded-full bg-violet-600 p-1 text-white">
                              <Check className="h-4 w-4" />
                            </span>
                          )}
                          <span className="mt-2 block truncate text-xs font-medium">
                            {name(entry.ref)}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground">
                            {entry.status === "approved"
                              ? (MODEL_AGES.find(a => a.id === entry.age)
                                  ?.label ?? "Adult")
                              : entry.status === "pending"
                                ? "Awaiting approval"
                                : "Not approved"}
                          </span>
                        </button>
                      );
                    })}
                </div>
                {!entries.length && !people.isLoading && (
                  <div className="py-10 text-center">
                    <p>No models match these filters.</p>
                    <Button type="button" variant="link" onClick={resetFilters}>
                      Reset filters
                    </Button>
                  </div>
                )}
                {entries.length > pageSize && (
                  <nav
                    aria-label="Model pages"
                    className="mt-4 flex items-center justify-center gap-3"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      {currentPage + 1} / {pages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={currentPage + 1 >= pages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </Button>
                  </nav>
                )}
                {tab === "saved" && (
                  <Link
                    className="mt-4 inline-block text-sm text-primary underline"
                    href="~/app/library"
                  >
                    Manage and approve references in Asset Library
                  </Link>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload a clear portrait of one person. JPG, PNG or WebP, up to
                  6 MB. Approve uploaded references in Asset Library before
                  selecting them.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Model gender
                    <select
                      className={selectClass}
                      value={uploadGender}
                      onChange={e =>
                        setUploadGender(e.target.value as "male" | "female")
                      }
                    >
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Model age group
                    <select
                      className={selectClass}
                      value={uploadAge}
                      onChange={e => {
                        setUploadAge(e.target.value as ModelAge);
                        setConfirmed(false);
                      }}
                    >
                      {MODEL_AGES.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Input
                  type="file"
                  aria-label="Person reference image"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      file.size > 6 * 1024 * 1024 ||
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        file.type
                      )
                    ) {
                      toast.error("Choose a JPG, PNG, or WebP under 6 MB");
                      return;
                    }
                    const base64 = await new Promise<string>(
                      (resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result));
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                      }
                    ).catch(() => "");
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
                  {isChildModel(uploadAge)
                    ? "I have parent or guardian permission to use this child or teen’s image in advertising."
                    : "I confirm this person is an adult and I have permission to use this image in advertising."}
                </label>
                <Button
                  type="button"
                  disabled={!upload || !confirmed || save.isPending}
                  onClick={() =>
                    upload &&
                    save.mutate({
                      organizationId: organizationId!,
                      gender: uploadGender,
                      age: uploadAge,
                      name:
                        upload.name.length >= 2
                          ? upload.name
                          : "Person reference",
                      base64: upload.base64,
                      permissionConfirmed: confirmed,
                    })
                  }
                >
                  {save.isPending ? "Uploading…" : "Upload for approval"}
                </Button>
              </div>
            )}
          </div>
          <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
            <div className="mb-3 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-sm font-medium" aria-live="polite">
                {draft.length} / {limit} selected
              </span>
              {draft.map(ref => (
                <button
                  type="button"
                  key={personReferenceKey(ref)}
                  aria-label={`Remove ${name(ref)} from selection`}
                  onClick={() => toggle(ref)}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-900"
                >
                  {name(ref)}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={!draft.length}
                onClick={() => setDraft([])}
              >
                Clear
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    apply(draft);
                    setOpen(false);
                  }}
                >
                  {draft.length
                    ? `Use ${draft.length} ${draft.length === 1 ? "model" : "models"}`
                    : "Let AI choose"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
