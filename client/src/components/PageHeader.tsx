import type { ReactNode } from "react";
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="evoke-page-header flex flex-col border-b border-border md:flex-row md:justify-between">
      <div className="min-w-0 max-w-3xl">
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="mt-3 text-muted-foreground">{description}</p>
      </div>
      {action && <div className="evoke-page-header-action">{action}</div>}
    </header>
  );
}
