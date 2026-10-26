import { Flame, Lock, Sparkles, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel } from '@/components/common';
import { NumberField, SearchField } from '@/components/fields';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader, Panel, Toolbar } from '@/components/page';
import { NativeSelect } from '@/components/select';
import { CountPill, InfoNote, StatTile } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { GRADE_ONE_CHARACTER_LIMITS } from '@/lib/limits';
import { compareDbid, formatNumber, itemName, useApp } from '@/lib/store';
import type { Karma } from '@/lib/types';

type Filter = 'all' | 'equipped' | 'idle';

export function KarmaScreen() {
  const karma = useApp((state) => state.karma);
  const characters = useApp((state) => state.characters);
  const save = useApp((state) => state.save);
  const overview = useApp((state) => state.overview);
  const language = useApp((state) => state.settings.language);
  const compactRows = useApp((state) => state.settings.compactRows);
  const showUnknown = useApp((state) => state.settings.showUnknown);
  const pending = useApp((state) => state.pending);
  const setKarma = useApp((state) => state.setKarma);
  const equipKarma = useApp((state) => state.equipKarma);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return karma
      .filter((entry) => {
        if (!showUnknown && !entry.item.known) return false;
        if (filter === 'equipped' && entry.equippedBy === null) return false;
        if (filter === 'idle' && entry.equippedBy !== null) return false;
        if (!needle) return true;
        return (
          entry.item.nameEn.toLowerCase().includes(needle) ||
          entry.item.nameFr.toLowerCase().includes(needle) ||
          entry.cid.toString().includes(needle) ||
          entry.dbid.includes(needle)
        );
      })
      .sort((left, right) => left.cid - right.cid || compareDbid(left.dbid, right.dbid));
  }, [filter, karma, query, showUnknown]);

  const equipped = karma.filter((entry) => entry.equippedBy !== null).length;
  const busy = pending !== null;
  const limits = overview?.characterLimits ?? GRADE_ONE_CHARACTER_LIMITS;

  async function changeOwner(entry: Karma, cid: number): Promise<void> {
    if (cid === (entry.equippedBy ?? 0)) return;
    if (entry.equippedBy !== null) await equipKarma(entry.equippedBy, '0');
    if (cid !== 0) await equipKarma(cid, entry.dbid);
  }

  if (!save) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${save.accountId} · Slot ${save.slot}`}
        title="Karma"
        description="Karma spirits in tb_karma. Growth fields follow the save's adventure grade; existing values above a cap stay editable. The equipped character lives in tb_equip_mount."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Flame />} label="Karma spirits" value={formatNumber(karma.length)} detail="Not deleted" />
        <StatTile
          icon={<UserCheck />}
          label="Equipped"
          value={formatNumber(equipped)}
          detail="Attached to a character"
        />
        <StatTile
          icon={<Sparkles />}
          label="Ascended"
          value={formatNumber(karma.filter((entry) => entry.ascend > 0).length)}
          detail="Ascend above zero"
        />
        <StatTile
          icon={<Lock />}
          label="Locked"
          value={formatNumber(karma.filter((entry) => entry.isLock).length)}
          detail="Protected in game"
        />
      </div>

      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search by name, CID or instance id" />
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['equipped', 'Equipped'],
              ['idle', 'Idle'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="xs"
              variant={filter === value ? 'secondary' : 'ghost'}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Badge variant="outline" className="ml-auto">
          {formatNumber(rows.length)} matching
        </Badge>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyPanel
          icon={<Flame />}
          title={karma.length === 0 ? 'No karma in this save' : 'No karma matches that filter'}
          description={
            karma.length === 0
              ? 'This save has no rows in tb_karma. Karma spirits are created by the game.'
              : 'Try a different search term or switch the filter.'
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((entry) => {
            const owner =
              entry.equippedBy !== null ? characters.find((character) => character.cid === entry.equippedBy) : null;
            return (
              <div key={entry.dbid} className="rounded-xl border bg-card/70 p-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <ItemIcon item={entry.item} size={compactRows ? 34 : 44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={itemName(entry.item, language)}>
                      {itemName(entry.item, language)}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">CID {entry.cid}</span>
                      <span>·</span>
                      <span className="font-mono">DBID {entry.dbid}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Lock</span>
                    <Switch
                      checked={entry.isLock}
                      disabled={busy}
                      aria-label="Lock karma"
                      onCheckedChange={(checked) => void setKarma(entry.dbid, 'isLock', checked ? 1 : 0)}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2">
                  <div className="space-y-1">
                    <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">EXP</span>
                    <NumberField
                      value={entry.exp}
                      onCommit={(value) => void setKarma(entry.dbid, 'exp', value)}
                      max={limits.exp}
                      disabled={busy}
                      className="w-full text-left"
                      ariaLabel="Karma experience"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Ascend</span>
                    <NumberField
                      value={entry.ascend}
                      onCommit={(value) => void setKarma(entry.dbid, 'ascend', value)}
                      max={limits.ascend}
                      disabled={busy}
                      className="w-full text-left"
                      ariaLabel="Karma ascend"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Transcend</span>
                    <NumberField
                      value={entry.transcend}
                      onCommit={(value) => void setKarma(entry.dbid, 'transcend', value)}
                      max={limits.transcend}
                      disabled={busy}
                      className="w-full text-left"
                      ariaLabel="Karma transcend"
                    />
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">Equipped by</span>
                  <NativeSelect
                    value={entry.equippedBy ?? 0}
                    disabled={busy}
                    aria-label="Karma owner"
                    onChange={(event) => void changeOwner(entry, Number(event.target.value))}
                  >
                    <option value={0}>Not equipped</option>
                    {characters.map((character) => (
                      <option key={character.cid} value={character.cid}>
                        {itemName(character.item, language)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="truncate">{owner ? `On ${itemName(owner.item, language)}` : 'Idle'}</span>
                  <CountPill className="capitalize">{entry.item.grade || entry.item.category}</CountPill>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Panel title="Equipping rules" description="What the editor does when you change the owner.">
        <InfoNote>
          A karma spirit can belong to one character at a time. The editor clears the previous character's slot before
          assigning the new one, so the same instance is never linked twice. Choose “Not equipped” to detach it.
        </InfoNote>
      </Panel>
    </div>
  );
}
