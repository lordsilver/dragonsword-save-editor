import { HardDriveDownload, LogOut, Save, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
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

// The open save at the foot of the sidebar: which file it is, whether it has
// unsaved changes or something running, then Save, Backup and Close.
export function SavePanel() {
  const save = useApp((state) => state.save);
  const dirty = useApp((state) => state.dirty);
  const draftCount = useApp((state) => state.draftCount);
  const pending = useApp((state) => state.pending);
  const saveNow = useApp((state) => state.saveNow);
  const backupNow = useApp((state) => state.backupNow);
  const closeCurrent = useApp((state) => state.closeCurrent);
  const discardCurrent = useApp((state) => state.discardCurrent);
  const setSection = useApp((state) => state.setSection);
  const [closeOpen, setCloseOpen] = useState(false);

  if (!save) return null;

  const hasChanges = dirty || draftCount > 0;
  const writing = pending === 'Writing save';
  const { danglingGemLinks, duplicateGemLinks, teamIssues } = save.consistency;
  const issues = danglingGemLinks.length + duplicateGemLinks.length + teamIssues.length;
  const file = save.path.split(/[\\/]/).pop();

  return (
    <div className="flex flex-col gap-2 border-t px-3 pt-3 pb-3">
      <div className="min-w-0 px-1" title={save.path}>
        <div className="truncate text-sm font-medium">Account {save.accountId}</div>
        <div className="truncate text-xs text-muted-foreground">
          Slot {save.slot} · <span className="font-mono">{file}</span>
        </div>
      </div>

      <div className="flex min-h-5 items-center gap-1.5 px-1 text-xs text-muted-foreground">
        {pending ? (
          <>
            <Spinner className="size-3.5" />
            <span className="truncate">{pending}</span>
          </>
        ) : (
          <>
            <span
              aria-hidden
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                hasChanges ? 'bg-brand shadow-[0_0_6px_var(--brand)]' : 'bg-ok',
              )}
            />
            <span className={cn(hasChanges && 'font-medium text-foreground')}>
              {hasChanges ? 'Unsaved changes' : 'Saved'}
            </span>
          </>
        )}
      </div>

      {issues > 0 && (
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-1 text-left text-xs font-medium text-warn-strong hover:bg-accent"
          title="Broken links between rows, found when the save was opened"
          onClick={() => setSection('overview')}
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {issues} {issues === 1 ? 'issue' : 'issues'}
        </button>
      )}

      <Button
        variant={hasChanges ? 'default' : 'outline'}
        className={cn('w-full', hasChanges && 'bg-brand text-brand-foreground hover:bg-brand/90')}
        disabled={writing}
        title="Write the save file (Ctrl+S)"
        onClick={() => void saveNow()}
      >
        {writing ? <Spinner /> : <Save />}
        {writing ? 'Writing…' : 'Save'}
      </Button>
      <div className="grid grid-cols-2 gap-1">
        <Button variant="ghost" size="sm" title="Write a backup copy now (Ctrl+B)" onClick={() => void backupNow()}>
          <HardDriveDownload />
          Backup
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Close this save"
          onClick={() => {
            const state = useApp.getState();
            if (state.dirty || state.draftCount > 0 || (state.pending !== null && state.pending !== 'Copying backup')) {
              setCloseOpen(true);
            } else {
              void closeCurrent();
            }
          }}
        >
          <LogOut />
          Close
        </Button>
      </div>

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
    </div>
  );
}
