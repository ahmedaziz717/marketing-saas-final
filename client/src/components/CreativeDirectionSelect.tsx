import { useId } from "react";

export function CreativeDirectionSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; name: string; direction: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const selected = options.find(option => option.id === value);
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={event => onChange(event.target.value as T)}
        aria-describedby={id + "-hint"}
        className="h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {options.map(option => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <p
        id={id + "-hint"}
        className="mt-2 text-xs leading-5 text-muted-foreground"
      >
        {selected?.direction}
      </p>
    </div>
  );
}
