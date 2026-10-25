import { Backpack, ChefHat, PackagePlus, Search, Sparkles, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { NumberField, SearchField } from '@/components/fields';
import { ItemIcon, gradeTone } from '@/components/item-icon';
import { PageHeader, Panel, Toolbar } from '@/components/page';
import { CountPill, InfoNote, StatTile } from '@/components/summary';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { MAX_STACK } from '@/lib/limits';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { Item } from '@/lib/types';
import { cn } from '@/lib/utils';

type Kind = 'all' | 'stackable' | 'cook';
type Sort = 'name' | 'count' | 'cid';

export function InventoryScreen() {
  const inventory = useApp((state) => state.inventory);
  const stackables = useApp((state) => state.stackables);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const compactRows = useApp((state) => state.settings.compactRows);
  const showUnknown = useApp((state) => state.settings.showUnknown);
  const pending = useApp((state) => state.pending);
  const setStack = useApp((state) => state.setStack);
  const addStack = useApp((state) => state.addStack);
  const fillStacks = useApp((state) => state.fillStacks);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = inventory.filter((stack) => {
      if (kind !== 'all' && stack.kind !== kind) return false;
      if (!showUnknown && !stack.item.known) return false;
      if (!needle) return true;
      return (
        stack.item.nameEn.toLowerCase().includes(needle) ||
        stack.item.nameFr.toLowerCase().includes(needle) ||
        stack.item.cid.toString().includes(needle) ||
        stack.id.includes(needle)
      );
    });
    return filtered.sort((left, right) => {
      if (sort === 'count') return right.count - left.count || left.item.nameEn.localeCompare(right.item.nameEn);
      if (sort === 'cid') return left.item.cid - right.item.cid;
      return left.item.nameEn.localeCompare(right.item.nameEn);
    });
  }, [inventory, kind, query, showUnknown, sort]);

  const visible = expanded ? rows : rows.slice(0, 200);
  const totalUnits = inventory.reduce((sum, stack) => sum + stack.count, 0);
  const stackCount = inventory.filter((stack) => stack.kind === 'stackable').length;
  const cookCount = inventory.filter((stack) => stack.kind === 'cook').length;
  const busy = pending !== null;
  const owned = useMemo(() => new Map(inventory.map((stack) => [stack.item.cid, stack.count])), [inventory]);

  if (!save) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${save.accountId} · Slot ${save.slot}`}
        title="Inventory"
        description="Stackable materials and cooked dishes. Counts are per row, so a full stack is a single value the game reads back directly."
        actions={
          <>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setAddOpen(true)}>
              <PackagePlus />
              Add stackable
            </Button>
            <ConfirmButton
              title="Fill every stack?"
              description={`Sets STACK_CNT to ${formatNumber(MAX_STACK)} on every row of tb_stackable_item. Cooked dishes are not changed.`}
              confirmLabel="Fill stacks"
              variant="outline"
              size="sm"
              disabled={busy || inventory.length === 0}
              onConfirm={() => void fillStacks(MAX_STACK)}
            >
              <Wand2 />
              Fill stacks
            </ConfirmButton>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Backpack />}
          label="Distinct rows"
          value={formatNumber(inventory.length)}
          detail={`${stackCount} stackable · ${cookCount} cooked`}
        />
        <StatTile
          icon={<Sparkles />}
          label="Total units"
          value={formatNumber(totalUnits)}
          detail="Sum of every stack"
        />
        <StatTile
          icon={<Search />}
          label="Matching filter"
          value={formatNumber(rows.length)}
          detail={query ? `Search: ${query}` : 'No search applied'}
        />
        <StatTile
          icon={<ChefHat />}
          label="Highest stack seen"
          value={formatNumber(MAX_STACK)}
          detail="Reference save"
        />
      </div>

      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search by name, CID or instance id" />
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['stackable', 'Materials'],
              ['cook', 'Cooked'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="xs"
              variant={kind === value ? 'secondary' : 'ghost'}
              onClick={() => setKind(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs dark:bg-input/30"
          aria-label="Sort inventory"
        >
          <option value="name">Sort by name</option>
          <option value="count">Sort by count</option>
          <option value="cid">Sort by CID</option>
        </select>
      </Toolbar>

      {visible.length === 0 ? (
        <EmptyPanel
          icon={<Backpack />}
          title={inventory.length === 0 ? 'Nothing in the bag yet' : 'No rows match that filter'}
          description={
            inventory.length === 0
              ? 'Add a stackable item to create its inventory row, or clear the search to see everything.'
              : 'Try a different search term or switch the kind filter.'
          }
          action={
            inventory.length === 0 ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <PackagePlus />
                Add stackable
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Panel
          contentClassName="p-0"
          title="Stacks"
          description={`Showing ${formatNumber(visible.length)} of ${formatNumber(rows.length)} matching rows.`}
          actions={<Badge variant="outline">{formatNumber(totalUnits)} units</Badge>}
        >
          <div className="divide-y">
            <div className="hidden grid-cols-[minmax(0,1fr)_7rem_9rem_8rem] gap-4 px-4 py-2 text-[10px] font-medium tracking-[0.12em] text-muted-foreground uppercase md:grid">
              <span>Item</span>
              <span>Kind</span>
              <span className="text-right">Count</span>
              <span className="text-right">Row</span>
            </div>
            {visible.map((stack) => (
              <div
                key={`${stack.kind}:${stack.id}`}
                className={cn(
                  'grid gap-3 px-4 md:grid-cols-[minmax(0,1fr)_7rem_9rem_8rem] md:items-center md:gap-4',
                  compactRows ? 'py-1.5' : 'py-2.5',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ItemIcon item={stack.item} size={compactRows ? 30 : 38} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{itemName(stack.item, language)}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="font-mono">CID {stack.item.cid}</span>
                      {stack.item.grade && (
                        <span className={cn('rounded border px-1 py-px', gradeTone(stack.item.grade))}>
                          {stack.item.grade}
                        </span>
                      )}
                      {!stack.item.known && <span className="text-amber-300">unknown item</span>}
                    </div>
                  </div>
                </div>
                <div>
                  <Badge variant="outline" className="text-[10px]">
                    {stack.kind === 'cook' ? 'Cooked dish' : 'Material'}
                  </Badge>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <NumberField
                    value={stack.count}
                    onCommit={(count) => void setStack(stack.kind, stack.id, count)}
                    max={MAX_STACK}
                    disabled={busy}
                    className="w-28"
                    ariaLabel={`${itemName(stack.item, language)} count`}
                  />
                  <button
                    type="button"
                    className="text-[10px] text-brand hover:underline disabled:opacity-50"
                    disabled={busy || stack.count === MAX_STACK}
                    onClick={() => void setStack(stack.kind, stack.id, MAX_STACK)}
                  >
                    Max
                  </button>
                </div>
                <div className="hidden text-right font-mono text-[10px] text-muted-foreground md:block">
                  {stack.kind === 'stackable' ? `CID ${stack.id}` : `DBID ${stack.id}`}
                </div>
              </div>
            ))}
          </div>
          {!expanded && rows.length > visible.length && (
            <div className="border-t p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
                Show all {formatNumber(rows.length)} rows
              </Button>
            </div>
          )}
        </Panel>
      )}

      <Panel title="Editing tips" description="Inventory rows are safe to change in place.">
        <div className="grid gap-2 md:grid-cols-2">
          <InfoNote>
            Materials live in <span className="font-mono">tb_stackable_item</span> and are keyed by CID. Adding an item
            that already exists replaces its count instead of creating a duplicate.
          </InfoNote>
          <InfoNote>
            Cooked dishes live in <span className="font-mono">tb_cook_item</span> and keep their own instance ids. Their
            counts are edited here but the rows are created by cooking in game.
          </InfoNote>
        </div>
      </Panel>

      <AddStackDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        catalog={stackables}
        owned={owned}
        language={language}
        busy={busy}
        onAdd={(cid, count) => {
          void addStack(cid, count);
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function AddStackDialog({
  open,
  onOpenChange,
  catalog,
  owned,
  language,
  busy,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Item[];
  owned: Map<number, number>;
  language: string;
  busy: boolean;
  onAdd: (cid: number, count: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Item | null>(null);
  const [count, setCount] = useState('1');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setSelected(null);
      setCount('1');
    }
  }

  const needle = query.trim().toLowerCase();
  const results = catalog
    .filter((item) => {
      if (!needle) return true;
      return (
        item.nameEn.toLowerCase().includes(needle) ||
        item.nameFr.toLowerCase().includes(needle) ||
        item.cid.toString().includes(needle)
      );
    })
    .slice(0, 120);

  const parsed = Number(count.replaceAll(',', '')) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a stackable item</DialogTitle>
          <DialogDescription>
            Pick any catalog item that the game stores in the stackable inventory. If the save already has it, the count
            is replaced.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <SearchField value={query} onChange={setQuery} placeholder="Search the stackable catalog" />
          <div className="scroll-thin max-h-72 overflow-y-auto rounded-lg border">
            {results.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">No stackable item matches that search.</p>
            ) : (
              <div className="divide-y">
                {results.map((item) => {
                  const current = owned.get(item.cid);
                  const active = selected?.cid === item.cid;
                  return (
                    <button
                      key={item.cid}
                      type="button"
                      onClick={() => setSelected(item)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/60',
                        active && 'bg-accent',
                      )}
                    >
                      <ItemIcon item={item} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{itemName(item, language)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          CID {item.cid} · {item.category}
                          {item.grade ? ` · ${item.grade}` : ''}
                        </div>
                      </div>
                      {current !== undefined ? (
                        <CountPill tone="brand">owned {formatNumber(current)}</CountPill>
                      ) : (
                        <CountPill>new</CountPill>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {selected && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
              <ItemIcon item={selected} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{itemName(selected, language)}</div>
                <div className="text-[10px] text-muted-foreground">CID {selected.cid}</div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-count" className="text-[10px] text-muted-foreground">
                  Count
                </Label>
                <Input
                  id="add-count"
                  value={count}
                  inputMode="numeric"
                  className="numeric h-8 w-28 text-right"
                  onChange={(event) => setCount(event.target.value)}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || !selected || parsed < 0 || parsed > MAX_STACK}
            onClick={() => selected && onAdd(selected.cid, parsed)}
          >
            {busy ? <Spinner /> : <PackagePlus />}
            Add item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
