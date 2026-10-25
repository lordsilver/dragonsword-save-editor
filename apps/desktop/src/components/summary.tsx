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
    <div className={cn('rounded-xl border bg-card/70 p-4 shadow-xs', className)}>
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase [&_svg]:size-3.5 [&_svg]:text-brand">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-heading text-lg font-semibold tracking-tight">{value}</div>
      {detail && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</div>}
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
        'flex gap-2.5 rounded-lg border p-3 text-xs leading-relaxed',
        tone === 'warning'
          ? 'border-amber-400/25 bg-amber-400/5 text-amber-200/90'
          : 'bg-muted/30 text-muted-foreground',
        className,
      )}
    >
      <Info className={cn('mt-0.5 size-3.5 shrink-0', tone === 'warning' ? 'text-amber-300' : 'text-brand')} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
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
        'numeric inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        tone === 'brand' ? 'border-brand/30 bg-brand/10 text-brand' : 'bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
