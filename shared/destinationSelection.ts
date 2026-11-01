/** Callers supply only connected, authorized options for this specific selector. */
export function resolveDestinationSelection<T extends { id: string }>(
  options: readonly T[],
  value: string,
  state: { loading?: boolean; error?: boolean } = {}
) {
  const eligible = Array.from(
    new Map(options.map(option => [option.id, option])).values()
  );
  const selected = eligible.find(option => option.id === value);
  const onlyOption = eligible.length === 1 ? eligible[0] : undefined;
  const status = state.error
    ? "error"
    : state.loading
      ? "loading"
      : value && !selected
        ? "unavailable"
        : !eligible.length
          ? "empty"
          : onlyOption
            ? "single"
            : "multiple";
  return {
    status,
    eligible,
    selected,
    onlyOption,
    // An explicit/saved destination must never silently move to another account.
    autoSelectId: status === "single" && !value ? onlyOption?.id : undefined,
    showPicker:
      (status === "multiple" || status === "unavailable") &&
      eligible.length > 1,
  } as const;
}
