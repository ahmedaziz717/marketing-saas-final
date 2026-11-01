import { getCreativeTheme } from "./creativeThemes";

/** An event is messaging context, never evidence of a discount or deadline. */
export function creativeMessaging(themeId: string, direction?: string) {
  const theme = getCreativeTheme(themeId);
  const event = [
    [/^black-friday(?:-|$)/, "Black Friday"],
    [/^cyber-monday$/, "Cyber Monday"],
    [/^(halloween|spooky-builds)(?:-|$)/, "Halloween"],
    [/^christmas(?:-|$)/, "Christmas"],
    [/^thanksgiving$/, "Thanksgiving"],
    [/^valentines(?:-|$)/, "Valentine’s Day"],
    [/^labor-day(?:-|$)/, "Labor Day"],
    [/^memorial-day(?:-|$)/, "Memorial Day"],
  ].find(([pattern]) => (pattern as RegExp).test(themeId))?.[1] as
    | string
    | undefined;
  return {
    theme: theme.name,
    direction: direction?.trim() || theme.direction,
    ...(event ? { event, requiredMention: event } : {}),
    rule: "Make the message recognizably reflect this selected campaign theme and the brand voice. For a named event, include its name naturally in the headline or subheadline. A theme does not authorize invented discounts, prices, availability, deadlines or claims. Visual-only themes shape tone, not product facts.",
  };
}

/** Keep an explicitly chosen event visible even if the model omits it. */
export function alignCopyWithCampaign<
  T extends { headline: string; subheadline: string; cta: string },
>(copy: T, themeId: string): T {
  const event = creativeMessaging(themeId).event;
  if (
    !event ||
    `${copy.headline} ${copy.subheadline}`
      .toLocaleLowerCase()
      .includes(event.toLocaleLowerCase())
  )
    return copy;
  const available = 180 - event.length - 3;
  const headline =
    copy.headline.length > available
      ? copy.headline
          .slice(0, available)
          .replace(/\s+\S*$/, "")
          .trim()
      : copy.headline;
  return { ...copy, headline: `${event} · ${headline}`.slice(0, 180) };
}
