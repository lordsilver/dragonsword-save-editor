import { HardDriveDownload, LogOut, Save, ShieldCheck } from 'lucide-react';
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
import { NAV_ITEMS } from '@/lib/nav';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

const GROUPS = ['Save', 'Collection', 'Advanced'] as const;

export function Sidebar() {
  const section = useApp((state) => state.section);
  const setSection = useApp((state) => state.setSection);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card/35">
      <div className="flex items-center gap-3 px-4 py-4">
        <img src="/icon.png" alt="" className="size-9 rounded-lg ring-1 ring-white/10" />
        <div className="min-w-0">
          <div className="font-heading text-[13px] leading-none font-semibold tracking-[0.14em] uppercase">
            DragonSword
          </div>
          <div className="mt-1 text-[10px] leading-none tracking-[0.18em] text-muted-foreground uppercase">
            Save Editor
          </div>
        </div>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {GROUPS.map((group) => (
          <div key={group} className="mt-3 first:mt-1">
            <div className="px-2 pb-1 text-[10px] font-medium tracking-[0.16em] text-muted-foreground/70 uppercase">
              {group}
            </div>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setSection(item.id)}
                    className={cn(
                      'group relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                      active
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )}
                  >
                    {active && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-brand" />}
                    <Icon className={cn('size-4', active ? 'text-brand' : 'text-muted-foreground/80')} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <SaveDock />
    </aside>
  );
}

function SaveDock() {
  const save = useApp((state) => state.save);
  const dirty = useApp((state) => state.dirty);
  const draftCount = useApp((state) => state.draftCount);
  const pending = useApp((state) => state.pending);
  const saveNow = useApp((state) => state.saveNow);
  const backupNow = useApp((state) => state.backupNow);
  const closeCurrent = useApp((state) => state.closeCurrent);
  const discardCurrent = useApp((state) => state.discardCurrent);
  const [closeOpen, setCloseOpen] = useState(false);

  if (!save) {
    return (
      <div className="border-t p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand" />
          No save open
        </div>
      </div>
    );
  }

  const hasChanges = dirty || draftCount > 0;

  return (
    <div className="space-y-2 border-t bg-background/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">
            Account {save.accountId} · Slot {save.slot}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn(
                'size-1.5 rounded-full',
                hasChanges ? 'bg-brand shadow-[0_0_6px_var(--brand)]' : 'bg-emerald-400/70',
              )}
            />
            {hasChanges ? 'Unsaved changes' : 'Save file is current'}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon-sm" title="Write a backup copy now" onClick={() => void backupNow()}>
            <HardDriveDownload />
            <span className="sr-only">Backup now</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Close this save"
            onClick={() => {
              const state = useApp.getState();
              if (
                state.dirty ||
                state.draftCount > 0 ||
                (state.pending !== null && state.pending !== 'Copying backup')
              ) {
                setCloseOpen(true);
              } else {
                void closeCurrent();
              }
            }}
          >
            <LogOut />
            <span className="sr-only">Close save</span>
          </Button>
        </div>
      </div>

      <Button className="w-full" disabled={pending === 'Writing save'} onClick={() => void saveNow()}>
        {pending === 'Writing save' ? <Spinner /> : <Save />}
        {pending === 'Writing save' ? 'Writing…' : hasChanges ? 'Save changes' : 'No changes to save'}
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
    </div>
  );
}
