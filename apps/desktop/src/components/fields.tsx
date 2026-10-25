import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A number input that only commits on Enter or blur, so typing a long value
 * does not fire one backend write per keystroke.
 */
export function NumberField({
  value,
  onCommit,
  min = 0,
  max,
  disabled,
  className,
  placeholder,
  ariaLabel,
}: {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (): void => {
    const parsed = Number(draft.replaceAll(',', '').trim());
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = Math.trunc(parsed);
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      className={cn('numeric h-8 w-28 text-right', className)}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(String(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * A string-backed integer field for 64-bit ids.
 *
 * JavaScript numbers lose precision above 2^53 and several save ids are
 * 17-digit values, so the value never becomes a `number` on this side of the
 * IPC boundary.
 */
export function BigNumberField({
  value,
  onCommit,
  min = 0n,
  max = 9223372036854775807n,
  disabled,
  className,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onCommit: (value: string) => void;
  min?: bigint;
  max?: bigint;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (): void => {
    const trimmed = draft.replaceAll(',', '').trim();
    if (!/^\d+$/.test(trimmed)) {
      setDraft(value);
      return;
    }
    let next = BigInt(trimmed);
    if (next < min) next = min;
    if (next > max) next = max;
    const text = next.toString();
    setDraft(text);
    if (text !== value) onCommit(text);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      className={cn('numeric h-8 w-28 text-right', className)}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative min-w-52 flex-1', className)}>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? 'Search'}
        className="h-8 pl-8"
      />
    </div>
  );
}
