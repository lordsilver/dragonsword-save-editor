import { HardDriveDownload, LogOut, Monitor, Moon, Save, Sun, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { type ThemePreference, useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

const item = 'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs';

const THEMES: Record<ThemePreference, { label: string; icon: typeof Sun; next: ThemePreference }> = {
  system: { label: 'System', icon: Monitor, next: 'light' },
  light: { label: 'Light', icon: Sun, next: 'dark' },
  dark: { label: 'Dark', icon: Moon, next: 'system' },
};

// The open save at a glance: whether it has unsaved changes, which file it
// is, what is running, and the save, backup and close actions.
export function StatusBar() {
  const save = useApp((state) => state.save);
  const dirty = useApp((state) => state.dirty);
  const draftCount = useApp((state) => state.draftCount);
  const pending = useApp((state) => state.pending);
  const saveNow = useApp((state) => state.saveNow);
  const backupNow = useApp((state) => state.backupNow);
  const closeCurrent = useApp((state) => state.closeCurrent);
  const discardCurrent = useApp((state) => state.discardCurrent);
  const setSection = useApp((state) => state.setSection);
  const theme = useTheme();
  const [closeOpen, setCloseOpen] = useState(false);

  if (!save) return null;

  const hasChanges = dirty || draftCount > 0;
  const writing = pending === 'Writing save';
  const { danglingGemLinks, duplicateGemLinks, teamIssues } = save.consistency;
  const issues = danglingGemLinks.length + duplicateGemLinks.length + teamIssues.length;
  const current = THEMES[theme.preference];
  const ThemeIcon = current.icon;

  return (
    <footer className="flex shrink-0 items-center gap-1 border-t bg-sidebar px-3 py-1 text-xs text-muted-foreground">
      <span className={cn(item, hasChanges && 'font-medium text-foreground')}>
        <span
          aria-hidden
          className={cn('size-1.5 rounded-full', hasChanges ? 'bg-brand shadow-[0_0_6px_var(--brand)]' : 'bg-ok')}
        />
        {hasChanges ? 'Unsaved changes' : 'Saved'}
      </span>
      <span className={item}>
        Account {save.accountId} · Slot {save.slot}
      </span>
      <span className={cn(item, 'min-w-0 font-mono')} title={save.path}>
        <span className="truncate">{save.path.split(/[\\/]/).slice(-2).join('/')}</span>
      </span>
      {issues > 0 && (
        <button
          type="button"
          className={cn(item, 'font-medium text-warn-strong hover:bg-accent')}
          title="Broken links between rows, found when the save was opened"
          onClick={() => setSection('overview')}
        >
          <TriangleAlert aria-hidden className="size-3.5" />
          {issues} {issues === 1 ? 'issue' : 'issues'}
        </button>
      )}
      {pending && (
        <span className={item}>
          <Spinner className="size-3.5" />
          {pending}
        </span>
      )}
      <span className="flex-1" />
      <button
        type="button"
        title={`Theme: ${current.label} (click for ${THEMES[current.next].label})`}
        onClick={() => theme.setPreference(current.next)}
        className={cn(item, 'hover:bg-accent hover:text-foreground')}
      >
        <ThemeIcon aria-hidden className="size-3.5" />
        {current.label}
      </button>
      <button
        type="button"
        title="Write a backup copy now (Ctrl+B)"
        onClick={() => void backupNow()}
        className={cn(item, 'hover:bg-accent hover:text-foreground')}
      >
        <HardDriveDownload aria-hidden className="size-3.5" />
        Backup
      </button>
      <button
        type="button"
        title="Close this save"
        onClick={() => {
          const state = useApp.getState();
          if (state.dirty || state.draftCount > 0 || (state.pending !== null && state.pending !== 'Copying backup')) {
            setCloseOpen(true);
          } else {
            void closeCurrent();
          }
        }}
        className={cn(item, 'hover:bg-accent hover:text-foreground')}
      >
        <LogOut aria-hidden className="size-3.5" />
        Close
      </button>
      <Button
        size="sm"
        variant={hasChanges ? 'default' : 'outline'}
        className={cn('ml-1 h-7', hasChanges && 'bg-brand text-brand-foreground hover:bg-brand/90')}
        disabled={writing}
        title="Write the save file (Ctrl+S)"
        onClick={() => void saveNow()}
      >
        {writing ? <Spinner /> : <Save />}
        {writing ? 'Writing…' : 'Save'}
      </Button>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close this save?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Saving writes the encrypted file and keeps a timestamped backup. Discarding
              leaves the original file untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setCloseOpen(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCloseOpen(false);
                  void discardCurrent();
                }}
              >
                Discard changes
              </Button>
              <Button
                onClick={async () => {
                  if (await saveNow()) {
                    setCloseOpen(false);
                    await closeCurrent();
                  }
                }}
              >
                Save and close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </footer>
  );
}
