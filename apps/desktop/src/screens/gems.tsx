import { Gem, Lock, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel } from '@/components/common';
import { NumberField, SearchField } from '@/components/fields';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader, Panel, Toolbar } from '@/components/page';
import { CountPill, InfoNote, StatTile } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { MAX_STAT } from '@/lib/limits';
import { compareDbid, formatNumber, itemName, useApp } from '@/lib/store';

export function GemsScreen() {
  const gems = useApp((state) => state.gems);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const compactRows = useApp((state) => state.settings.compactRows);
  const showUnknown = useApp((state) => state.settings.showUnknown);
  const pending = useApp((state) => state.pending);
  const setGem = useApp((state) => state.setGem);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return gems
      .filter((gem) => {
        if (!showUnknown && !gem.item.known) return false;
        if (!needle) return true;
        return (
          gem.item.nameEn.toLowerCase().includes(needle) ||
          gem.item.nameFr.toLowerCase().includes(needle) ||
          gem.cid.toString().includes(needle) ||
          gem.dbid.includes(needle) ||
          gem.statInfoCid.toString().includes(needle)
        );
      })
      .sort((left, right) => left.cid - right.cid || compareDbid(left.dbid, right.dbid));
  }, [gems, query, showUnknown]);

  const locked = gems.filter((gem) => gem.isLock).length;
  const statCids = new Set(gems.map((gem) => gem.statInfoCid).filter(Boolean));
  const busy = pending !== null;

  if (!save) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${save.accountId} · Slot ${save.slot}`}
        title="Gems"
        description="Gem instances and the stat information each one carries. Gems are created by the game; this screen edits their existing rows."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Gem />} label="Gem instances" value={formatNumber(gems.length)} detail="In tb_gem" />
        <StatTile
          icon={<Sparkles />}
          label="Distinct stat CIDs"
          value={formatNumber(statCids.size)}
          detail="Across all gems"
        />
        <StatTile icon={<Lock />} label="Locked" value={formatNumber(locked)} detail="Protected in game" />
        <StatTile
          icon={<Gem />}
          label="Matching"
          value={formatNumber(rows.length)}
          detail={query ? `Search: ${query}` : 'No search applied'}
        />
      </div>

      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search by name, CID, DBID or stat CID" />
        <Badge variant="outline" className="ml-auto">
          {formatNumber(rows.length)} matching
        </Badge>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyPanel
          icon={<Gem />}
          title={gems.length === 0 ? 'No gems in this save' : 'No gems match that search'}
          description={
            gems.length === 0
              ? 'This save has no rows in tb_gem. Gems are created by the game when they drop or are crafted.'
              : 'Try a different name, CID, or instance id.'
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((gem) => (
            <div key={gem.dbid} className="rounded-xl border bg-card/70 p-3 shadow-xs">
              <div className="flex items-center gap-3">
                <ItemIcon item={gem.item} size={compactRows ? 34 : 42} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={itemName(gem.item, language)}>
                    {itemName(gem.item, language)}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono">CID {gem.cid}</span>
                    <span>·</span>
                    <span className="font-mono">DBID {gem.dbid}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Lock</span>
                  <Switch
                    checked={gem.isLock}
                    disabled={busy}
                    aria-label="Lock gem"
                    onCheckedChange={(checked) => void setGem(gem.dbid, 'isLock', checked ? 1 : 0)}
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-2">
                <div className="space-y-1">
                  <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Stat info CID</span>
                  <NumberField
                    value={gem.statInfoCid}
                    onCommit={(value) => void setGem(gem.dbid, 'statInfoCid', value)}
                    max={MAX_STAT}
                    disabled={busy}
                    className="w-full text-left"
                    ariaLabel="Gem stat info CID"
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Item CID</span>
                  <NumberField
                    value={gem.cid}
                    onCommit={(value) => void setGem(gem.dbid, 'itemCid', value)}
                    max={MAX_STAT}
                    disabled={busy}
                    className="w-full text-left"
                    ariaLabel="Gem item CID"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="capitalize">{gem.item.grade || gem.item.category}</span>
                <CountPill>tb_gem</CountPill>
              </div>
            </div>
          ))}
        </div>
      )}

      <Panel title="About gem stat data" description="Why the numbers are raw.">
        <InfoNote>
          <span className="font-medium text-foreground">STAT_INFO_CID</span> points at the gem's stat roll and is not
          documented by the game. Changing the item CID also changes which catalog entry and icon the editor shows, so
          copy values from a gem that already has the effect you want.
        </InfoNote>
      </Panel>
    </div>
  );
}
