import { Backpack, PackagePlus, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { NumberField, SearchField } from '@/components/fields';
import { gradeCard, gradeTile } from '@/components/grade-art';
import { ItemIcon, gradeTone } from '@/components/item-icon';
import { PageHeader, Toolbar } from '@/components/page';
import { CountPill } from '@/components/summary';
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
import { MAX_DISH, MAX_STACK, isFillableStackKind } from '@/lib/limits';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { Item, Stack } from '@/lib/types';
import { cn } from '@/lib/utils';

type Kind = 'all' | 'stackable' | 'cook';
type Sort = 'name' | 'count' | 'cid';

export function InventoryScreen() {
  const inventory = useApp((state) => state.inventory);
  const stackables = useApp((state) => state.stackables);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const showUnknown = useApp((state) => state.settings.showUnknown);
  const pending = useApp((state) => state.pending);
  const setStack = useApp((state) => state.setStack);
  const addStack = useApp((state) => state.addStack);
  const fillStacks = useApp((state) => state.fillStacks);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  const totalUnits = inventory.reduce((sum, stack) => sum + stack.count, 0);
  const stackCount = inventory.filter((stack) => stack.kind === 'stackable').length;
  const cookCount = inventory.filter((stack) => stack.kind === 'cook').length;
  const fillableCount = inventory.filter(
    (stack) => stack.kind === 'stackable' && isFillableStackKind(stack.item.kind),
  ).length;
  const busy = pending !== null;
  const owned = useMemo(() => new Map(inventory.map((stack) => [stack.item.cid, stack.count])), [inventory]);
  const selected =
    rows.find((stack) => `${stack.kind}:${stack.id}` === selectedKey) ??
    inventory.find((stack) => `${stack.kind}:${stack.id}` === selectedKey) ??
    rows[0] ??
    null;

  if (!save) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description={`${formatNumber(stackCount)} materials · ${formatNumber(cookCount)} cooked dishes · ${formatNumber(totalUnits)} units in all`}
        actions={
          <>
            <Button variant="outline" disabled={busy} onClick={() => setAddOpen(true)}>
              <PackagePlus />
              Add item
            </Button>
            <ConfirmButton
              title="Fill material stacks?"
              description={`Raises common materials, cooking ingredients, gem-socket materials, equipment-sub-stat items and *_EXP rows to at least ${formatNumber(MAX_STACK)}. It never lowers a count and leaves quest, map, achievement and master-soul rows alone. Cooked dishes are not changed.`}
              confirmLabel="Fill material stacks"
              variant="outline"
              disabled={busy || fillableCount === 0}
              onConfirm={() => void fillStacks(MAX_STACK)}
            >
              <Wand2 />
              Fill material stacks
            </ConfirmButton>
          </>
        }
      />

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
          className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs dark:bg-input/30"
          aria-label="Sort inventory"
        >
          <option value="name">Sort by name</option>
          <option value="count">Sort by count</option>
          <option value="cid">Sort by CID</option>
        </select>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyPanel
          icon={<Backpack />}
          title={inventory.length === 0 ? 'Nothing in the bag yet' : 'No rows match that filter'}
          description={
            inventory.length === 0
              ? 'Add a stackable item to create its inventory row.'
              : 'Try a different search term or switch the kind filter.'
          }
          action={
            inventory.length === 0 ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <PackagePlus />
                Add item
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid h-[calc(100svh-15rem)] min-h-[480px] grid-cols-[minmax(0,1fr)_300px] overflow-hidden rounded-xl border bg-card/40">
          <div className="scroll-thin min-h-0 overflow-y-auto p-4">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2.5">
              {rows.map((stack) => {
                const key = `${stack.kind}:${stack.id}`;
                const active = selected !== null && key === `${selected.kind}:${selected.id}`;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    title={itemName(stack.item, language)}
                    onClick={() => setSelectedKey(key)}
                    // The game's own grade tile, with the count bar laid over its
                    // foot as in the game's inventory.
                    style={{ backgroundImage: `url(${gradeTile(stack.item.grade)})` }}
                    className={cn(
                      'group relative flex aspect-[194/238] flex-col items-center overflow-hidden rounded-lg bg-cover bg-center text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      active ? 'ring-2 ring-brand' : 'hover:brightness-110',
                    )}
                  >
                    <div className="flex flex-1 items-center justify-center">
                      <ItemIcon
                        item={stack.item}
                        size={60}
                        className="border-none bg-transparent bg-none text-white/90"
                      />
                    </div>
                    <div
                      className={cn(
                        'mx-[4%] mb-[4%] self-stretch rounded-b-md bg-zinc-900/75 py-0.5 text-center text-sm font-semibold text-white tabular-nums',
                        stack.count === 0 && 'text-white/50',
                      )}
                    >
                      {formatNumber(stack.count)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {selected ? (
            <StackDetail
              key={`${selected.kind}:${selected.id}`}
              stack={selected}
              language={language}
              busy={busy}
              onCount={(count) => void setStack(selected.kind, selected.id, count)}
            />
          ) : (
            <div />
          )}
        </div>
      )}

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

function StackDetail({
  stack,
  language,
  busy,
  onCount,
}: {
  stack: Stack;
  language: string;
  busy: boolean;
  onCount: (count: number) => void;
}) {
  const limit = stack.kind === 'cook' ? MAX_DISH : MAX_STACK;
  // Fill is the authority on what is safe to raise. A cooked dish has its own
  // limit and is always safe to Max.
  const showMax = stack.kind === 'cook' || isFillableStackKind(stack.item.kind);
  const name = itemName(stack.item, language);
  return (
    <aside className="scroll-thin flex min-h-0 flex-col gap-5 overflow-y-auto border-l p-5">
      <div className="flex flex-col gap-3">
        {/* The game's item card header: the grade's own artwork, name on the
            left and the icon on the right. */}
        <div
          className="relative flex aspect-[460/200] items-center overflow-hidden rounded-lg bg-cover bg-center p-3"
          style={{ backgroundImage: `url(${gradeCard(stack.item.grade)})` }}
        >
          <h2 className="z-10 max-w-[60%] text-lg leading-tight font-semibold tracking-tight text-balance text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]">
            {name}
          </h2>
          <ItemIcon
            item={stack.item}
            size={96}
            className="absolute right-2 border-none bg-transparent bg-none text-white/90"
          />
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {stack.item.grade && (
              <span className={cn('rounded border px-1.5 py-px', gradeTone(stack.item.grade))}>{stack.item.grade}</span>
            )}
            <Badge variant="outline">{stack.kind === 'cook' ? 'Cooked dish' : 'Material'}</Badge>
            {!stack.item.known && <span className="text-warn-strong">unknown item</span>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Count</span>
          <span className="text-xs text-muted-foreground tabular-nums">max {formatNumber(limit)}</span>
        </div>
        <div className="flex gap-2">
          <NumberField
            value={stack.count}
            onCommit={onCount}
            max={limit}
            disabled={busy}
            className="h-9 flex-1 text-base"
            ariaLabel={`${name} count`}
          />
          {showMax && (
            <Button variant="outline" disabled={busy || stack.count >= limit} onClick={() => onCount(limit)}>
              Max
            </Button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">CID</dt>
        <dd className="font-mono text-xs leading-5">{stack.item.cid}</dd>
        {stack.kind === 'cook' && (
          <>
            <dt className="text-muted-foreground">Instance</dt>
            <dd className="font-mono text-xs leading-5 break-all">{stack.id}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Kind</dt>
        <dd className="text-xs leading-5">{stack.item.kind || '—'}</dd>
      </dl>

      <p className="mt-auto text-xs text-muted-foreground">
        {stack.kind === 'cook'
          ? `A dish is one tb_cook_item row whose count grows; the game creates the row when you cook. Dishes stop at ${formatNumber(MAX_DISH)}.`
          : showMax
            ? 'A material lives in tb_stackable_item, keyed by CID. Fill and Max raise it to the highest stack the reference save holds.'
            : 'Quest, map, achievement and master-soul items are progress data; Fill leaves them alone.'}
      </p>
    </aside>
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
                        <div className="text-xs text-muted-foreground">
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
                <div className="text-xs text-muted-foreground">CID {selected.cid}</div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-count" className="text-xs text-muted-foreground">
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
