import { StudioCard } from "../configurator/StudioCard";

export type StudioAccountChoice = {
  id: string;
  name: string;
  accountId?: string;
  currency?: string;
  timezone?: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
};

/** Shared account cards keep Meta and Google destinations visually consistent. */
export function StudioAccountPicker({
  accounts,
  value,
  channelLabel,
  disabled,
  onChange,
}: {
  accounts: StudioAccountChoice[];
  value: string;
  channelLabel: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <div className="cfg-card-grid" aria-label={`${channelLabel} accounts`}>
      {accounts.map(account => (
        <StudioCard
          key={account.id}
          title={account.name}
          description={[
            account.accountId,
            account.currency,
            account.timezone,
            account.description,
            account.disabled ? account.disabledReason : undefined,
          ]
            .filter(Boolean)
            .join(" · ")}
          badge={account.disabled ? "Read only" : channelLabel}
          selected={account.id === value}
          disabled={disabled || account.disabled}
          onSelect={() => onChange(account.id)}
        />
      ))}
    </div>
  );
}
