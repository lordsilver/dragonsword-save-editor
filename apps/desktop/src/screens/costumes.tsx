import { Check, Lock, Search, Shirt, Sparkles, UserCheck } from 'lucide-react';
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
import type { CatalogEntry, Costume } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tab = 'owned' | 'catalog';

export function CostumesScreen() {
  const costumes = useApp((state) => state.costumes);
  const catalog = useApp((state) => state.costumeCatalog);
  const characters = useApp((state) => state.characters);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const compactRows = useApp((state) => state.settings.compactRows);
  const showUnknown = useApp((state) => state.settings.showUnknown);
  const pending = useApp((state) => state.pending);
  const equipCostume = useApp((state) => state.equipCostume);
  const unlockCostume = useApp((state) => state.unlockCostume);
  const [tab, setTab] = useState<Tab>('owned');
  const [query, setQuery] = useState('');
  const [lockedOnly, setLockedOnly] = useState(false);

  const needle = query.trim().toLowerCase();
  const owned = useMemo(
    () =>
      costumes
        .filter((costume) => {
          if (!showUnknown && !costume.item.known) return false;
          if (!needle) return true;
          return (
            costume.item.nameEn.toLowerCase().includes(needle) ||
            costume.item.nameFr.toLowerCase().includes(needle) ||
            costume.cid.toString().includes(needle) ||
            costume.dbid.includes(needle)
          );
        })
        .sort((left, right) => left.cid - right.cid),
    [costumes, needle, showUnknown],
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

  const equipped = costumes.filter((costume) => costume.equipCharacterCid !== 0).length;
  const newCount = costumes.filter((costume) => costume.isNew).length;
  const busy = pending !== null;

  if (!save) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Costumes"
        description="Owned outfits and the full costume catalog. Unlocking adds a new instance with a random uint32 id, matching how the game mints costume rows."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Shirt />}
          label="Owned"
          value={formatNumber(costumes.length)}
          detail={`${formatNumber(catalog.filter((entry) => entry.owned).length)} of ${formatNumber(catalog.length)} catalog costumes`}
        />
        <StatTile
          icon={<Lock />}
          label="Missing"
          value={formatNumber(catalog.filter((entry) => !entry.owned).length)}
          detail="Can be unlocked here"
        />
        <StatTile
          icon={<UserCheck />}
          label="Equipped"
          value={formatNumber(equipped)}
          detail="Assigned to a character"
        />
        <StatTile icon={<Sparkles />} label="New" value={formatNumber(newCount)} detail="IS_NEW flag set" />
      </div>

      <Toolbar>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          <Button size="xs" variant={tab === 'owned' ? 'secondary' : 'ghost'} onClick={() => setTab('owned')}>
            Owned
            <CountPill>{formatNumber(costumes.length)}</CountPill>
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
            placeholder="Search costumes"
            className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-8 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30"
          />
        </div>
        {tab === 'catalog' && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={lockedOnly}
              onCheckedChange={setLockedOnly}
              size="sm"
              aria-label="Show only missing costumes"
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
            icon={<Shirt />}
            title={costumes.length === 0 ? 'No costumes owned' : 'No costume matches that search'}
            description={
              costumes.length === 0
                ? 'Open the catalog tab to unlock a costume for this save.'
                : 'Try a different name or CID, or switch to the catalog tab.'
            }
            action={
              costumes.length === 0 ? (
                <Button size="sm" onClick={() => setTab('catalog')}>
                  Browse the catalog
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {owned.map((costume) => (
              <CostumeCard
                key={costume.dbid}
                costume={costume}
                characters={characters}
                language={language}
                compact={compactRows}
                busy={busy}
                onEquip={(cid) => void equipCostume(costume.dbid, cid)}
              />
            ))}
          </div>
        )
      ) : missing.length === 0 ? (
        <EmptyPanel
          icon={<Check />}
          title="Every catalog costume is owned"
          description="Turn off “Missing only” to browse the full catalog."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {missing.map((entry) => (
            <CatalogCard
              key={entry.item.cid}
              entry={entry}
              language={language}
              busy={busy}
              onUnlock={() => void unlockCostume(entry.item.cid)}
            />
          ))}
        </div>
      )}

      <Panel title="How costume rows work" description="The parts flag and the instance id.">
        <InfoNote>
          Costume instances live in <span className="font-mono">tb_costume</span>. Unlocking creates one row with{' '}
          <span className="font-mono">PARTS_ON = 1</span>; equip it to a character here and the game controls which
          parts are visible. Duplicate CIDs are prevented by the editor.
        </InfoNote>
      </Panel>
    </div>
  );
}

function CostumeCard({
  costume,
  characters,
  language,
  compact,
  busy,
  onEquip,
}: {
  costume: Costume;
  characters: Array<{ cid: number; item: Costume['item'] }>;
  language: string;
  compact: boolean;
  busy: boolean;
  onEquip: (cid: number) => void;
}) {
  return (
    <div className="rounded-xl border bg-card/70 p-3 shadow-xs">
      <div className="flex items-start gap-3">
        <ItemIcon item={costume.item} size={compact ? 36 : 46} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium" title={itemName(costume.item, language)}>
              {itemName(costume.item, language)}
            </span>
            {costume.isNew && (
              <Badge variant="outline" className="border-brand/30 bg-brand/10 text-[9px] text-brand">
                New
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">CID {costume.cid}</span>
            <span>·</span>
            <span className="font-mono">DBID {costume.dbid}</span>
          </div>
          {costume.item.grade && (
            <span
              className={cn(
                'mt-1 inline-block rounded border px-1 py-px text-[9px] capitalize',
                gradeTone(costume.item.grade),
              )}
            >
              {costume.item.grade}
            </span>
          )}
        </div>
        <CountPill>{costume.partsOn ? `parts ${costume.partsOn}` : 'parts 0'}</CountPill>
      </div>
      <div className="mt-3 space-y-1 border-t pt-2">
        <span className="block text-xs text-muted-foreground">Equipped by</span>
        <NativeSelect
          value={costume.equipCharacterCid}
          disabled={busy}
          aria-label="Costume owner"
          onChange={(event) => onEquip(Number(event.target.value))}
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
  );
}

function CatalogCard({
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
    <div
      className={cn(
        'rounded-xl border bg-card/50 p-3 shadow-xs transition-colors',
        entry.owned ? 'opacity-70' : 'hover:border-brand/30',
      )}
    >
      <div className="flex items-start gap-3">
        <ItemIcon item={entry.item} size={46} className={entry.owned ? '' : 'opacity-80'} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium" title={itemName(entry.item, language)}>
            {itemName(entry.item, language)}
          </div>
          <div className="text-xs text-muted-foreground">CID {entry.item.cid}</div>
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
          <Badge variant="outline" className="gap-1 text-xs">
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
