import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { studioCategoryIcon } from "./studioCategoryIcons";
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

/** Exploration is optional and never implies that a configuration is valid. */
export function useStudioJourney({
  scopeKey,
  sections,
  section,
  category,
  onNavigate,
  initialFocus = false,
}: {
  scopeKey: string;
  sections: JourneySection[];
  section: string;
  category: string;
  onNavigate: (section: string, category: string) => void;
  initialFocus?: boolean;
}) {
  const key = scopeKey;
  // Keep each mode's trail during this visit, and start fresh when the studio reopens.
  const [records, setRecords] = useState<Record<string, Memory>>({});
  const memory = records[key] ?? empty();
  const changeMemory = (change: (previous: Memory) => Memory) =>
    setRecords(previous => ({
      ...previous,
      [key]: change(previous[key] ?? empty()),
    }));
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(max-width: 700px)").matches
  );
  const [focused, setFocused] = useState(initialFocus);
  const [reviewOpen, setReviewOpen] = useState(false);
  const previousKey = useRef(key);
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
      setReviewOpen(false);
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
  const unseen = eligible.filter(c => !memory.viewed.includes(c.id));
  const sectionIndex = sections.findIndex(s => s.id === active.id);
  const categoryIndex = eligible.findIndex(c => c.id === category);
  const commit = (target: {
    section: string;
    category: string;
    focus: boolean;
  }) => {
    setReviewOpen(false);
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
    commit(target);
  };
  const explore = (id = unseen[0]?.id) => {
    setReviewOpen(false);
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
    reviewOpen,
    eligible,
    sectionIndex,
    categoryIndex,
    nextSection,
    navigate,
    explore,
    review: () => setReviewOpen(value => !value),
    dismiss: () => setReviewOpen(false),
    overview: () => setFocused(false),
    reveal: () => setFocused(true),
    reset: () => {
      changeMemory(empty);
      setReviewOpen(false);
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
  const overview = useRef<HTMLDivElement>(null);
  const railScroll = useRef<HTMLDivElement>(null);
  const railContent = useRef<HTMLDivElement>(null);
  const railId = useId();
  const [overflow, setOverflow] = useState({ up: false, down: false });
  useLayoutEffect(() => {
    const rail = overview.current;
    const viewport = railScroll.current;
    const content = railContent.current;
    if (!rail || !viewport || !content || j.mobile) {
      setOverflow(previous =>
        previous.up || previous.down ? { up: false, down: false } : previous
      );
      return;
    }
    const studio = root.current?.closest(".cfg-root");
    let frame = 0;
    let revealCurrent = true;
    const measure = () => {
      frame = 0;
      if (!rail.getClientRects().length) return;
      const footer = studio
        ?.querySelector(".cfg-bottom, .activation-footer")
        ?.getBoundingClientRect();
      const bottom = Math.min(
        window.innerHeight,
        footer && footer.top >= 0 ? footer.top : window.innerHeight
      );
      // Keep a useful rail viewport while the large preview scrolls away.
      // Size from its sticky position instead of squeezing it into the first fold.
      const height = Math.max(
        144,
        Math.floor(
          bottom - Math.max(0, parseFloat(getComputedStyle(rail).top) || 0) - 12
        )
      );
      rail.style.setProperty("--journey-rail-height", `${height}px`);
      if (revealCurrent) {
        const active = content.querySelector<HTMLElement>(
          j.reviewOpen
            ? ".journey-review-panel"
            : '.journey-category[aria-current="true"]'
        );
        if (active) {
          const bounds = active.getBoundingClientRect();
          const visible = viewport.getBoundingClientRect();
          if (j.reviewOpen) viewport.scrollTop += bounds.top - visible.top - 30;
          else if (bounds.bottom > visible.bottom - 30)
            viewport.scrollTop += bounds.bottom - visible.bottom + 30;
          else if (bounds.top < visible.top + 30)
            viewport.scrollTop -= visible.top + 30 - bounds.top;
        }
        revealCurrent = false;
      }
      const up = viewport.scrollTop > 2;
      const down =
        viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 2;
      setOverflow(previous =>
        previous.up === up && previous.down === down ? previous : { up, down }
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(schedule);
    [rail, viewport, content, studio].forEach(node => {
      if (node) resize?.observe(node);
    });
    studio
      ?.querySelectorAll(
        ".cfg-heading, .journey-sections, .cfg-bottom, .activation-footer"
      )
      .forEach(node => resize?.observe(node));
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      resize?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [j.section, j.category, j.mobile, j.reviewOpen]);
  const scrollCategories = (direction: number) => {
    const viewport = railScroll.current;
    viewport?.scrollBy({
      top: direction * Math.max(84, viewport.clientHeight * 0.7),
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  const viewed = j.eligible.length - j.unseen.length;
  const progress = `${viewed} of ${j.eligible.length} categories viewed`;
  const reviewId = useId();
  const cards = (
    <div
      className="journey-categories"
      aria-label="All categories in this section"
    >
      {j.active.categories.map(item => {
        const seen = j.memory.viewed.includes(item.id);
        const Icon = studioCategoryIcon(item.id, item.title);
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
            <span className="journey-category-icon" aria-hidden="true">
              <Icon size={20} strokeWidth={1.7} />
            </span>
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
        <nav className="journey-mobile-steps" aria-label={label}>
          {j.sections.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                aria-current={j.section === item.id ? "step" : undefined}
                onClick={() => j.navigate(item.id)}
              >
                <Icon size={17} aria-hidden="true" />
                <span>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <strong>{item.title}</strong>
                </span>
              </button>
            );
          })}
        </nav>
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
        <div
          className="journey-overview"
          ref={overview}
          hidden={j.mobile && j.focused}
        >
          <div className="journey-heading">
            <div>
              <h2>{j.active.title}</h2>
              <div className="journey-review-link" aria-label={progress}>
                <span>
                  {j.unseen.length
                    ? `${j.unseen.length} ${j.unseen.length === 1 ? "category" : "categories"} unviewed`
                    : "All categories viewed"}
                </span>
                {!!j.unseen.length && (
                  <button
                    type="button"
                    aria-expanded={j.reviewOpen}
                    aria-controls={reviewId}
                    onClick={j.review}
                  >
                    Review
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="journey-rail-body">
            <div
              id={railId}
              ref={railScroll}
              className="journey-rail-scroll"
              role="region"
              aria-label={`${j.active.title} categories`}
              tabIndex={j.mobile ? undefined : 0}
            >
              <div ref={railContent} className="journey-rail-content">
                {cards}
                {j.reviewOpen && (
                  <section
                    id={reviewId}
                    className="journey-review-panel"
                    aria-label="Review unviewed choices"
                  >
                    <h3>Your current choices</h3>
                    <p>Explore any category whenever you like.</p>
                    <div className="journey-review-list">
                      {j.unseen.map(item => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => j.explore(item.id)}
                        >
                          <span>{item.title}</span>
                          <strong>
                            {item.needsInput
                              ? "Not set · Required"
                              : item.value}
                          </strong>
                          <ArrowRight size={14} />
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="journey-review-close"
                      onClick={j.dismiss}
                    >
                      Close review
                    </button>
                  </section>
                )}
              </div>
            </div>
            <div
              className="journey-scroll-cue is-up"
              hidden={!overflow.up || j.mobile}
            >
              <button
                type="button"
                aria-label="Scroll categories up"
                title="More categories above"
                aria-controls={railId}
                onClick={() => scrollCategories(-1)}
              >
                <ChevronUp size={18} aria-hidden="true" />
              </button>
            </div>
            <div
              className="journey-scroll-cue is-down"
              hidden={!overflow.down || j.mobile}
            >
              <button
                type="button"
                aria-label="Scroll categories down"
                title="More categories below"
                aria-controls={railId}
                onClick={() => scrollCategories(1)}
              >
                <ChevronDown size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
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
  const [open, setOpen] = useState(
    () =>
      typeof window === "undefined" ||
      !window.matchMedia?.("(max-width: 700px)").matches
  );
  const id = useId();
  const expanded = open || forceOpen;
  return (
    <section
      className="journey-summary"
      data-forced={forceOpen}
      data-expanded={expanded}
    >
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

/** A compact live setup preview for studios whose output is a report or plan. */
export function StudioSetupSummary({
  title,
  name,
  icon: Icon,
  items,
  onNavigate,
}: {
  title: string;
  name: string;
  icon: LucideIcon;
  items: Array<{ title: string; value: string; category: string }>;
  onNavigate: (category: string) => void;
}) {
  return (
    <StudioSummary title={title} subtitle={name}>
      <div className="journey-setup-summary">
        <div className="journey-setup-art" aria-hidden="true">
          <Icon size={42} />
          <span>Live setup</span>
        </div>
        <div>
          <h2>{name}</h2>
          <div className="cfg-summary">
            {items.map(item => (
              <button
                type="button"
                key={item.category}
                onClick={() => onNavigate(item.category)}
              >
                <span>{item.title}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>
        </div>
      </div>
    </StudioSummary>
  );
}
