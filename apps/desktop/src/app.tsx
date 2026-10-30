import { listen } from '@tauri-apps/api/event';
import { AppWindow, FolderOpen, ShieldCheck, Terminal } from 'lucide-react';
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Sidebar } from '@/components/sidebar';
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
import { closeRequestCancelled, closeWindow, pickSaveFile } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Section } from '@/lib/types';
import { CharactersScreen } from '@/screens/characters';
import { CookingScreen } from '@/screens/cooking';
import { CostumesScreen } from '@/screens/costumes';
import { CurrenciesScreen } from '@/screens/currencies';
import { EquipmentScreen } from '@/screens/equipment';
import { GemsScreen } from '@/screens/gems';
import { InventoryScreen } from '@/screens/inventory';
import { KarmaScreen } from '@/screens/karma';
import { MountsScreen } from '@/screens/mounts';
import { OverviewScreen } from '@/screens/overview';
import { RawScreen } from '@/screens/raw';
import { SettingsScreen } from '@/screens/settings';
import { StartScreen } from '@/screens/start';
import { TitlesScreen } from '@/screens/titles';

const SCREENS: Record<Section, () => ReactElement | null> = {
  overview: OverviewScreen,
  currencies: CurrenciesScreen,
  inventory: InventoryScreen,
  characters: CharactersScreen,
  equipment: EquipmentScreen,
  gems: GemsScreen,
  karma: KarmaScreen,
  costumes: CostumesScreen,
  mounts: MountsScreen,
  titles: TitlesScreen,
  cooking: CookingScreen,
  raw: RawScreen,
  settings: SettingsScreen,
};

export function App() {
  const booted = useApp((state) => state.booted);
  const desktop = useApp((state) => state.desktop);
  const save = useApp((state) => state.save);
  const section = useApp((state) => state.section);
  const loading = useApp((state) => state.loading);
  const dirty = useApp((state) => state.dirty);
  const draftCount = useApp((state) => state.draftCount);
  const boot = useApp((state) => state.boot);
  const saveNow = useApp((state) => state.saveNow);
  const discardCurrent = useApp((state) => state.discardCurrent);
  const backupNow = useApp((state) => state.backupNow);
  const openSave = useApp((state) => state.openSave);
  const [closeRequestOpen, setCloseRequestOpen] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void boot();
  }, [boot]);

  useEffect(() => {
    document.title = save
      ? `Account ${save.accountId} · Slot ${save.slot} — DragonSword Save Editor`
      : 'DragonSword Save Editor';
  }, [save]);

  useEffect(() => {
    if (!dirty && draftCount === 0) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, draftCount]);

  useEffect(() => {
    if (!desktop) return undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<boolean>('window-close-requested', (event) => {
      // Acknowledge receipt before doing any work. The Rust fallback only
      // fires when a second close request arrives before this clears, so a
      // responsive UI must never leave the first request pending.
      void closeRequestCancelled().catch(() => undefined);
      const state = useApp.getState();
      // The backend says whether the session is dirty. A field draft or an
      // action that has not finished yet also counts as unsaved work.
      if (!event.payload && state.draftCount === 0 && state.pending === null) {
        void closeWindow().catch((error) => {
          toast.error(error instanceof Error ? error.message : String(error));
        });
        return;
      }
      setCloseRequestOpen(true);
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (save) void saveNow();
        return;
      }
      if (key === 'b') {
        event.preventDefault();
        if (save) void backupNow();
        return;
      }
      if (key === 'o') {
        event.preventDefault();
        if (dirty || draftCount > 0) {
          toast.error('Save or discard your changes before opening another save.');
          return;
        }
        void (async () => {
          try {
            const path = await pickSaveFile();
            if (path) await openSave(path);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
          }
        })();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [backupNow, dirty, draftCount, openSave, save, saveNow]);

  if (!booted) return <BootSplash />;
  if (!desktop) return <DesktopRequired />;
  if (!save) return <StartScreen />;

  const Screen = SCREENS[section];

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <main className="scroll-thin h-full overflow-y-auto">
            <div key={section} className="mx-auto w-full max-w-[1440px] px-8 pt-6 pb-8">
              <Screen />
            </div>
          </main>
          {loading && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-brand/10">
              <div className="animate-indeterminate h-full w-1/3 bg-brand" />
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={closeRequestOpen}
        onOpenChange={(open) => {
          setCloseRequestOpen(open);
          if (!open) void closeRequestCancelled().catch(() => undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close the editor?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Saving writes the encrypted file and keeps a timestamped backup. Discarding
              leaves the original file untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => setCloseRequestOpen(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  setCloseRequestOpen(false);
                  await discardCurrent(false);
                  try {
                    await closeWindow();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : String(error));
                  }
                }}
              >
                Discard and close
              </Button>
              <Button
                onClick={async () => {
                  if (await saveNow()) {
                    setCloseRequestOpen(false);
                    try {
                      await closeWindow();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : String(error));
                    }
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

function BootSplash() {
  return (
    <div className="flex h-svh items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute -inset-4 rounded-3xl bg-brand/15 blur-2xl" />
          <img src="/icon.png" alt="" className="relative size-20 rounded-2xl ring-1 ring-white/10" />
        </div>
        <div className="text-center">
          <div className="font-heading text-sm font-semibold tracking-[0.14em] uppercase">DragonSword</div>
          <div className="mt-1 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Save Editor</div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Loading the catalog and checking for saves…
        </div>
      </div>
    </div>
  );
}

function DesktopRequired() {
  return (
    <div className="scroll-thin flex h-svh items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-xl rounded-2xl border bg-card/80 p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <img src="/icon.png" alt="" className="size-12 rounded-xl ring-1 ring-white/10" />
          <div>
            <div className="font-heading text-sm font-semibold tracking-[0.14em] uppercase">DragonSword</div>
            <div className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Save Editor</div>
          </div>
        </div>
        <h1 className="mt-6 font-heading text-xl font-semibold tracking-tight">Open this in the desktop app</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The browser preview cannot read or write local save files. Start the Tauri shell to open an encrypted
          DragonSword Awakening save.
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/30 p-3 font-mono text-[11px]">
          <Terminal className="mt-0.5 size-3.5 shrink-0 text-brand" />
          pnpm desktop
        </div>
        <div className="mt-5 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <Feature icon={<AppWindow />} title="Native window" text="Runs as a Tauri 2 app." />
          <Feature icon={<FolderOpen />} title="Local files" text="Reads saves in place." />
          <Feature icon={<ShieldCheck />} title="Offline" text="No network calls." />
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border bg-background/40 p-2.5">
      <div className="mb-1 text-brand [&_svg]:size-3.5">{icon}</div>
      <div className="text-[11px] font-medium text-foreground">{title}</div>
      <div className="mt-0.5 text-[10px] leading-snug">{text}</div>
    </div>
  );
}
