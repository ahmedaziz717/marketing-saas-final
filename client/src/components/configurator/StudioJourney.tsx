import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Compass,
  Eye,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import "@/styles/studioExperience.css";

export type JourneyCategory = {
  id: string;
  title: string;
  value: string;
  disabled?: boolean;
  reason?: string;
  needsInput?: boolean;
  isDefault?: boolean;
};
export type JourneySection = {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  categories: JourneyCategory[];
  initialCategory?: string;
};
type Memory = { viewed: string[]; accepted: string[] };
const empty = (): Memory => ({ viewed: [], accepted: [] });
function readMemory(key: string): Memory {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? "null");
    const strings = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : [];
    return { viewed: strings(data?.viewed), accepted: strings(data?.accepted) };
  } catch {
    return empty();
  }
}

/** Exploration is optional and never implies that a configuration is valid. */
export function useStudioJourney({
  storageKey,
  sections,
  section,
  category,
  onNavigate,
  initialFocus = false,
}: {
  storageKey: string;
  sections: JourneySection[];
  section: string;
  category: string;
  onNavigate: (section: string, category: string) => void;
  initialFocus?: boolean;
}) {
  const key = storageKey + ":journey:v1";
  const [record, setRecord] = useState(() => ({
    key,
    memory: readMemory(key),
  }));
  // The key travels with its data: switching a workspace/mode cannot overwrite another trail.
  const memory = record.key === key ? record.memory : readMemory(key);
  const changeMemory = (change: (previous: Memory) => Memory) =>
    setRecord(previous => ({
      key,
      memory: change(previous.key === key ? previous.memory : readMemory(key)),
    }));
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(max-width: 700px)").matches
  );
  const [focused, setFocused] = useState(initialFocus);
  const [pending, setPending] = useState<{
    section: string;
    category: string;
    focus: boolean;
  } | null>(null);
  const [prompted, setPrompted] = useState<string[]>([]);
  const previousKey = useRef(key);
  const returnFocus = useRef<HTMLElement | null>(null);
  const scopeChanged = previousKey.current !== key;
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 700px)");
    if (!query) return;
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (previousKey.current !== key) {
      previousKey.current = key;
      setFocused(initialFocus);
      setPending(null);
      setPrompted([]);
    }
  }, [key, initialFocus]);
  const active = sections.find(s => s.id === section) ?? sections[0];
  const eligible = active.categories.filter(c => !c.disabled);
  const current = eligible.find(c => c.id === category);
  useEffect(() => {
    if (
      !scopeChanged &&
      (!mobile || focused) &&
      current &&
      !memory.viewed.includes(category)
    ) {
      changeMemory(previous => ({
        ...previous,
        viewed: Array.from(new Set([...previous.viewed, category])),
      }));
    }
  }, [key, category, mobile, focused, !!current, memory.viewed.join("|")]);
  useEffect(() => {
    if (record.key === key) {
      try {
        localStorage.setItem(key, JSON.stringify(record.memory));
      } catch {
        /* Saving the actual draft is independent. */
      }
    }
  }, [key, record]);
  const unseen = eligible.filter(c => !memory.viewed.includes(c.id));
  const sectionIndex = sections.findIndex(s => s.id === active.id);
  const categoryIndex = eligible.findIndex(c => c.id === category);
  const commit = (target: {
    section: string;
    category: string;
    focus: boolean;
  }) => {
    setPending(null);
    setFocused(target.focus);
    onNavigate(target.section, target.category);
  };
  const navigate = (sectionId: string, categoryId?: string) => {
    const targetSection = sections.find(s => s.id === sectionId);
    const targetCategory =
      targetSection?.categories.find(c => c.id === categoryId && !c.disabled) ??
      targetSection?.categories.find(
        c => c.id === targetSection.initialCategory && !c.disabled
      ) ??
      targetSection?.categories.find(c => !c.disabled);
    if (!targetSection || !targetCategory) return;
    const target = {
      section: sectionId,
      category: targetCategory.id,
      focus: !!categoryId,
    };
    if (
      sectionId !== section &&
      unseen.length &&
      !prompted.includes(section) &&
      !memory.accepted.includes(section)
    ) {
      returnFocus.current = document.activeElement as HTMLElement;
      setPrompted(previous => [...previous, section]);
      setPending(target);
    } else commit(target);
  };
  const accept = () => {
    changeMemory(previous => ({
      ...previous,
      accepted: Array.from(new Set([...previous.accepted, section])),
    }));
    if (pending) commit(pending);
  };
  const explore = (id = unseen[0]?.id) => {
    setPending(null);
    if (id) {
      setFocused(true);
      onNavigate(section, id);
    }
  };
  const nextSection = sections[sectionIndex + 1];
  return {
    sections,
    section,
    category,
    active,
    current,
    mobile,
    focused: !scopeChanged && focused,
    memory,
    unseen,
    pending,
    eligible,
    sectionIndex,
    categoryIndex,
    nextSection,
    navigate,
    explore,
    accept,
    returnFocus,
    dismiss: () => setPending(null),
    overview: () => setFocused(false),
    reveal: () => setFocused(true),
    reset: () => {
      changeMemory(empty);
      setPrompted([]);
      setFocused(false);
    },
    previous:
      categoryIndex > 0
        ? () => navigate(section, eligible[categoryIndex - 1].id)
        : sectionIndex > 0
          ? () => {
              const previous = sections[sectionIndex - 1];
              const last = previous.categories.filter(c => !c.disabled).at(-1);
              if (last) navigate(previous.id, last.id);
            }
          : undefined,
    next:
      categoryIndex < eligible.length - 1
        ? () => navigate(section, eligible[categoryIndex + 1].id)
        : undefined,
  };
}

