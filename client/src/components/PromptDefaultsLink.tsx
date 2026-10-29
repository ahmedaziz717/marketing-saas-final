import { Link } from "wouter";
/** Opens the same workspace registry from every generation form. User-written
 * briefs stay separate from the application defaults that surround them. */
export function PromptDefaultsLink({
  promptId,
  label = "Manage generation defaults",
}: {
  promptId: string;
  label?: string;
}) {
  return (
    <Link
      className="text-xs text-muted-foreground underline underline-offset-4"
      href={`~/app/settings/prompts?prompt=${encodeURIComponent(promptId)}`}
    >
      {label}
    </Link>
  );
}
