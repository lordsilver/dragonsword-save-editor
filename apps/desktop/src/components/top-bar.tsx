import { HardDriveDownload, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { SECTION_LABELS } from '@/lib/nav';
import { useApp } from '@/lib/store';

export function TopBar() {
  const section = useApp((state) => state.section);
  const save = useApp((state) => state.save);
  const dirty = useApp((state) => state.dirty);
  const pending = useApp((state) => state.pending);
  const saveNow = useApp((state) => state.saveNow);
  const backupNow = useApp((state) => state.backupNow);

  const busy = pending !== null;

  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-4 border-b bg-background/55 px-5 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-heading text-sm font-semibold tracking-tight">{SECTION_LABELS[section]}</span>
        {save && (
          <>
            <span className="text-muted-foreground/40">/</span>
            <span className="truncate font-mono text-[11px] text-muted-foreground" title={save.path}>
              {save.path.split(/[\\/]/).slice(-2).join('/')}
            </span>
            {dirty && (
              <Badge variant="outline" className="border-brand/30 bg-brand/10 text-brand">
                Unsaved
              </Badge>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {pending && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            {pending}
          </span>
        )}
        {save && (
          <>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void backupNow()}>
              <HardDriveDownload />
              Backup
            </Button>
            <Button size="sm" disabled={busy || !dirty} onClick={() => void saveNow()}>
              <Save />
              Save changes
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
