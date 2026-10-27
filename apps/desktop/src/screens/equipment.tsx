import { Gem, Lock, Settings2, Sparkles, Sword, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel } from '@/components/common';
import { BigNumberField, NumberField, SearchField } from '@/components/fields';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader, Panel, Toolbar } from '@/components/page';
import { FieldRow, InfoNote, StatTile } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';
import { MAX_ENCHANT, MAX_EQUIP_EXP, MAX_STAT } from '@/lib/limits';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { Equipment } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'locked' | 'stats';

export function EquipmentScreen() {
  const equipment = useApp((state) => state.equipment);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const compactRows = useApp((state) => state.settings.compactRows);
  const showUnknown = useApp((state) => state.settings.showUnknown);
  const pending = useApp((state) => state.pending);
  const setEquipment = useApp((state) => state.setEquipment);
  const setEquipmentGem = useApp((state) => state.setEquipmentGem);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [statsDbid, setStatsDbid] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return equipment
      .filter((piece) => {
        if (!showUnknown && !piece.item.known) return false;
        if (filter === 'locked' && !piece.isLock) return false;
        if (filter === 'stats' && !piece.hasStatValues) return false;
        if (!needle) return true;
        return (
          piece.item.nameEn.toLowerCase().includes(needle) ||
          piece.item.nameFr.toLowerCase().includes(needle) ||
          piece.cid.toString().includes(needle) ||
          piece.dbid.includes(needle)
        );
      })
      .sort(
        (left, right) => right.enchantLevel - left.enchantLevel || left.item.nameEn.localeCompare(right.item.nameEn),
      );
  }, [equipment, filter, query, showUnknown]);

  const target = equipment.find((piece) => piece.dbid === statsDbid) ?? null;
  const locked = equipment.filter((piece) => piece.isLock).length;
  const enchanted = equipment.filter((piece) => piece.enchantLevel > 0).length;
  const withStats = equipment.filter((piece) => piece.hasStatValues).length;
  const busy = pending !== null;

  if (!save) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Equipment"
        description="Weapons and armor in tb_equipment. Enchantment and experience are ordinary columns; stat rolls are exposed as raw CIDs because their type table is not published."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Sword />} label="Pieces" value={formatNumber(equipment.length)} detail="Not deleted" />
        <StatTile
          icon={<Sparkles />}
          label="Enchanted"
          value={formatNumber(enchanted)}
          detail="Enchant level above zero"
        />
        <StatTile icon={<Lock />} label="Locked" value={formatNumber(locked)} detail="Protected in game" />
        <StatTile
          icon={<Swords />}
          label="With stat values"
          value={formatNumber(withStats)}
          detail="MAIN/SUB value columns present"
        />
      </div>

      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search by name, CID or instance id" />
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['stats', 'With stats'],
              ['locked', 'Locked'],
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
          icon={<Sword />}
          title={equipment.length === 0 ? 'No equipment in this save' : 'No pieces match that filter'}
          description={
            equipment.length === 0
              ? 'This save has no rows in tb_equipment yet. Equipment is created by the game.'
              : 'Try a different search term or switch the filter.'
          }
        />
      ) : (
        <Panel title="Gear" description="Values are committed when a field loses focus." contentClassName="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[minmax(0,1.2fr)_6rem_7rem_5rem_10rem_minmax(0,0.8fr)_4rem] gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
                <span>Item</span>
                <span>Enchant</span>
                <span>EXP</span>
                <span>Lock</span>
                <span>Gem DBID</span>
                <span>Stat rolls</span>
                <span className="text-right">Edit</span>
              </div>
              <div className="divide-y">
                {rows.map((piece) => (
                  <div
                    key={piece.dbid}
                    className={cn(
                      'grid grid-cols-[minmax(0,1.2fr)_6rem_7rem_5rem_10rem_minmax(0,0.8fr)_4rem] items-center gap-3 px-4',
                      compactRows ? 'py-1.5' : 'py-2.5',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ItemIcon item={piece.item} size={compactRows ? 30 : 38} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{itemName(piece.item, language)}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-mono">CID {piece.cid}</span>
                          <span>·</span>
                          <span className="font-mono">DBID {piece.dbid}</span>
                          {!piece.item.known && <span className="text-warn-strong">unknown item</span>}
                        </div>
                      </div>
                    </div>
                    <NumberField
                      value={piece.enchantLevel}
                      onCommit={(value) => void setEquipment(piece.dbid, 'enchantLevel', value)}
                      max={MAX_ENCHANT}
                      disabled={busy}
                      className="w-20"
                      ariaLabel="Enchant level"
                    />
                    <NumberField
                      value={piece.exp}
                      onCommit={(value) => void setEquipment(piece.dbid, 'exp', value)}
                      max={MAX_EQUIP_EXP}
                      disabled={busy}
                      className="w-24"
                      ariaLabel="Equipment experience"
                    />
                    <Switch
                      checked={piece.isLock}
                      disabled={busy}
                      aria-label="Lock equipment"
                      onCheckedChange={(checked) => void setEquipment(piece.dbid, 'isLock', checked ? 1 : 0)}
                    />
                    <BigNumberField
                      value={piece.gemDbid}
                      onCommit={(value) => void setEquipmentGem(piece.dbid, value)}
                      disabled={busy}
                      className="w-full"
                      ariaLabel="Socketed gem instance id"
                    />
                    <div className="min-w-0">
                      {piece.mainStatCid ? (
                        <div className="space-y-0.5">
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            main {piece.mainStatCid}
                            {piece.hasStatValues ? ` · value ${formatNumber(piece.mainStatValue)}` : ''}
                          </div>
                          <div
                            className="truncate font-mono text-xs text-muted-foreground/80"
                            title={piece.subStatCids.filter(Boolean).join(', ')}
                          >
                            sub {piece.subStatCids.filter(Boolean).join(', ') || 'none'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/70">No stat rolls</span>
                      )}
                    </div>
                    <div className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Edit stat rolls"
                        onClick={() => setStatsDbid(piece.dbid)}
                      >
                        <Settings2 />
                        <span className="sr-only">Edit stat rolls</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid gap-2 md:grid-cols-2">
        <InfoNote>
          <span className="font-medium text-foreground">Stat CIDs are raw.</span> The save stores a stat type and value
          packed into an identifier, for example main <span className="font-mono">5000 + type × 100 + value</span> and
          sub <span className="font-mono">50000 + …</span>. The editor can change both numbers but cannot name the stat
          type, so compare with an item you already own before writing.
        </InfoNote>
        <InfoNote tone="warning">
          Changing a stat CID to a combination the game does not understand can make the item render with no stats. Keep
          a backup (the editor writes one on the first save of each session) before experimenting.
        </InfoNote>
      </div>

      <StatDialog
        piece={target}
        open={target !== null}
        onOpenChange={(open) => !open && setStatsDbid(null)}
        busy={busy}
        onChange={(field, value) => {
          if (!target) return;
          if (field === 'gemDbid' && typeof value === 'string') {
            void setEquipmentGem(target.dbid, value);
          } else if (typeof value === 'number') {
            void setEquipment(target.dbid, field, value);
          }
        }}
      />
    </div>
  );
}

function StatDialog({
  piece,
  open,
  onOpenChange,
  busy,
  onChange,
}: {
  piece: Equipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onChange: (field: string, value: number | string) => void;
}) {
  if (!piece) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>{busy && <Spinner />}</DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Stat rolls · {piece.item.nameEn}</DialogTitle>
          <DialogDescription>
            Raw values from tb_equipment. The socketed gem instance id is also editable here.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Main stat CID" hint="MAIN_STAT_CID">
            <NumberField
              value={piece.mainStatCid}
              onCommit={(value) => onChange('mainStatCid', value)}
              max={MAX_STAT}
              disabled={busy}
              className="w-full text-left"
            />
          </FieldRow>
          <FieldRow label="Socketed gem DBID" hint="GEM_DBID · 0 = empty">
            <BigNumberField
              value={piece.gemDbid}
              onCommit={(value) => onChange('gemDbid', value)}
              disabled={busy}
              className="w-full text-left"
            />
          </FieldRow>
          {[0, 1, 2, 3, 4].map((index) => (
            <FieldRow key={index} label={`Sub stat ${index + 1} CID`} hint={`SUB_STAT_CID${index + 1}`}>
              <NumberField
                value={piece.subStatCids[index] ?? 0}
                onCommit={(value) => onChange(`subStatCid${index + 1}`, value)}
                max={MAX_STAT}
                disabled={busy}
                className="w-full text-left"
              />
            </FieldRow>
          ))}
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Gem className="size-3.5 text-brand" />
            Rolled values
            <Badge variant="outline" className="text-xs">
              {piece.hasStatValues ? 'editable' : 'columns missing'}
            </Badge>
          </div>
          {piece.hasStatValues ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldRow label="Main value">
                <NumberField
                  value={piece.mainStatValue}
                  onCommit={(value) => onChange('mainStatValue', value)}
                  max={MAX_STAT}
                  disabled={busy}
                  className="w-full text-left"
                />
              </FieldRow>
              {[0, 1, 2, 3, 4].map((index) => (
                <FieldRow key={index} label={`Sub value ${index + 1}`}>
                  <NumberField
                    value={piece.subStatValues[index] ?? 0}
                    onCommit={(value) => onChange(`subStatValue${index + 1}`, value)}
                    max={MAX_STAT}
                    disabled={busy}
                    className="w-full text-left"
                  />
                </FieldRow>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              This save's tb_equipment has no MAIN_STAT_VALUE or SUB_STAT_VALUE columns, so only the CIDs can be edited.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
