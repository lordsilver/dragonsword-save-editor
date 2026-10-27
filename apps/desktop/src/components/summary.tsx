import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StatTile({
  icon,
  label,
  value,
  detail,
  className,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border px-4 py-3', className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      {detail && <div className="truncate text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

export function InfoNote({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'warning';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
        tone === 'warning' ? 'border-warn-line bg-warn-soft text-warn-strong' : 'bg-muted/30 text-muted-foreground',
        className,
      )}
    >
      <Info className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' ? 'text-warn' : 'text-muted-foreground')} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function CountPill({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: 'muted' | 'brand';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'numeric inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        tone === 'brand' ? 'border-brand/30 bg-brand/10 text-brand' : 'bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
