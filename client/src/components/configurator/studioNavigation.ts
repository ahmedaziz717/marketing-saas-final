import { useLayoutEffect, useRef } from "react";

/** Scroll only after React has switched the visible choice category. */
export function scrollStudioChoices(container: HTMLElement | null) {
  requestAnimationFrame(() => {
    const mobile = window.matchMedia?.("(max-width: 700px)").matches;
    const root = container?.closest(".cfg-root") ?? container;
    const activeHeader = Array.from(
      root?.querySelectorAll<HTMLElement>(
        '.cfg-section-heading:has([aria-expanded="true"])'
      ) ?? []
    ).find(element => !element.closest("[hidden]"));
    const journey = root?.querySelector<HTMLElement>(".studio-journey");
    const target = journey
      ? mobile
        ? journey.querySelector<HTMLElement>(
            journey.classList.contains("is-focused")
              ? ".journey-focus-heading"
              : ".journey-mobile-section"
          )
        : journey
      : (mobile && activeHeader) ||
        Array.from(
          container?.querySelectorAll<HTMLElement>(
            ".cfg-categories, .cfg-content-title, .activation-section-title"
          ) ?? []
        ).find(element => !element.closest("[hidden]"));
    // Keep the expanded preview visible while the choices already fit on screen.
    if (journey && !mobile) {
      const bounds = journey.getBoundingClientRect();
      const top =
        root?.querySelector(".cfg-heading")?.getBoundingClientRect().bottom ??
        0;
      if (bounds.top >= top && bounds.top < window.innerHeight - 220) return;
    }
    target?.scrollIntoView?.({
      block: "start",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  });
}

/** Offsets follow the actual shell, header and nav sizes, including wrapped text. */
export function useStudioNavigation() {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const visible = (selector: string) =>
      Array.from(node.querySelectorAll<HTMLElement>(selector)).find(
        element =>
          !element.closest("[hidden]") && element.getClientRects().length > 0
      );
    const measure = () => {
      const heights = {
        shell:
          document.querySelector(".evoke-toolbar")?.getBoundingClientRect()
            .height ?? 0,
        header: visible(".cfg-heading")?.getBoundingClientRect().height ?? 0,
        sections: visible(".cfg-sections")?.getBoundingClientRect().height ?? 0,
        categories:
          visible(".cfg-categories")?.getBoundingClientRect().height ?? 0,
      };
      Object.entries(heights).forEach(([name, height]) =>
        node.style.setProperty(`--cfg-${name}-height`, `${height}px`)
      );
    };
    const resize = new ResizeObserver(measure);
    const watch = () => {
      resize.disconnect();
      node
        .querySelectorAll(".cfg-heading, .cfg-sections, .cfg-categories")
        .forEach(element => resize.observe(element));
      const toolbar = document.querySelector(".evoke-toolbar");
      if (toolbar) resize.observe(toolbar);
      measure();
    };
    const changes = new MutationObserver(watch);
    changes.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
    watch();
    return () => {
      changes.disconnect();
      resize.disconnect();
    };
  }, []);
  return root;
}
