import {
  ChevronRight,
  FileWarning,
  FolderOpen,
  HardDriveDownload,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Swords,
  Wand2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { EmptyPanel } from '@/components/common';
import { useTheme } from '@/components/theme-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { pickFolder, pickSaveFile } from '@/lib/api';
import { formatBytes, formatDate, useApp } from '@/lib/store';
import type { SlotInfo } from '@/lib/types';
import { cn } from '@/lib/utils';

export function StartScreen() {
  const scanning = useApp((state) => state.scanning);
  const scan = useApp((state) => state.scan);
  const info = useApp((state) => state.info);
  const refreshScan = useApp((state) => state.refreshScan);
  const setSettings = useApp((state) => state.setSettings);
  const openSave = useApp((state) => state.openSave);
  const pending = useApp((state) => state.pending);
  const { resolved, setPreference } = useTheme();

  async function chooseFile(): Promise<void> {
    try {
      const path = await pickSaveFile();
      if (path) await openSave(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function chooseFolder(): Promise<void> {
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
    <div className="scroll-thin h-svh overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-8 pb-16">
        <header className="flex items-center justify-between py-5">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" className="size-9 rounded-lg ring-1 ring-white/10" />
            <div>
              <div className="font-heading text-[13px] leading-none font-semibold tracking-[0.14em] uppercase">
                DragonSword
              </div>
              <div className="mt-1 text-[10px] leading-none tracking-[0.18em] text-muted-foreground uppercase">
                Save Editor
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="hidden border-emerald-400/25 bg-emerald-400/10 text-emerald-300 sm:flex"
            >
              <ShieldCheck className="size-3" />
              Offline and local
            </Badge>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Toggle theme"
              onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}
            >
              {resolved === 'dark' ? <Sun /> : <Moon />}
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>
        </header>

        <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-[11px] tracking-wide text-muted-foreground">
              <Wand2 className="size-3.5 text-brand" />
              SQLCipher v4 · typed editor · automatic backups
            </div>
            <div className="space-y-3">
              <h1 className="font-heading text-5xl leading-[1.02] font-semibold tracking-[-0.03em] text-balance">
                Your legend,
                <br />
                <span className="text-brand">unlocked.</span>
              </h1>
              <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Edit DragonSword Awakening saves without touching the encryption. Change currencies, tune characters,
                complete the cookbook, and adjust your gear — then write the file back exactly as the game expects it.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => void chooseFile()} disabled={pending !== null}>
                <FolderOpen />
                Open save file
              </Button>
              <Button size="lg" variant="outline" onClick={() => void chooseFolder()} disabled={scanning}>
                {scanning ? <Spinner /> : <RefreshCw />}
                Scan a folder
              </Button>
            </div>
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <Feature icon={<ShieldCheck />} title="Keeps the salt" text="Reuses the original SQLCipher salt." />
              <Feature
                icon={<HardDriveDownload />}
                title="Won't overwrite"
                text="Refuses if the game saved after you opened it."
              />
              <Feature icon={<FileWarning />} title="Never auto-saves" text="Nothing is written until you say so." />
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-6 rounded-[2rem] bg-brand/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border bg-card/80 p-6 shadow-2xl ring-1 ring-white/5">
              <img src="/icon.png" alt="" className="mx-auto size-44 rounded-2xl ring-1 ring-white/10" />
              <div className="mt-6 space-y-1 text-center">
                <div className="font-heading text-lg font-semibold tracking-tight">A cleaner save file</div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The database is decrypted to a private temporary file, edited in SQLite, then re-encrypted and
                  atomically swapped in.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <Stat label="Items" value={info?.catalog.items ?? '—'} />
                <Stat label="Recipes" value={info?.catalog.recipes ?? '—'} />
                <Stat label="Titles" value={info?.catalog.titles ?? '—'} />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold tracking-tight">Saves on this machine</h2>
              <p className="text-xs text-muted-foreground">
                {scan.roots.length > 0
                  ? `Searched ${scan.roots.join(' · ')}`
                  : 'Open a file, or scan the usual game folders.'}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={scanning} onClick={() => void refreshScan()}>
              {scanning ? <Spinner /> : <RefreshCw />}
              Rescan
            </Button>
          </div>

          {scanning && scan.slots.length === 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {['first', 'second', 'third'].map((placeholder) => (
                <div key={placeholder} className="h-44 animate-pulse rounded-xl border bg-card/40" />
              ))}
            </div>
          ) : scan.slots.length === 0 ? (
            <EmptyPanel
              icon={<FolderOpen />}
              title="No saves found yet"
              description="Pick the folder that contains your DragonSword Awakening saves, or open a .db file directly."
              action={
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void chooseFile()}>
                    Open a file
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void chooseFolder()}>
                    Choose a folder
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {scan.slots.map((slot) => (
                <SlotCard key={slot.path} slot={slot} onOpen={() => void openSave(slot.path)} />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-[11px] text-muted-foreground">
          <span>Unofficial fan tool. Not affiliated with the game's publisher.</span>
          <span className="font-mono">
            v{info?.version ?? '0.1.0'} · {info?.platform ?? 'web'}
          </span>
        </footer>
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg border bg-card/40 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-foreground [&_svg]:size-3.5 [&_svg]:text-brand">{icon}</div>
      <div className="text-[11px] font-medium text-foreground">{title}</div>
      <div className="mt-0.5 text-[11px] leading-snug">{text}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-background/40 px-2 py-2">
      <div className="numeric text-sm font-semibold">{value}</div>
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  );
}

function SlotCard({ slot, onOpen }: { slot: SlotInfo; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-xl border bg-card/60 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg"
    >
      <div className="relative aspect-[16/7] overflow-hidden bg-gradient-to-br from-brand/20 via-background to-background">
        {slot.screenshot ? (
          <img src={slot.screenshot} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground/70">
            <Swords className="size-7 text-brand/70" />
            <span className="text-[10px] tracking-[0.16em] uppercase">No screenshot</span>
          </div>
        )}
        <Badge className="absolute top-2 left-2 border-black/20 bg-black/55 text-white backdrop-blur">
          Slot {slot.slot}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Account {slot.accountId}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formatDate(slot.modifiedMs)} · {formatBytes(slot.size)}
          </div>
        </div>
        <ChevronRight
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            'group-hover:translate-x-0.5 group-hover:text-brand',
          )}
        />
      </div>
    </button>
  );
}
