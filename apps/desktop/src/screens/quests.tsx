import { CheckCircle2, ChevronDown, Circle, CircleDot, ScrollText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyPanel } from '@/components/common';
import { RichText } from '@/components/game-text';
import { PageHeader, Panel, Toolbar } from '@/components/page';
import { InfoNote, StatTile } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatNumber, useApp } from '@/lib/store';
import type { QuestEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

type StateFilter = 'all' | QuestEntry['state'];

/** The quest log's categories in the order the game lists them. */
const CATEGORIES: Array<[string, string]> = [
  ['MAIN', 'Main story'],
  ['EPIC', 'Epic quests'],
  ['CHARACTER', 'Hero stories'],
  ['ADVENT_GRADE', 'Promotion exams'],
  ['TUTORIAL', 'Tutorials'],
];

const STATES: Record<QuestEntry['state'], string> = {
  done: 'Done',
  active: 'In progress',
  open: 'Not started',
};

export function QuestsScreen() {
  const log = useApp((state) => state.questLog);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const completeQuest = useApp((state) => state.completeQuest);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StateFilter>('all');
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState<number | null>(null);
  const busy = pending !== null;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (log ?? []).filter((quest) => {
      if (filter !== 'all' && quest.state !== filter) return false;
      if (category !== 'all' && quest.category !== category) return false;
      if (!needle) return true;
      return (
        quest.nameEn.toLowerCase().includes(needle) ||
        quest.nameFr.toLowerCase().includes(needle) ||
        quest.id.toString().includes(needle)
      );
    });
  }, [category, filter, log, query]);

  if (!save) return null;
  if (!log) {
    return (
      <div className="space-y-5">
        <PageHeader title="Quests" />
        <EmptyPanel icon={<ScrollText />} title="Loading the quest log" />
      </div>
    );
  }

  const count = (state: QuestEntry['state']) => log.filter((quest) => quest.state === state).length;
  const main = log.filter((quest) => quest.category === 'MAIN');
  const mainDone = main.filter((quest) => quest.state === 'done').length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Quests"
        description="The game's quest log and where this save stands on each quest. A quest in progress can be completed the way the game completes it: its rewards are handed out, the quests waiting for it start, and it stays completed."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<CheckCircle2 />}
          label="Done"
          value={formatNumber(count('done'))}
          detail={`of ${formatNumber(log.length)} quests`}
        />
        <StatTile
          icon={<CircleDot />}
          label="In progress"
          value={formatNumber(count('active'))}
          detail="Can be completed here"
        />
        <StatTile
          icon={<Circle />}
          label="Not started"
          value={formatNumber(count('open'))}
          detail="The game starts them as the story reaches them"
        />
        <StatTile
          icon={<ScrollText />}
          label="Main story"
          value={`${formatNumber(mainDone)} / ${formatNumber(main.length)}`}
          detail="Chapters done"
        />
      </div>

      <Toolbar>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search quests by name or id"
            className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-8 text-xs shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none dark:bg-input/30"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(['all', 'active', 'done', 'open'] as const).map((value) => (
            <Button
              key={value}
              size="xs"
              variant={filter === value ? 'secondary' : 'ghost'}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? 'All' : STATES[value]}
            </Button>
          ))}
        </div>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filter by category"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs dark:bg-input/30"
        >
          <option value="all">Every category</option>
          {CATEGORIES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyPanel
          icon={<ScrollText />}
          title="No quest matches that filter"
          description="Try a different search or filter."
        />
      ) : (
        CATEGORIES.map(([value, label]) => {
          const quests = rows.filter((quest) => quest.category === value);
          if (quests.length === 0) return null;
          const all = log.filter((quest) => quest.category === value);
          const done = all.filter((quest) => quest.state === 'done').length;
          return (
            <Panel
              key={value}
              title={label}
              description={`${formatNumber(done)} of ${formatNumber(all.length)} done`}
              contentClassName="p-0"
            >
              <ul className="divide-y">
                {quests.map((quest) => (
                  <QuestRow
                    key={quest.id}
                    quest={quest}
                    language={language}
                    busy={busy}
                    expanded={open === quest.id}
                    onToggle={() => setOpen((current) => (current === quest.id ? null : quest.id))}
                    onComplete={() => void completeQuest(quest.id)}
                  />
                ))}
              </ul>
            </Panel>
          );
        })
      )}

      <InfoNote>
        Only a quest in progress can be completed. Marking later quests done without playing them would skip the scenes,
        unlocks and heroes the game hands out on the way, so the editor leaves them to the game.
      </InfoNote>
    </div>
  );
}

function QuestRow({
  quest,
  language,
  busy,
  expanded,
  onToggle,
  onComplete,
}: {
  quest: QuestEntry;
  language: string;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onComplete: () => void;
}) {
  const name = language === 'fr' ? quest.nameFr : quest.nameEn;
  const step = quest.step?.text ? (language === 'fr' ? quest.step.text.fr : quest.step.text.en) : null;
  const description = quest.description ? (language === 'fr' ? quest.description.fr : quest.description.en) : null;
  const Icon = quest.state === 'done' ? CheckCircle2 : quest.state === 'active' ? CircleDot : Circle;
  return (
    <li className="px-5 py-3">
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden
          className={cn(
            'mt-0.5 size-4 shrink-0',
            quest.state === 'done'
              ? 'text-emerald-500'
              : quest.state === 'active'
                ? 'text-brand'
                : 'text-muted-foreground',
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('font-medium', quest.state === 'open' && 'text-muted-foreground')}>{name}</span>
            <span className="numeric text-xs text-muted-foreground">#{quest.id}</span>
            {quest.state === 'active' && <Badge variant="outline">{STATES.active}</Badge>}
          </div>
          {quest.state === 'active' && quest.step && (
            <p className="mt-1 text-sm">
              <span className="text-muted-foreground">
                Step {quest.step.id}
                {quest.steps > 0 && ` of ${quest.steps}`}:{' '}
              </span>
              {step ? <RichText text={step} /> : 'no text in the game data'}
              {quest.step.count > 0 && <span className="numeric text-muted-foreground"> ({quest.step.count})</span>}
            </p>
          )}
          {quest.state === 'active' && quest.blocked && (
            <p className="mt-1 text-xs text-warn-strong">The editor cannot complete it: {quest.blocked}.</p>
          )}
          {expanded && description && (
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              <RichText text={description} />
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {quest.state === 'active' && (
            <Button size="xs" variant="outline" disabled={busy || quest.blocked !== null} onClick={onComplete}>
              Complete
            </Button>
          )}
          {description && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide the story' : 'Show the story'}
              onClick={onToggle}
            >
              <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
