import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function ConfirmButton({
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
  variant = 'destructive',
  size = 'default',
  disabled,
  className,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  children: ReactNode;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled} className={className}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={variant === 'destructive' ? 'destructive' : 'default'} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function EmptyPanel({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn('border border-dashed bg-card/30 py-14', className)}>
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action}
    </Empty>
  );
}

export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="numeric">
        {total.toLocaleString()} rows · page {page + 1} of {Math.max(1, pages)}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          <ChevronLeftIcon />
          <span className="sr-only">Previous page</span>
        </Button>
        <Button variant="outline" size="icon-sm" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          <ChevronRightIcon />
          <span className="sr-only">Next page</span>
        </Button>
      </div>
    </div>
  );
}

const LOADING_PLACEHOLDERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {LOADING_PLACEHOLDERS.slice(0, rows).map((placeholder) => (
        <Skeleton key={placeholder} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  );
}
