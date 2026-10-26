import {
  BookOpen,
  Database,
  FolderOpen,
  HardDriveDownload,
  Info,
  Keyboard,
  Languages,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Sun,
  Type,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/page';
import { InfoNote, StatTile } from '@/components/summary';
import { useTheme } from '@/components/theme-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { pickFolder, pickSaveFile } from '@/lib/api';
import { formatNumber, useApp } from '@/lib/store';
import type { Settings } from '@/lib/types';
import { cn } from '@/lib/utils';

export function SettingsScreen() {
  const settings = useApp((state) => state.settings);
  const info = useApp((state) => state.info);
  const save = useApp((state) => state.save);
  const dirty = useApp((state) => state.dirty);
  const scan = useApp((state) => state.scan);
  const pending = useApp((state) => state.pending);
  const setSettings = useApp((state) => state.setSettings);
  const refreshScan = useApp((state) => state.refreshScan);
  const openSave = useApp((state) => state.openSave);
  const saveNow = useApp((state) => state.saveNow);
  const backupNow = useApp((state) => state.backupNow);
  const { preference, resolved, setPreference } = useTheme();

  const busy = pending !== null;

  async function chooseFolder(): Promise<void> {
    try {
      const path = await pickFolder();
      if (!path) return;
      await setSettings({ lastFolder: path });
      await refreshScan(path);
      toast.success('Save folder updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function chooseSave(): Promise<void> {
    if (dirty) {
      toast.error('Save or discard your changes before opening another save.');
      return;
    }
    try {
      const path = await pickSaveFile();
      if (path) await openSave(path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  function update(patch: Partial<Settings>): void {
    void setSettings(patch);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Appearance, language, save discovery and the details of the open file. Preferences are stored outside the game save."
        actions={
          save && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void chooseSave()}>
              <FolderOpen />
              Open another save
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Settings2 />}
          label="Version"
          value={info?.version ?? '0.1.0'}
          detail={info?.platform ?? 'unknown platform'}
        />
        <StatTile
          icon={<Database />}
          label="Catalog items"
          value={formatNumber(info?.catalog.items ?? 0)}
          detail={`${formatNumber(info?.catalog.recipes ?? 0)} recipes · ${formatNumber(info?.catalog.titles ?? 0)} titles`}
        />
        <StatTile
          icon={<FolderOpen />}
          label="Saves found"
          value={formatNumber(scan.slots.length)}
          detail={scan.roots.length ? `${scan.roots.length} search roots` : 'No scan yet'}
        />
        <StatTile
          icon={<ShieldCheck />}
          label="Open save"
          value={save ? `Slot ${save.slot}` : 'None'}
          detail={save ? `Account ${save.accountId}` : 'Open a save to edit'}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel title="Appearance" description="The theme applies immediately and is remembered between launches.">
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                <Palette className="size-3.5 text-brand" />
                Theme
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['light', 'Light', Sun],
                    ['dark', 'Dark', Moon],
                    ['system', 'System', Monitor],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreference(value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors',
                      preference === value
                        ? 'border-brand/40 bg-brand/10 text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50',
                    )}
                  >
                    <Icon className={cn('size-4', preference === value && 'text-brand')} />
                    {label}
                    {value === 'system' && <span className="text-[9px] text-muted-foreground">now {resolved}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                <Languages className="size-3.5 text-brand" />
                Catalog language
              </div>
              <div className="flex gap-2">
                {(
                  [
                    ['en', 'English'],
                    ['fr', 'Français'],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    variant={settings.language === value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => update({ language: value })}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Item and recipe names come from the bundled catalog. Unknown entries fall back to English.
              </p>
            </div>

            <div className="space-y-2 border-t pt-3">
              <ToggleRow
                icon={<Type />}
                label="Compact rows"
                description="Reduce vertical padding in tables and lists."
                checked={settings.compactRows}
                onCheckedChange={(checked) => update({ compactRows: checked })}
              />
              <ToggleRow
                icon={<Info />}
                label="Show unknown items"
                description="Keep catalog misses visible instead of hiding them behind a generic entry."
                checked={settings.showUnknown}
                onCheckedChange={(checked) => update({ showUnknown: checked })}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Save files and backups" description="Where the editor looks and what it does before writing.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-medium">
                <FolderOpen className="size-3.5 text-brand" />
                Save folder
              </div>
              <div className="rounded-lg border bg-muted/20 p-2 font-mono text-[11px] break-all">
                {settings.lastFolder ?? 'Not set — scan a folder or open a .db file directly.'}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void chooseFolder()}>
                  <FolderOpen />
                  Choose folder
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void refreshScan(settings.lastFolder ?? undefined)}
                >
                  <RefreshCw />
                  Rescan
                </Button>
              </div>
            </div>

            {save && (
              <div className="space-y-1.5 border-t pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">Open file</span>
                  <Badge variant="outline">{dirty ? 'Unsaved changes' : 'Current'}</Badge>
                </div>
                <div className="rounded-lg border bg-muted/20 p-2 font-mono text-[11px] break-all">{save.path}</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || !dirty} onClick={() => void saveNow()}>
                    <Save />
                    Save changes
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => void backupNow()}>
                    <HardDriveDownload />
                    Backup now
                  </Button>
                </div>
              </div>
            )}

            <div className="border-t pt-3">
              <InfoNote>
                The first write of each session creates a timestamped <span className="font-mono">.bak</span> next to
                the save, and writing is refused if the file changed on disk since it was opened or last written. Writes
                are atomic: the editor re-encrypts to a temporary file and swaps it in only after the round trip
                succeeds.
              </InfoNote>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel title="Keyboard shortcuts" description="Available whenever a save is open.">
          <div className="space-y-1.5">
            {[
              ['Ctrl / ⌘ + S', 'Write the current save'],
              ['Ctrl / ⌘ + B', 'Copy a backup now'],
              ['Ctrl / ⌘ + O', 'Open another save file'],
            ].map(([keys, action]) => (
              <div
                key={keys}
                className="flex items-center justify-between gap-3 rounded-md border bg-background/30 px-2.5 py-1.5 text-xs"
              >
                <span className="text-muted-foreground">{action}</span>
                <kbd className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]">{keys}</kbd>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Keyboard className="size-3.5" />
            Shortcuts are ignored while a text field has focus.
          </div>
        </Panel>

        <Panel title="About and credits" description="This is an unofficial, offline fan tool.">
          <div className="space-y-2 text-xs">
            <AboutRow label="Product" value="DragonSword Save Editor" />
            <AboutRow label="Version" value={info?.version ?? '0.1.0'} />
            <AboutRow label="Platform" value={info?.platform ?? 'unknown'} />
            <AboutRow label="Data directory" value={info?.dataDir ?? 'unknown'} mono />
            <AboutRow label="Settings file" value={info?.settingsPath ?? 'unknown'} mono />
            <AboutRow
              label="Catalog"
              value={`${formatNumber(info?.catalog.items ?? 0)} items · ${formatNumber(info?.catalog.categories ?? 0)} categories`}
            />
          </div>
          <div className="mt-4 space-y-2 border-t pt-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <BookOpen className="size-3.5 text-brand" />
              Game data
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Names, numbers and icons come from DragonSword Awakening's own files. This tool ships no game code.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background/30 px-3 py-2">
      <span className="text-brand [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[10px] text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

function AboutRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b pb-1.5 last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 truncate text-right', mono && 'font-mono text-[10px]')} title={value}>
        {value}
      </span>
    </div>
  );
}
