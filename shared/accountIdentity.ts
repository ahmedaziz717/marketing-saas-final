export function accountInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word[0] ?? "")
      .join("")
      .toUpperCase() || "AC"
  );
}
export function safeAccountImage(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      Array.from(url.searchParams.keys()).some(k =>
        /token|secret|authorization|password/i.test(k)
      )
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