export function StudioJourney({
  journey: j,
  children,
  label = "Studio sections",
  pager = true,
}: {
  journey: ReturnType<typeof useStudioJourney>;
  children: ReactNode;
  label?: string;
  pager?: boolean;
}) {
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const viewed = j.eligible.length - j.unseen.length;
  const progress = `${viewed} of ${j.eligible.length} categories viewed`;
  const hasMissing = j.unseen.some(c => c.needsInput);
  const cards = (
    <div
      className="journey-categories"
      aria-label="All categories in this section"
    >
      {j.active.categories.map(item => {
        const seen = j.memory.viewed.includes(item.id);
        return (
          <button
            type="button"
            key={item.id}
            className="journey-category"
            aria-label={`Open ${item.title} category`}
            disabled={item.disabled}
            title={item.disabled ? item.reason : undefined}
            aria-current={j.category === item.id ? "true" : undefined}
            onClick={() => j.navigate(j.section, item.id)}
          >
            <span className="journey-category-name">
              {item.title}
              <span
                className={`journey-mark${seen ? " is-viewed" : ""}`}
                aria-hidden="true"
              >
                {seen ? <Check size={12} /> : <span />}
              </span>
            </span>
            <strong title={item.value}>{item.value}</strong>
            <small>
              {item.disabled
                ? (item.reason ?? "Unavailable")
                : seen
                  ? "Viewed"
                  : item.needsInput
                    ? "Not set · Not viewed"
                    : j.memory.accepted.includes(j.section)
                      ? "Kept · Not viewed"
                      : item.isDefault
                        ? "Default · Not viewed"
                        : "Not viewed"}
            </small>
          </button>
        );
      })}
    </div>
  );
  return (
    <div
      className={`studio-journey${j.mobile && j.focused ? " is-focused" : ""}`}
      ref={root}
    >
      <nav className="journey-sections" aria-label={label} hidden={j.mobile}>
        {j.sections.map((item, index) => {
          const Icon = item.icon;
          const total = item.categories.filter(c => !c.disabled).length;
          const count = item.categories.filter(
            c => !c.disabled && j.memory.viewed.includes(c.id)
          ).length;
          return (
            <button
              type="button"
              key={item.id}
              aria-current={j.section === item.id ? "step" : undefined}
              onClick={() => j.navigate(item.id)}
            >
              <Icon size={19} aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                <small>{item.subtitle}</small>
                <span
                  className="journey-section-progress"
                  aria-label={`${count} of ${total} viewed`}
                >
                  {Array.from({ length: total }, (_, i) => (
                    <i key={i} data-viewed={i < count} />
                  ))}
                </span>
              </span>
              <b>{String(index + 1).padStart(2, "0")}</b>
            </button>
          );
        })}
      </nav>
      <div className="journey-mobile-section" hidden={!j.mobile || j.focused}>
        <label>
          <span className="sr-only">{label}</span>
          <select
            value={j.section}
            onChange={event => j.navigate(event.target.value)}
          >
            {j.sections.map((item, index) => (
              <option key={item.id} value={item.id}>
                {String(index + 1).padStart(2, "0")} · {item.title}
              </option>
            ))}
          </select>
          <ChevronDown size={18} aria-hidden="true" />
        </label>
        <div>
          <span>
            Step {j.sectionIndex + 1} of {j.sections.length}
          </span>
          <span>
            {viewed}/{j.eligible.length} viewed
          </span>
        </div>
      </div>
      <div className="journey-panel">
        <div className="journey-overview" hidden={j.mobile && j.focused}>
          <div className="journey-heading">
            <div>
              <h2>{j.active.title}</h2>
              <p>
                Make it yours. Explore each category or keep your current
                choices.
              </p>
            </div>
            <span>
              <Eye size={14} />
              {progress}
            </span>
          </div>
          {cards}
        </div>
        <div className="journey-focus-heading" hidden={!j.mobile || !j.focused}>
          <button type="button" onClick={j.overview}>
            <ArrowLeft size={16} />
            All categories
          </button>
          <span>
            {viewed}/{j.eligible.length} viewed
          </span>
        </div>
        <div
          id={panelId}
          className="journey-editor"
          hidden={j.mobile && !j.focused}
          role="region"
          aria-label={`${j.current?.title ?? j.active.title} category editor`}
        >
          {children}
          {pager && (
            <div className="journey-pager">
              <button type="button" disabled={!j.previous} onClick={j.previous}>
                <ArrowLeft size={16} />
                Previous category
              </button>
              {j.next ? (
                <button type="button" onClick={j.next}>
                  Next category
                  <ArrowRight size={16} />
                </button>
              ) : j.nextSection ? (
                <button
                  type="button"
                  onClick={() => j.navigate(j.nextSection!.id)}
                >
                  Next section
                  <ArrowRight size={16} />
                </button>
              ) : (
                <span>Last category</span>
              )}
            </div>
          )}
        </div>
        <div className="journey-discovery" hidden={j.mobile && j.focused}>
          {j.unseen.length ? (
            <>
              <span>
                <Compass size={18} />
                <span>
                  <strong>
                    {j.unseen.length}{" "}
                    {j.unseen.length === 1 ? "category" : "categories"} still
                    unseen
                  </strong>
                  <small>Your current choices stay in place.</small>
                </span>
              </span>
              <button type="button" onClick={() => j.explore()}>
                Explore next: {j.unseen[0].title}
                <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <span>
              <Check size={18} />
              All categories viewed. You can change these anytime.
            </span>
          )}
          {j.nextSection && (
            <button
              type="button"
              className="journey-continue"
              onClick={() => j.navigate(j.nextSection!.id)}
            >
              Continue to next section
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
      <Dialog
        open={!!j.pending}
        onOpenChange={open => {
          if (!open) j.dismiss();
        }}
      >
        <DialogContent
          className="journey-checkpoint"
          onCloseAutoFocus={event => {
            event.preventDefault();
            j.returnFocus.current?.focus();
          }}
        >
          <span className="journey-sheet-icon">
            <Compass size={23} />
          </span>
          <DialogTitle>
            {hasMissing ? "Review these choices?" : "Keep these defaults?"}
          </DialogTitle>
          <DialogDescription>
            You haven’t opened {j.unseen.length}{" "}
            {j.unseen.length === 1 ? "category" : "categories"} in{" "}
            {j.active.title}. Here’s what’s currently selected.
          </DialogDescription>
          <div className="journey-checkpoint-list">
            {j.unseen.map(item => (
              <button
                type="button"
                key={item.id}
                onClick={() => j.explore(item.id)}
              >
                <span>{item.title}</span>
                <strong>
                  {item.needsInput ? "Not set" : item.value}
                  <ArrowRight size={14} />
                </strong>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="journey-primary"
            onClick={() => j.explore()}
          >
            Explore remaining categories
            <ArrowRight size={16} />
          </button>
          <button type="button" className="journey-keep" onClick={j.accept}>
            {hasMissing
              ? "Continue with current choices"
              : "Keep defaults & continue"}
          </button>
          <p className="journey-sheet-note">
            You can change these later.
            {hasMissing
              ? " Required inputs still need to be completed before running."
              : ""}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function StudioSummary({
  title = "Preview & summary",
  subtitle,
  thumbnail,
  forceOpen = false,
  children,
}: {
  title?: string;
  subtitle?: string;
  thumbnail?: string;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const expanded = open || forceOpen;
  return (
    <section className="journey-summary" data-forced={forceOpen}>
      <button
        type="button"
        className="journey-summary-toggle"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        disabled={forceOpen}
      >
        {thumbnail ? (
          <img src={thumbnail} alt="" />
        ) : (
          <span className="journey-summary-icon">
            <Eye size={21} />
          </span>
        )}
        <span>
          <strong>{title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
        <ChevronDown size={18} className={expanded ? "is-open" : ""} />
      </button>
      <div id={id} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
