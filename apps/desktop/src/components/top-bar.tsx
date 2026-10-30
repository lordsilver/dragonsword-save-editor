import { Check, ChevronDown, FileUp, FolderOpen, LogOut, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { pickFolder, pickSaveFile } from '@/lib/api';
import { formatDate, useApp } from '@/lib/store';
import type { SlotInfo } from '@/lib/types';
import { cn } from '@/lib/utils';

// Leaving the open save, by closing it or opening another one.
type Leave = { kind: 'close' } | { kind: 'switch'; path: string };

// Which save is open and what can be done with it: switch to another slot,
// close it, or write it.
export function TopBar() {
  const save = useApp((state) => state.save);
  const dirty = useApp((state) => state.dirty);
  const draftCount = useApp((state) => state.draftCount);
  const pending = useApp((state) => state.pending);
  const version = useApp((state) => state.info?.version);
  const saveNow = useApp((state) => state.saveNow);
  const openSave = useApp((state) => state.openSave);
  const closeCurrent = useApp((state) => state.closeCurrent);
  const discardCurrent = useApp((state) => state.discardCurrent);
  const [leaving, setLeaving] = useState<Leave | null>(null);

  if (!save) return null;

  const hasChanges = dirty || draftCount > 0;
  const writing = pending === 'Writing save';

  function leave(next: Leave): void {
    const state = useApp.getState();
    if (state.dirty || state.draftCount > 0 || (state.pending !== null && state.pending !== 'Copying backup')) {
      setLeaving(next);
    } else {
      void finish(next);
    }
  }

  async function finish(next: Leave): Promise<void> {
    if (next.kind === 'close') await closeCurrent();
    else await openSave(next.path);
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-sidebar px-3">
      <img src="/icon.png" alt="" className="size-7 rounded-md" />
      <span className="text-sm font-semibold">DragonSword</span>
      {version && <span className="text-xs text-muted-foreground">{version}</span>}
      <span aria-hidden className="px-1 text-muted-foreground/60">
        /
      </span>
      <SaveSwitcher current={save.path} label={`Account ${save.accountId} · Slot ${save.slot}`} onPick={leave} />
      <span className="flex-1" />
      <Button variant="ghost" size="sm" title="Close this save" onClick={() => leave({ kind: 'close' })}>
        <LogOut />
        Close
      </Button>
      <Button
        size="sm"
        variant={hasChanges ? 'default' : 'outline'}
        className={cn('min-w-20', hasChanges && 'bg-brand text-brand-foreground hover:bg-brand/90')}
        disabled={writing}
        title="Write the save file (Ctrl+S)"
        onClick={() => void saveNow()}
      >
        {writing ? <Spinner /> : <Save />}
        {writing ? 'Writing…' : 'Save'}
      </Button>

      <Dialog open={leaving !== null} onOpenChange={(open) => !open && setLeaving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{leaving?.kind === 'switch' ? 'Open another save?' : 'Close this save?'}</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Saving writes the encrypted file and keeps a timestamped backup. Discarding
              leaves the original file untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setLeaving(null)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const next = leaving;
                  setLeaving(null);
                  if (next?.kind === 'close') void discardCurrent();
                  else if (next) void openSave(next.path);
                }}
              >
                Discard changes
              </Button>
              <Button
                onClick={async () => {
                  const next = leaving;
                  if (next && (await saveNow())) {
                    setLeaving(null);
                    await finish(next);
                  }
                }}
              >
                {leaving?.kind === 'switch' ? 'Save and open' : 'Save and close'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}

// The open save's name, opening the slots found in the save folder and the
// ways to open one from elsewhere. The folder is rescanned each time it opens.
function SaveSwitcher({ current, label, onPick }: { current: string; label: string; onPick: (leave: Leave) => void }) {
  const scan = useApp((state) => state.scan);
  const scanning = useApp((state) => state.scanning);
  const lastFolder = useApp((state) => state.settings.lastFolder);
  const refreshScan = useApp((state) => state.refreshScan);
  const setSettings = useApp((state) => state.setSettings);

  const accounts = new Map<string, SlotInfo[]>();
  for (const slot of scan.slots) accounts.set(slot.accountId, [...(accounts.get(slot.accountId) ?? []), slot]);

  async function openFile(): Promise<void> {
    try {
      const path = await pickSaveFile();
      if (path) onPick({ kind: 'switch', path });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function scanFolder(): Promise<void> {
    try {
      const path = await pickFolder();
      if (!path) return;
      await setSettings({ lastFolder: path });
      await refreshScan(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && lastFolder && void refreshScan(lastFolder, true)}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" title={current} className="font-normal">
          {label}
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {scanning && scan.slots.length === 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
            <Spinner className="size-3.5" />
            Looking for saves…
          </div>
        )}
        {[...accounts].map(([account, slots]) => (
          <div key={account}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Account {account}</DropdownMenuLabel>
            {slots.map((slot) => (
              <DropdownMenuItem
                key={slot.path}
                onSelect={() => slot.path !== current && onPick({ kind: 'switch', path: slot.path })}
              >
                <Check className={cn(slot.path !== current && 'invisible')} />
                <span>Slot {slot.slot}</span>
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(slot.modifiedMs)}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
        {scan.slots.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => void openFile()}>
          <FileUp />
          Open save file…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void scanFolder()}>
          <FolderOpen />
          Scan another folder…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
