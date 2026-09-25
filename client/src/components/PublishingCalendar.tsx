import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { channelInput } from "./ChannelConnections";
import {
  PublicationComposer,
  PublicationDetails,
  PublicationStatus,
  type Publication,
} from "./PublicationComposer";
import {
  channelNames,
  dateInZone,
  localScheduleToUtc,
  moveDate,
  weekStart,
  statusLabel,
  publicationStates,
  type Channel,
} from "@shared/channels";
const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export function ContentPlanEditor({ onClose }: { onClose: () => void }) {
  const { organizationId } = useWorkspace();
  const utils = trpc.useUtils();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const query = trpc.channels.plan.useQuery({
    organizationId: organizationId!,
    channel: "facebook",
    timezone: zone,
  });
  const [posts, setPosts] = useState(2),
    [timezone, setTimezone] = useState(zone),
    [slots, setSlots] = useState([
      { day: 2, time: "10:00" },
      { day: 5, time: "10:00" },
    ]);
  useEffect(() => {
    if (query.data) {
      setPosts(query.data.postsPerWeek);
      setTimezone(query.data.timezone);
      setSlots(query.data.slots);
    }
  }, [query.data]);
  const save = trpc.channels.savePlan.useMutation({
    onSuccess: async () => {
      await utils.channels.plan.invalidate();
      toast.success("Facebook content plan saved. No posts were scheduled.");
      onClose();
    },
    onError: e => toast.error(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Facebook weekly content plan</DialogTitle>
          <DialogDescription>
            A posting target and preferred time slots, not permission to
            publish. You can schedule individual posts beyond the current week.
          </DialogDescription>
        </DialogHeader>
        {query.error && (
          <p role="alert">Your current plan could not be loaded.</p>
        )}
        <Label htmlFor="plan-count">Posts per week</Label>
        <input
          id="plan-count"
          type="number"
          min={0}
          max={14}
          className={channelInput}
          value={posts}
          onChange={e => setPosts(Number(e.target.value))}
        />
        <Label htmlFor="plan-zone">Time zone</Label>
        <input
          id="plan-zone"
          className={channelInput}
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
        />
        <h3 className="font-semibold">Preferred times</h3>
        {slots.map((slot, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2"
          >
            <select
              aria-label={"Day for slot " + (i + 1)}
              className={channelInput}
              value={slot.day}
              onChange={e =>
                setSlots(v =>
                  v.map((s, j) =>
                    j === i ? { ...s, day: Number(e.target.value) } : s
                  )
                )
              }
            >
              {weekdays.map((d, n) => (
                <option key={d} value={n}>
                  {d}
                </option>
              ))}
            </select>
            <input
              aria-label={"Time for slot " + (i + 1)}
              type="time"
              className={channelInput}
              value={slot.time}
              onChange={e =>
                setSlots(v =>
                  v.map((s, j) =>
                    j === i ? { ...s, time: e.target.value } : s
                  )
                )
              }
            />
            <Button
              variant="ghost"
              onClick={() => setSlots(v => v.filter((_, j) => i !== j))}
              aria-label={"Remove slot " + (i + 1)}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={slots.length >= 14}
          onClick={() => setSlots(v => [...v, { day: 1, time: "10:00" }])}
        >
          Add preferred time
        </Button>
        <Button
          disabled={save.isPending || query.isLoading || !!query.error}
          onClick={() =>
            save.mutate({
              organizationId: organizationId!,
              channel: "facebook",
              timezone,
              postsPerWeek: posts,
              slots,
            })
          }
        >
          Save content plan
        </Button>
      </DialogContent>
    </Dialog>
  );
}
export function PublishingCalendar({
  channelScope,
}: {
  channelScope?: Channel;
}) {
  const { organizationId, membership } = useWorkspace();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [date, setDate] = useState(() =>
      dateInZone(Date.now(), zone).slice(0, 10)
    ),
    [view, setView] = useState<"week" | "month" | "list">("week");
  const [channel, setChannel] = useState<Channel | "all">(
    channelScope ?? (params.get("channel") === "meta_ads" ? "meta_ads" : "all")
  );
  const [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [planOpen, setPlanOpen] = useState(false);
  const [compose, setCompose] = useState<{
    item?: Publication;
    initialTime?: string;
    initialAssetKey?: string;
  } | null>(() =>
    params.has("new") || params.has("asset")
      ? { initialAssetKey: params.get("asset") ?? undefined }
      : null
  );
  const [selected, setSelected] = useState<string | null>(
    params.get("publication")
  );
  const [aiConfirm, setAiConfirm] = useState(false),
    [draftConnection, setDraftConnection] = useState("");
  const scope = { organizationId: organizationId! };
  const query = trpc.publishing.list.useQuery(scope, {
    enabled: !!organizationId,
    refetchInterval: 15000,
  });
  const connections = trpc.channels.connections.useQuery(scope, {
    enabled: !!organizationId,
  });
  const plan = trpc.channels.plan.useQuery(
    { ...scope, channel: "facebook", timezone: zone },
    { enabled: !!organizationId }
  );
  const timezone = plan.data?.timezone ?? zone;
  const items = query.data?.items ?? [];
  const canEdit = ["owner", "admin", "creator", "publisher"].includes(
    membership?.role ?? ""
  );
  const anchor = weekStart(date),
    first = view === "month" ? weekStart(date.slice(0, 7) + "-01") : anchor;
  const days = Array.from({ length: view === "month" ? 42 : 7 }, (_, i) =>
    moveDate(first, i)
  );
  const dates = new Set(days);
  const filtered = items.filter(
    p =>
      (channel === "all" || p.channel === channel) &&
      (status === "all" || p.state === status) &&
      `${p.content.title} ${p.content.message} ${p.content.campaignLabel}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  const chosen = items.find(p => p.id === selected);
  const planned = useMemo(
    () =>
      (plan.data?.slots ?? []).flatMap(slot => {
        const day = moveDate(anchor, (slot.day + 6) % 7),
          local = day + "T" + slot.time;
        try {
          return [{ day, local, at: localScheduleToUtc(local, timezone) }];
        } catch {
          return [];
        }
      }),
    [anchor, plan.data, timezone]
  );
  const missing = planned.filter(
    slot =>
      slot.at > Date.now() &&
      !items.some(
        p =>
          p.channel === "facebook" &&
          p.scheduledAtMs === slot.at &&
          !["cancelled", "rejected"].includes(p.state)
      )
  );
  const [aiSlots, setAiSlots] = useState<Array<{ id: string; at: number }>>([]);
  const drafts = trpc.channels.draftCaptions.useMutation({
    onSuccess: async () => {
      await utils.publishing.list.invalidate();
      setAiConfirm(false);
      toast.success(
        "AI captions saved as drafts. Review their copy, select assets, then request publishing approval."
      );
    },
    onError: e => toast.error(e.message),
  });
  const weekly = items.filter(
    p =>
      p.channel === "facebook" &&
      p.scheduledAtMs &&
      weekStart(dateInZone(p.scheduledAtMs, timezone).slice(0, 10)) ===
        anchor &&
      !["cancelled", "rejected"].includes(p.state)
  );
  const closeCompose = () => {
    setCompose(null);
    if (params.has("new") || params.has("asset")) navigate("/app/publishing");
  };
  const next = (direction: number) => {
    if (view !== "month") setDate(moveDate(date, direction * 7));
    else {
      const d = new Date(date.slice(0, 7) + "-01T12:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + direction);
      setDate(d.toISOString().slice(0, 10));
    }
  };
  return (
    <section className="min-w-0 space-y-5" aria-label="Publishing calendar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex flex-wrap gap-2">
          {(["week", "month", "list"] as const).map(v => (
            <Button
              key={v}
              variant={view === v ? "default" : "outline"}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {statusLabel(v)}
            </Button>
          ))}
        </div>
        {canEdit && (
          <>
            <Button variant="outline" onClick={() => setPlanOpen(true)}>
              Facebook content plan
            </Button>
            <Button onClick={() => setCompose({})}>
              <Plus className="mr-2 h-4 w-4" />
              New publication
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          aria-label="Refresh calendar"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-3">
        <select
          className={channelInput}
          aria-label="Publishing channel"
          value={channel}
          disabled={!!channelScope}
          onChange={e => setChannel(e.target.value as Channel | "all")}
        >
          <option value="all">All channels</option>
          <option value="facebook">Facebook - organic</option>
          <option value="meta_ads">Meta Ads - paid</option>
        </select>
        <select
          className={channelInput}
          aria-label="Publication status"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {publicationStates.map(s => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <input
          className={channelInput}
          aria-label="Search publications"
          placeholder="Search title, caption or campaign"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => next(-1)}
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="date"
          className={channelInput + " max-w-44"}
          aria-label="Calendar date"
          value={date}
          onChange={e => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => next(1)}
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => setDate(dateInZone(Date.now(), timezone).slice(0, 10))}
        >
          Today
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">
          Calendar time zone: {timezone}
        </p>
      </div>
      {channel !== "meta_ads" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/5 p-4">
          <p className="text-sm">
            <strong>
              Facebook: {weekly.length} planned / {plan.data?.postsPerWeek ?? 2}{" "}
              weekly target.
            </strong>{" "}
            {
              weekly.filter(p => ["scheduled", "published"].includes(p.state))
                .length
            }{" "}
            scheduled or delivered. Preferred slots are placeholders until
            content is saved.
          </p>
          {canEdit && (
            <Button
              variant="outline"
              disabled={
                !missing.length ||
                weekly.length >= (plan.data?.postsPerWeek ?? 2) ||
                drafts.isPending
              }
              onClick={() => {
                setAiSlots(
                  missing
                    .slice(
                      0,
                      Math.max(
                        0,
                        Math.min(
                          7,
                          (plan.data?.postsPerWeek ?? 2) - weekly.length
                        )
                      )
                    )
                    .map(s => ({ id: crypto.randomUUID(), at: s.at }))
                );
                setAiConfirm(true);
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Draft this week's captions
            </Button>
          )}
        </div>
      )}
      {query.isLoading ? (
        <p role="status" className="surface p-8">
          Loading publishing calendar...
        </p>
      ) : query.error ? (
        <div role="alert" className="surface p-8">
          <p>{query.error.message}</p>
          <Button onClick={() => query.refetch()}>Retry</Button>
        </div>
      ) : view === "list" ? (
        <div className="space-y-3">
          {filtered.length ? (
            filtered.map(p => (
              <button
                key={p.id}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left hover:border-primary"
                onClick={() => setSelected(p.id)}
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold">{p.content.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {channelNames[p.channel]} /{" "}
                    {p.scheduledAtMs
                      ? dateInZone(p.scheduledAtMs, timezone).replace("T", " ")
                      : "Unscheduled"}{" "}
                    / {p.content.campaignLabel || "No campaign label"}
                  </p>
                </div>
                <PublicationStatus item={p} />
              </button>
            ))
          ) : (
            <p className="surface p-8">
              No matching publications. Start a draft or choose another filter.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            {days.map(day => (
              <div
                key={day}
                className={
                  "min-w-0 rounded-xl border p-3 " +
                  (day === dateInZone(Date.now(), timezone).slice(0, 10)
                    ? "border-primary bg-primary/5"
                    : "bg-card")
                }
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {new Date(day + "T12:00:00Z").toLocaleDateString(
                      undefined,
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      }
                    )}
                  </h3>
                  {canEdit && (
                    <button
                      aria-label={"Create publication on " + day}
                      onClick={() =>
                        setCompose({ initialTime: day + "T10:00" })
                      }
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="min-h-28 space-y-3">
                  {filtered
                    .filter(
                      p =>
                        p.scheduledAtMs &&
                        dateInZone(p.scheduledAtMs, timezone).slice(0, 10) ===
                          day
                    )
                    .map(p => (
                      <button
                        key={p.id}
                        className="w-full min-w-0 rounded-lg border bg-background p-2.5 text-left hover:border-primary"
                        onClick={() => setSelected(p.id)}
                      >
                        <p className="text-xs text-muted-foreground">
                          {dateInZone(p.scheduledAtMs!, timezone).slice(11)} /{" "}
                          {channelNames[p.channel]}
                        </p>
                        <p className="my-2 break-words text-sm font-medium">
                          {p.content.title}
                        </p>
                        <PublicationStatus item={p} />
                      </button>
                    ))}
                  {view === "week" &&
                    channel !== "meta_ads" &&
                    status === "all" &&
                    !search &&
                    missing
                      .filter(s => s.day === day)
                      .map(s => (
                        <button
                          key={s.local}
                          disabled={!canEdit}
                          className="w-full rounded-lg border border-dashed p-3 text-left text-xs text-muted-foreground"
                          onClick={() => setCompose({ initialTime: s.local })}
                        >
                          Facebook slot / {s.local.slice(11)}
                          <span className="mt-2 block">
                            No post yet - create draft
                          </span>
                        </button>
                      ))}
                </div>
              </div>
            ))}
          </div>
          {!!filtered.filter(p => !p.scheduledAtMs).length && (
            <div className="rounded-xl border p-4">
              <h3 className="mb-3 font-semibold">Unscheduled / queue now</h3>
              <div className="flex flex-wrap gap-2">
                {filtered
                  .filter(p => !p.scheduledAtMs)
                  .map(p => (
                    <Button
                      key={p.id}
                      variant="outline"
                      className="h-auto max-w-full whitespace-normal text-left"
                      onClick={() => setSelected(p.id)}
                    >
                      {p.content.title} / {statusLabel(p.state)}
                    </Button>
                  ))}
              </div>
            </div>
          )}
          {!filtered.some(
            p =>
              p.scheduledAtMs &&
              dates.has(dateInZone(p.scheduledAtMs, timezone).slice(0, 10))
          ) && (
            <p className="text-sm text-muted-foreground">
              No saved publications in this period. Move to a future week or
              create a new publication.
            </p>
          )}
        </>
      )}
      {query.data?.truncated && (
        <p role="alert" className="text-sm">
          Showing the latest 500 publications. Older history is not included in
          this calendar view.
        </p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Asset approval and publication approval are separate. A scheduled Meta
        ad is created paused; Facebook posts can go live only when live delivery
        is enabled and an authorized publisher queues them.
      </p>
      {compose && (
        <PublicationComposer
          key={compose.item?.id ?? "new"}
          {...compose}
          initialChannel={channel === "all" ? "facebook" : channel}
          initialTimezone={timezone}
          onClose={closeCompose}
          onSaved={id => {
            closeCompose();
            setSelected(id);
          }}
        />
      )}
      {chosen && !compose && (
        <PublicationDetails
          key={chosen.id}
          item={chosen}
          onClose={() => setSelected(null)}
          onEdit={() => setCompose({ item: chosen })}
        />
      )}
      {planOpen && <ContentPlanEditor onClose={() => setPlanOpen(false)} />}
      <Dialog
        open={aiConfirm}
        onOpenChange={open => {
          if (!drafts.isPending) setAiConfirm(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create weekly caption drafts</DialogTitle>
            <DialogDescription>
              AI will draft {aiSlots.length} Facebook captions from your brand
              and approved catalog. Review all copy before use. This does not
              generate images or publish posts.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="draft-page">
            Facebook Page (optional for drafts)
          </Label>
          <select
            id="draft-page"
            className={channelInput}
            value={draftConnection}
            onChange={e => setDraftConnection(e.target.value)}
          >
            <option value="">Select later</option>
            {connections.data?.items
              .filter(c => c.channel === "facebook" && c.status === "connected")
              .map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Uses the configured AI service and may incur usage charges. Existing
            drafts are not replaced.
          </p>
          <Button
            disabled={drafts.isPending || !aiSlots.length}
            onClick={() =>
              drafts.mutate({
                ...scope,
                connectionId: draftConnection || null,
                timezone,
                slots: aiSlots,
              })
            }
          >
            {drafts.isPending
              ? "Drafting captions..."
              : "Generate caption drafts"}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
