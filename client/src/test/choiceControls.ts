import { fireEvent } from "@testing-library/react";

/** Exercise the rendered choices, including the visible Show more control. */
export function changeField(
  element: Element,
  event: { target: { value?: unknown; [key: string]: unknown } }
) {
  const root = element.closest(".choice-select");
  if (!root || root.getAttribute("data-density") === "select")
    return fireEvent.change(element, event);
  const value = String(event.target.value);
  const find = () =>
    Array.from(root.querySelectorAll<HTMLButtonElement>(".choice-tile")).find(
      b => b.dataset.value === value
    );
  let tile = find();
  while (!tile) {
    const more = Array.from(
      root.querySelectorAll<HTMLButtonElement>("button")
    ).find(b => b.textContent?.startsWith("Show more"));
    if (!more) break;
    fireEvent.click(more);
    tile = find();
  }
  if (!tile && value === "") {
    const clear = Array.from(
      root.querySelectorAll<HTMLButtonElement>("button")
    ).find(b => b.textContent === "Clear selection");
    if (clear) return fireEvent.click(clear);
  }
  if (!tile || tile.disabled)
    throw new Error(`No enabled visual choice for ${value}`);
  return fireEvent.click(tile);
}
export function selectedChoice(element: Element) {
  return (
    element
      .closest(".choice-select")
      ?.querySelector<HTMLElement>('[aria-checked="true"]')?.dataset.value ?? ""
  );
}
export function allChoiceLabels(element: Element) {
  const root = element.closest(".choice-select")!;
  if (root.getAttribute("data-density") === "select")
    return Array.from(root.querySelectorAll("option"), o => o.textContent);
  let more: HTMLButtonElement | undefined;
  while (
    (more = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      b => b.textContent?.startsWith("Show more")
    ))
  )
    fireEvent.click(more);
  return Array.from(root.querySelectorAll<HTMLElement>(".choice-tile"), b =>
    b.getAttribute("aria-label")
  );
}
