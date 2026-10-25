import { Check, Lock, PawPrint, Search, Sparkles, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel } from '@/components/common';
import { ItemIcon, gradeTone } from '@/components/item-icon';
import { PageHeader, Panel, Toolbar } from '@/components/page';
import { NativeSelect } from '@/components/select';
import { CountPill, InfoNote, StatTile } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { CatalogEntry, Vehicle } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tab = 'owned' | 'catalog';

export function MountsScreen() {
  const mounts = useApp((state) => state.mounts);
  const catalog = useApp((state) => state.mountCatalog);
  const characters = useApp((state) => state.characters);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const compactRows = useApp((state) => state.settings.compactRows);
  const showUnknown = useApp((state) => state.settings.showUnknown);
  const pending = useApp((state) => state.pending);
  const equipMount = useApp((state) => state.equipMount);
  const unlockMount = useApp((state) => state.unlockMount);
  const [tab, setTab] = useState<Tab>('owned');
  const [query, setQuery] = useState('');
  const [lockedOnly, setLockedOnly] = useState(false);

  const needle = query.trim().toLowerCase();
  const owned = useMemo(
    () =>
      mounts
        .filter((mount) => {
          if (!showUnknown && !mount.item.known) return false;
          if (!needle) return true;
          return (
            mount.item.nameEn.toLowerCase().includes(needle) ||
            mount.item.nameFr.toLowerCase().includes(needle) ||
            mount.cid.toString().includes(needle) ||
            mount.dbid.includes(needle)
          );
        })
        .sort((left, right) => left.cid - right.cid),
    [mounts, needle, showUnknown],
  );
  const missing = useMemo(
    () =>
      catalog
        .filter((entry) => {
          if (lockedOnly && entry.owned) return false;
          if (!needle) return true;
          return (
            entry.item.nameEn.toLowerCase().includes(needle) ||
            entry.item.nameFr.toLowerCase().includes(needle) ||
            entry.item.cid.toString().includes(needle)
          );
        })
        .sort(
          (left, right) =>
            Number(left.owned) - Number(right.owned) || left.item.nameEn.localeCompare(right.item.nameEn),
        ),
    [catalog, lockedOnly, needle],
  );

  const equipped = mounts.filter((mount) => mount.equippedBy !== null).length;
  const busy = pending !== null;

  async function changeOwner(mount: Vehicle, cid: number): Promise<void> {
    if (cid === (mount.equippedBy ?? 0)) return;
    if (mount.equippedBy !== null) await equipMount(mount.equippedBy, '0');
    if (cid !== 0) await equipMount(cid, mount.dbid);
  }

  if (!save) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${save.accountId} · Slot ${save.slot}`}
        title="Mounts"
        description="Vehicles in tb_vehicle and the character each one is currently assigned to. Unlocking adds a row with a random uint32 instance id."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<PawPrint />}
          label="Owned"
          value={formatNumber(mounts.length)}
          detail={`of ${catalog.length} catalog mounts`}
        />
        <StatTile
          icon={<Lock />}
          label="Missing"
          value={formatNumber(catalog.length - mounts.length)}
          detail="Can be unlocked here"
        />
        <StatTile
          icon={<UserCheck />}
          label="Equipped"
          value={formatNumber(equipped)}
          detail="Assigned to a character"
        />
        <StatTile
          icon={<Sparkles />}
          label="Matching"
          value={formatNumber(tab === 'owned' ? owned.length : missing.length)}
          detail={query ? `Search: ${query}` : 'No search applied'}
        />
      </div>

      <Toolbar>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          <Button size="xs" variant={tab === 'owned' ? 'secondary' : 'ghost'} onClick={() => setTab('owned')}>
            Owned
            <CountPill>{formatNumber(mounts.length)}</CountPill>
          </Button>
          <Button size="xs" variant={tab === 'catalog' ? 'secondary' : 'ghost'} onClick={() => setTab('catalog')}>
            Catalog
            <CountPill>{formatNumber(catalog.length)}</CountPill>
          </Button>
        </div>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search mounts"
            className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-8 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30"
          />
        </div>
        {tab === 'catalog' && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={lockedOnly}
              onCheckedChange={setLockedOnly}
              size="sm"
              aria-label="Show only missing mounts"
            />
            Missing only
          </span>
        )}
        <Badge variant="outline" className="ml-auto">
          {formatNumber(tab === 'owned' ? owned.length : missing.length)} shown
        </Badge>
      </Toolbar>

      {tab === 'owned' ? (
        owned.length === 0 ? (
          <EmptyPanel
            icon={<PawPrint />}
            title={mounts.length === 0 ? 'No mounts owned' : 'No mount matches that search'}
            description={
              mounts.length === 0
                ? 'Open the catalog tab to unlock a mount for this save.'
                : 'Try a different name or CID, or switch to the catalog tab.'
            }
            action={
              mounts.length === 0 ? (
                <Button size="sm" onClick={() => setTab('catalog')}>
                  Browse the catalog
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {owned.map((mount) => (
              <div key={mount.dbid} className="rounded-xl border bg-card/70 p-3 shadow-xs">
                <div className="flex items-start gap-3">
                  <ItemIcon item={mount.item} size={compactRows ? 36 : 46} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={itemName(mount.item, language)}>
                      {itemName(mount.item, language)}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">CID {mount.cid}</span>
                      <span>·</span>
                      <span className="font-mono">DBID {mount.dbid}</span>
                    </div>
                    {mount.item.grade && (
                      <span
                        className={cn(
                          'mt-1 inline-block rounded border px-1 py-px text-[9px] capitalize',
                          gradeTone(mount.item.grade),
                        )}
                      >
                        {mount.item.grade}
                      </span>
                    )}
                  </div>
                  <CountPill>{mount.equippedBy !== null ? 'in use' : 'idle'}</CountPill>
                </div>
                <div className="mt-3 space-y-1 border-t pt-2">
                  <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Ridden by</span>
                  <NativeSelect
                    value={mount.equippedBy ?? 0}
                    disabled={busy}
                    aria-label="Mount owner"
                    onChange={(event) => void changeOwner(mount, Number(event.target.value))}
                  >
                    <option value={0}>Not equipped</option>
                    {characters.map((character) => (
                      <option key={character.cid} value={character.cid}>
                        {itemName(character.item, language)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            ))}
          </div>
        )
      ) : missing.length === 0 ? (
        <EmptyPanel
          icon={<Check />}
          title="Every catalog mount is owned"
          description="Turn off “Missing only” to browse the full catalog."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {missing.map((entry) => (
            <MountCatalogCard
              key={entry.item.cid}
              entry={entry}
              language={language}
              busy={busy}
              onUnlock={() => void unlockMount(entry.item.cid)}
            />
          ))}
        </div>
      )}

      <Panel title="Mount assignment" description="One character per mount.">
        <InfoNote>
          Mounts are linked through <span className="font-mono">tb_equip_mount.VEHICLE</span>. Changing the rider clears
          the previous character's slot first, so a mount cannot appear on two characters at once.
        </InfoNote>
      </Panel>
    </div>
  );
}

function MountCatalogCard({
  entry,
  language,
  busy,
  onUnlock,
}: {
  entry: CatalogEntry;
  language: string;
  busy: boolean;
  onUnlock: () => void;
}) {
  return (
    <div className={cn('rounded-xl border bg-card/50 p-3 shadow-xs', !entry.owned && 'hover:border-brand/30')}>
      <div className="flex items-start gap-3">
        <ItemIcon item={entry.item} size={46} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={itemName(entry.item, language)}>
            {itemName(entry.item, language)}
          </div>
          <div className="text-[10px] text-muted-foreground">CID {entry.item.cid}</div>
          {entry.item.grade && (
            <span
              className={cn(
                'mt-1 inline-block rounded border px-1 py-px text-[9px] capitalize',
                gradeTone(entry.item.grade),
              )}
            >
              {entry.item.grade}
            </span>
          )}
        </div>
        {entry.owned ? (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Check className="size-3" />
            Owned
          </Badge>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={onUnlock}>
            {busy ? <Spinner /> : <Sparkles />}
            Unlock
          </Button>
        )}
      </div>
    </div>
  );
}
