import { Crown, Heart, Search, Star, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { PageHeader, Panel, Toolbar } from '@/components/page';
import { CountPill, InfoNote, StatTile } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { formatNumber, useApp } from '@/lib/store';
import type { TitleEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'unlocked' | 'locked' | 'favorites';

const COLOR_TONES: Record<string, string> = {
  BLUE: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  GREEN: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  VIOLET: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  BROWN: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  RED: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  GOLD: 'border-brand/30 bg-brand/10 text-brand',
};

export function TitlesScreen() {
  const titles = useApp((state) => state.titles);
  const save = useApp((state) => state.save);
  const pending = useApp((state) => state.pending);
  const setTitle = useApp((state) => state.setTitle);
  const unlockAllTitles = useApp((state) => state.unlockAllTitles);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return titles.filter((title) => {
      if (filter === 'unlocked' && !title.unlocked) return false;
      if (filter === 'locked' && title.unlocked) return false;
      if (filter === 'favorites' && !title.favorite) return false;
      if (!needle) return true;
      return (
        title.nameEn.toLowerCase().includes(needle) ||
        title.nameFr.toLowerCase().includes(needle) ||
        title.id.toString().includes(needle)
      );
    });
  }, [filter, query, titles]);

  const unlocked = titles.filter((title) => title.unlocked).length;
  const favorites = titles.filter((title) => title.favorite).length;
  const categories = new Set(titles.map((title) => title.category)).size;
  const percent = titles.length ? (unlocked / titles.length) * 100 : 0;
  const busy = pending !== null;

  if (!save) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Titles"
        description="Every title in the catalog, with the bit that stores it in tb_title. Favorites are shown but not changed here, so the game's favorite mask stays intact."
        actions={
          <ConfirmButton
            title="Unlock every title?"
            description={`Sets every title bit across ${categories} categories while preserving FAV_BIT_FIELD. The game reads the same bitmask.`}
            confirmLabel="Unlock all"
            variant="outline"
            size="sm"
            disabled={busy || titles.length === 0 || unlocked >= titles.length}
            onConfirm={() => void unlockAllTitles()}
          >
            <Crown />
            Unlock every title
          </ConfirmButton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Trophy />}
          label="Unlocked"
          value={`${formatNumber(unlocked)} / ${formatNumber(titles.length)}`}
          detail={`${percent.toFixed(0)}% of the catalog`}
        />
        <StatTile icon={<Star />} label="Favorites" value={formatNumber(favorites)} detail="FAV_BIT_FIELD" />
        <StatTile
          icon={<Crown />}
          label="Categories"
          value={formatNumber(categories)}
          detail="Rows in tb_title when complete"
        />
        <StatTile
          icon={<Search />}
          label="Matching"
          value={formatNumber(rows.length)}
          detail={query ? `Search: ${query}` : 'No search applied'}
        />
      </div>

      <Panel contentClassName="p-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Collection progress</span>
          <span className="numeric">
            {formatNumber(unlocked)} / {formatNumber(titles.length)}
          </span>
        </div>
        <Progress value={percent} indicatorClassName="bg-brand" />
      </Panel>

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles by name or id"
            className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-8 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              ['all', 'All'],
              ['unlocked', 'Unlocked'],
              ['locked', 'Locked'],
              ['favorites', 'Favorites'],
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
          {formatNumber(rows.length)} shown
        </Badge>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyPanel
          icon={<Crown />}
          title={titles.length === 0 ? 'No titles in the catalog' : 'No title matches that filter'}
          description={
            titles.length === 0
              ? 'The title catalog failed to load. Reopen the app or check the bundled data.'
              : 'Try a different search term or switch the filter.'
          }
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((title) => (
            <TitleCard
              key={title.id}
              title={title}
              busy={busy}
              onToggle={(unlockedValue) => void setTitle(title.id, unlockedValue)}
            />
          ))}
        </div>
      )}

      <Panel title="How title bits work" description="The storage detail, in one paragraph.">
        <InfoNote>
          Titles are packed into <span className="font-mono">tb_title</span> as one row per 64 ids: the category is{' '}
          <span className="font-mono">id / 64</span> and the bit is <span className="font-mono">id % 64</span>. The
          editor updates <span className="font-mono">BIT_FIELD</span> through an UPSERT and leaves{' '}
          <span className="font-mono">FAV_BIT_FIELD</span> untouched, so your favorite title keeps its star.
        </InfoNote>
      </Panel>
    </div>
  );
}

function TitleCard({
  title,
  busy,
  onToggle,
}: {
  title: TitleEntry;
  busy: boolean;
  onToggle: (unlocked: boolean) => void;
}) {
  const tone = COLOR_TONES[title.color] ?? 'border-border bg-muted/40 text-muted-foreground';
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl border bg-card/70 p-3 shadow-xs transition-colors',
        title.unlocked ? 'border-brand/25' : 'opacity-80',
      )}
    >
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg border', tone)}>
        <Crown className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title.nameEn}</span>
          {title.favorite && <Star className="size-3 fill-brand text-brand" />}
        </div>
        {title.nameFr && title.nameFr !== title.nameEn && (
          <div className="truncate text-xs text-muted-foreground">{title.nameFr}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <CountPill>{title.color.toLowerCase()}</CountPill>
          {title.stats.map((stat) => (
            <span
              key={`${stat.type}:${stat.value}`}
              className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-px text-[9px] text-muted-foreground"
            >
              <Heart className="size-2.5 text-brand" />
              {stat.type} +{formatNumber(stat.value)}
            </span>
          ))}
          {title.stats.length === 0 && <span className="text-[9px] text-muted-foreground/70">no stat bonus</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Switch
          checked={title.unlocked}
          disabled={busy}
          aria-label={`Unlock ${title.nameEn}`}
          onCheckedChange={onToggle}
        />
        <span className="font-mono text-[9px] text-muted-foreground">
          {title.category}/{title.bit}
        </span>
      </div>
    </div>
  );
}
