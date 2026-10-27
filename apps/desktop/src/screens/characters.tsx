import {
  Flame,
  Footprints,
  Hand,
  HardHat,
  type LucideIcon,
  PawPrint,
  PersonStanding,
  Plus,
  Search,
  Shirt,
  Star,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { NumberField } from '@/components/fields';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader } from '@/components/page';
import { NativeSelect } from '@/components/select';
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
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import {
  MAX_CHARACTER_HP,
  MAX_POINTS,
  MAX_SOLDIER_GRADE,
  MAX_TRANSCEND_TOTAL,
  SKILL_TYPES,
  breakthroughSummary,
  skillLimit,
} from '@/lib/limits';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { Character, GrowthLimits, HeroEntry, HeroTab, Loadout, LoadoutEntry, TeamPage } from '@/lib/types';
import { cn } from '@/lib/utils';

type SlotKey = keyof Omit<Loadout, 'characterCid'>;

const GEAR_SLOTS: Array<[SlotKey, string, LucideIcon]> = [
  ['head', 'Head', HardHat],
  ['chest', 'Chest', Shirt],
  ['leg', 'Legs', PersonStanding],
  ['hand', 'Hands', Hand],
  ['foot', 'Feet', Footprints],
];

const TABS: Array<[HeroTab, string]> = [
  ['info', 'Information'],
  ['skills', 'Skills'],
  ['equipment', 'Equipment'],
];

export function CharactersScreen() {
  const characters = useApp((state) => state.characters);
  const selectedCharacter = useApp((state) => state.selectedCharacter);
  const teams = useApp((state) => state.teams);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const selectCharacter = useApp((state) => state.selectCharacter);
  const [query, setQuery] = useState('');
  const [recruitOpen, setRecruitOpen] = useState(false);

  const selected = characters.find((character) => character.cid === selectedCharacter) ?? null;
  const busy = pending !== null;

  const roster = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return characters;
    return characters.filter(
      (character) =>
        character.item.nameEn.toLowerCase().includes(needle) ||
        character.item.nameFr.toLowerCase().includes(needle) ||
        character.cid.toString().includes(needle),
    );
  }, [characters, query]);

  const joined = characters.filter((character) => character.joined).length;
  const highest = characters.reduce((level, character) => Math.max(level, character.level), 0);

  if (!save) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Heroes"
        description={`${formatNumber(joined)} on the roster${joined < characters.length ? ` · ${formatNumber(characters.length - joined)} not joined yet` : ''} · highest level ${formatNumber(highest)}`}
        actions={
          <Button variant="outline" onClick={() => setRecruitOpen(true)}>
            <UserPlus />
            Recruit hero
          </Button>
        }
      />

      <div className="grid h-[calc(100svh-12.5rem)] min-h-[560px] grid-cols-[260px_minmax(0,1fr)] overflow-hidden rounded-xl border bg-card/40">
        <div className="flex min-h-0 flex-col border-r">
          <div className="p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a hero"
                aria-label="Find a hero"
                className="pl-8"
              />
            </div>
          </div>
          <div className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {roster.map((character) => {
              const active = character.cid === selectedCharacter;
              return (
                <button
                  key={character.cid}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => void selectCharacter(character.cid)}
                  className={cn(
                    'relative flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
                    active && 'bg-accent',
                  )}
                >
                  {active && (
                    <span aria-hidden className="absolute inset-y-2 -left-2 w-[3px] rounded-r-full bg-brand" />
                  )}
                  <ItemIcon
                    item={character.item}
                    size={36}
                    className={cn('rounded-full', !character.joined && 'opacity-50 grayscale')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-sm', active && 'font-medium')}>
                      {itemName(character.item, language)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {character.joined ? `Lv. ${character.level}` : 'Not joined yet'}
                    </div>
                  </div>
                  {character.joined && <Stars count={character.ascend} max={character.limits.maxStage} size="xs" />}
                </button>
              );
            })}
            {roster.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">No hero matches that search.</p>
            )}
          </div>
        </div>

        {selected ? (
          <HeroDetail key={selected.cid} character={selected} language={language} busy={busy} />
        ) : (
          <EmptyPanel
            icon={<Users />}
            title="No hero selected"
            description="Pick a hero from the roster to edit their level, skills and gear."
            className="m-4 border-none"
          />
        )}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Saved teams</h2>
          <p className="text-sm text-muted-foreground">
            Three heroes per page. Empty slots stay at the end, and the active team's selected slot cannot be emptied.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {teams.map((team) => (
            <TeamCard key={team.pageId} team={team} characters={characters} language={language} busy={busy} />
          ))}
          {teams.length === 0 && <p className="text-sm text-muted-foreground">This save has no team pages.</p>}
        </div>
      </section>

      <RecruitDialog open={recruitOpen} onOpenChange={setRecruitOpen} language={language} />
    </div>
  );
}

/** Breakthrough stars, as the game draws them above the level. */
function Stars({ count, max, size = 'md' }: { count: number; max: number; size?: 'xs' | 'md' }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" title={`Breakthrough ${count} of ${max}`}>
      {Array.from({ length: max }, (_, index) => (
        <Star
          // biome-ignore lint/suspicious/noArrayIndexKey: stars are positional
          key={index}
          aria-hidden
          className={cn(
            size === 'xs' ? 'size-2.5' : 'size-4',
            index < count ? 'fill-brand text-brand' : 'fill-muted text-muted-foreground/40',
          )}
        />
      ))}
      <span className="sr-only">
        Breakthrough {count} of {max}
      </span>
    </span>
  );
}

function HeroDetail({ character, language, busy }: { character: Character; language: string; busy: boolean }) {
  const removeCharacter = useApp((state) => state.removeCharacter);
  const tab = useApp((state) => state.heroTab);
  const setTab = useApp((state) => state.setHeroTab);
  const limits = character.limits;
  const name = itemName(character.item, language);
  // The EXP a level spans, counted as the game shows it: 0 / 150 at level 1.
  const span = limits.exp - limits.expMin + 1;
  const into = character.exp - limits.expMin;
  const capped = character.level >= limits.level;

  return (
    <div className="flex min-h-0 flex-col">
      <header className="flex items-start gap-4 border-b px-6 pt-5 pb-4">
        <ItemIcon item={character.item} size={72} className="rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-xl font-semibold tracking-tight">{name}</h2>
            <Stars count={character.ascend} max={limits.maxStage} />
            {!character.joined && (
              <Badge variant="outline" className="text-muted-foreground">
                Not joined yet
              </Badge>
            )}
          </div>
          <div className="max-w-md space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                <span className="font-medium">Lv. {character.level}</span>
                <span className="text-muted-foreground"> / {limits.level}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {capped || span <= 1 ? 'Level cap' : `${formatNumber(Math.max(0, into))} / ${formatNumber(span)} EXP`}
              </span>
            </div>
            <Progress
              value={capped || span <= 1 ? 100 : (100 * Math.max(0, into)) / span}
              indicatorClassName="bg-brand"
            />
          </div>
        </div>
        <ConfirmButton
          title={`Remove ${name}?`}
          description="Deletes the hero's row, their skills, their team placements and their equipment links. A hero in the active team must be moved off it first; other team pages compact forward. Before saving, Discard changes undoes this along with every other unsaved edit."
          confirmLabel="Remove hero"
          variant="ghost"
          size="sm"
          disabled={busy}
          className="text-muted-foreground hover:text-destructive"
          onConfirm={() => void removeCharacter(character.cid)}
        >
          <Trash2 />
          Remove
        </ConfirmButton>
      </header>

      <div role="tablist" aria-label="Hero" className="flex gap-6 border-b px-6">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'relative -mb-px border-b-2 border-transparent py-2.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground',
              tab === id && 'border-brand font-medium text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {tab === 'info' && <HeroInformation character={character} busy={busy} />}
        {tab === 'skills' && <HeroSkills character={character} busy={busy} />}
        {tab === 'equipment' && <HeroEquipment language={language} />}
      </div>
    </div>
  );
}

function HeroInformation({ character, busy }: { character: Character; busy: boolean }) {
  const setCharacter = useApp((state) => state.setCharacter);
  const limits = character.limits;
  const change = (field: string) => (value: number) => void setCharacter(character.cid, field, value);
  const rows: Array<{ label: string; field: string; value: number; min?: number; max: number; note?: string }> = [
    { label: 'Level', field: 'level', value: character.level, min: 1, max: limits.level },
    { label: 'EXP', field: 'exp', value: character.exp, min: limits.expMin, max: limits.exp, note: 'running total' },
    { label: 'Breakthrough', field: 'ascend', value: character.ascend, max: limits.ascend },
    { label: 'Transcend', field: 'transcend', value: character.transcend, max: limits.transcend },
    { label: 'Transcend total', field: 'transcendTotal', value: character.transcendTotal, max: MAX_TRANSCEND_TOTAL },
    { label: 'HP', field: 'hp', value: character.hp, max: MAX_CHARACTER_HP, note: 'current health' },
    { label: 'Soldier grade', field: 'soldierGrade', value: character.soldierGrade, max: MAX_SOLDIER_GRADE },
    {
      label: 'Soldier grade points',
      field: 'soldierGradePoint',
      value: character.soldierGradePoint,
      max: MAX_POINTS,
    },
  ];

  return (
    <div className="max-w-2xl space-y-5">
      <div className="space-y-px">
        {rows.map((row) => {
          const top = formatNumber(Math.max(row.max, row.value));
          return (
            <div key={row.field} className="flex items-center gap-3 rounded-md px-3 py-1 odd:bg-muted/50">
              <span className="flex-1 text-sm">
                {row.label}
                {row.note && <span className="ml-2 text-xs text-muted-foreground">{row.note}</span>}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {row.min === undefined ? `max ${top}` : `${formatNumber(row.min)}–${top}`}
              </span>
              <NumberField
                value={row.value}
                onCommit={change(row.field)}
                min={row.min}
                max={row.max}
                disabled={busy}
                ariaLabel={row.label}
                className="h-8 w-32 border-transparent bg-transparent text-base font-medium shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {breakthroughSummary(limits, character.ascend)}. A value commits on Enter or when the field loses focus.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">CID</dt>
        <dd className="font-mono text-xs leading-5">{character.cid}</dd>
        <dt className="text-muted-foreground">Joined</dt>
        <dd>{character.joined ? formatCreated(character.createdAt) : 'Not yet; the story brings this hero in'}</dd>
      </dl>
    </div>
  );
}

function skillLabel(typeValue: number): string {
  if (typeValue >= 800) return 'Special skill';
  if (typeValue >= 5) return `Basic skill ${typeValue - 4}`;
  return `Active skill ${typeValue}`;
}

function HeroSkills({ character, busy }: { character: Character; busy: boolean }) {
  const skills = useApp((state) => state.skills);
  const setSkill = useApp((state) => state.setSkill);
  const removeSkill = useApp((state) => state.removeSkill);
  const [skillOpen, setSkillOpen] = useState(false);

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Slots 1–4 are active skills, 5–7 basic skills and 801 the special skill. Levels belong to the skill, not the
          hero.
        </p>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setSkillOpen(true)}>
          <Plus />
          Add skill
        </Button>
      </div>
      {skills.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          This hero has no skill rows yet.
        </p>
      ) : (
        <div className="space-y-px">
          {skills.map((skill) => (
            <div key={skill.typeValue} className="flex items-center gap-3 rounded-md px-3 py-1 odd:bg-muted/50">
              <span className="flex size-7 items-center justify-center rounded-full border bg-background text-xs font-semibold tabular-nums">
                {skill.level}
              </span>
              <span className="flex-1 text-sm">{skillLabel(skill.typeValue)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                max {skillLimit(character.limits, skill.typeValue)}
              </span>
              <NumberField
                value={skill.level}
                onCommit={(level) => void setSkill(character.cid, skill.typeValue, level)}
                max={skillLimit(character.limits, skill.typeValue)}
                disabled={busy}
                ariaLabel={`${skillLabel(skill.typeValue)} level`}
                className="h-8 w-24 border-transparent bg-transparent text-base font-medium shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                title="Remove this skill row"
                disabled={busy}
                onClick={() => void removeSkill(character.cid, skill.typeValue)}
              >
                <Trash2 />
                <span className="sr-only">Remove skill</span>
              </Button>
            </div>
          ))}
        </div>
      )}
      <SkillDialog
        open={skillOpen}
        onOpenChange={setSkillOpen}
        limits={character.limits}
        busy={busy}
        onAdd={(typeValue, level) => {
          void setSkill(character.cid, typeValue, level);
          setSkillOpen(false);
        }}
      />
    </div>
  );
}

function HeroEquipment({ language }: { language: string }) {
  const loadout = useApp((state) => state.loadout);
  const setSection = useApp((state) => state.setSection);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Gear</h3>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSection('equipment')}
          >
            Change on the Equipment screen
          </button>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {GEAR_SLOTS.map(([slot, label, icon]) => (
            <SlotTile key={slot} label={label} icon={icon} entry={loadout?.[slot] ?? null} language={language} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium">Karma</h3>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSection('karma')}
            >
              Change
            </button>
          </div>
          <SlotTile wide label="Karma" icon={Flame} entry={loadout?.karma ?? null} language={language} karma />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-medium">Familiar</h3>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSection('mounts')}
            >
              Change
            </button>
          </div>
          <SlotTile wide label="Familiar" icon={PawPrint} entry={loadout?.vehicle ?? null} language={language} />
        </div>
      </div>
    </div>
  );
}

/** An equipment slot as the game draws it: the item, or the slot's outline when empty. */
function SlotTile({
  label,
  icon: Icon,
  entry,
  language,
  wide = false,
  karma = false,
}: {
  label: string;
  icon: LucideIcon;
  entry: LoadoutEntry | null;
  language: string;
  wide?: boolean;
  karma?: boolean;
}) {
  if (!entry) {
    return (
      <div
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 text-muted-foreground/60',
          wide ? 'h-16' : 'aspect-square flex-col',
        )}
        title={`${label}: empty`}
      >
        <Icon aria-hidden className="size-6" />
        <span className="text-xs">{wide ? `No ${label.toLowerCase()}` : label}</span>
      </div>
    );
  }
  const level = karma ? `Breakthrough ${entry.enchantLevel}` : `+${entry.enchantLevel}`;
  if (wide) {
    return (
      <div className="flex h-16 items-center gap-3 rounded-lg border bg-muted/30 px-3">
        <ItemIcon item={entry.item} size={44} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{itemName(entry.item, language)}</div>
          {!entry.item.category.startsWith('mount') && <div className="text-xs text-muted-foreground">{level}</div>}
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border bg-muted/30 p-2 text-center"
      title={`${label}: ${itemName(entry.item, language)}`}
    >
      <ItemIcon item={entry.item} size={52} />
      <div className="w-full truncate text-xs font-medium">{itemName(entry.item, language)}</div>
      <div className="text-xs text-muted-foreground">{level}</div>
    </div>
  );
}

function TeamCard({
  team,
  characters,
  language,
  busy,
}: {
  team: TeamPage;
  characters: Character[];
  language: string;
  busy: boolean;
}) {
  const setTeamSlot = useApp((state) => state.setTeamSlot);
  return (
    <div className="rounded-lg border bg-background/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs font-medium">Page {team.pageId}</span>
          {team.selected && (
            <Badge variant="outline" className="border-brand/50 text-xs text-brand">
              Active
            </Badge>
          )}
        </div>
        <CountPill>{team.slots.filter((slot) => slot.cid !== 0).length}/3</CountPill>
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((slotNumber) => {
          const slot = team.slots[slotNumber - 1];
          if (!slot) return null;
          return (
            <div key={`${team.pageId}:${slotNumber}`} className="flex items-center gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded border bg-muted/40">
                {slot.item ? (
                  <ItemIcon item={slot.item} size={26} />
                ) : (
                  <span className="text-xs text-muted-foreground">{slotNumber}</span>
                )}
              </div>
              <NativeSelect
                className="min-w-0 flex-1"
                value={slot.cid}
                disabled={busy}
                aria-label={`Team ${team.pageId} slot ${slotNumber}`}
                onChange={(event) => void setTeamSlot(team.pageId, slotNumber, Number(event.target.value))}
              >
                <option value={0}>Empty slot</option>
                {characters.map((character) => (
                  <option key={character.cid} value={character.cid}>
                    {itemName(character.item, language)} · Lv {character.level}
                  </option>
                ))}
              </NativeSelect>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkillDialog({
  open,
  onOpenChange,
  limits,
  busy,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null until a hero is selected; the dialog cannot add anything then. */
  limits: GrowthLimits | null;
  busy: boolean;
  onAdd: (typeValue: number, level: number) => void;
}) {
  const [typeValue, setTypeValue] = useState('1');
  const [level, setLevel] = useState('1');
  const parsedType = Number(typeValue) || 0;
  const parsedLevel = Number(level) || 0;
  const maxLevel = limits ? skillLimit(limits, parsedType) : 0;
  const valid = limits !== null && SKILL_TYPES.includes(parsedType) && parsedLevel >= 0 && parsedLevel <= maxLevel;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a skill row</DialogTitle>
          <DialogDescription>
            TYPE_VALUE identifies the skill slot: 1–4 active, 5–7 basic, and 801 special.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="skill-type">TYPE_VALUE</Label>
            <Input
              id="skill-type"
              value={typeValue}
              inputMode="numeric"
              className="numeric"
              onChange={(event) => setTypeValue(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">1–7 or 801</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skill-level">Level</Label>
            <Input
              id="skill-level"
              value={level}
              inputMode="numeric"
              className="numeric"
              onChange={(event) => setLevel(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">0–{maxLevel} for this hero's breakthrough and slot</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !valid} onClick={() => onAdd(parsedType, parsedLevel)}>
            {busy ? <Spinner /> : <Plus />}
            Add skill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function heroSource(source: string): string {
  if (source === 'shop') return 'Shop';
  const [kind, quest] = source.split(':');
  return kind === 'joins' ? `Joins in quest ${quest}` : `Quest ${quest} reward`;
}

function RecruitDialog({
  open,
  onOpenChange,
  language,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: string;
}) {
  const pending = useApp((state) => state.pending);
  const loadHeroes = useApp((state) => state.recruitableHeroes);
  const recruitHero = useApp((state) => state.recruitHero);
  const [heroes, setHeroes] = useState<HeroEntry[] | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setHeroes(null);
      void loadHeroes().then(setHeroes);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recruit hero</DialogTitle>
          <DialogDescription>
            The heroes the game hands out. A recruit joins at level 1, as when the game redeems the hero's item.
          </DialogDescription>
        </DialogHeader>
        {heroes === null ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="scroll-thin max-h-[56vh] divide-y overflow-y-auto rounded-lg border">
            {heroes.map((hero) => (
              <div key={hero.cid} className="flex items-center gap-3 px-3 py-2">
                <ItemIcon item={hero.item} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{itemName(hero.item, language)}</div>
                  <div className="text-xs text-muted-foreground">{hero.sources.map(heroSource).join(' · ')}</div>
                </div>
                {hero.owned ? (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    On the roster
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending !== null}
                    onClick={async () => {
                      await recruitHero(hero.cid);
                      setHeroes(await loadHeroes());
                    }}
                  >
                    <UserPlus />
                    Recruit
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatCreated(seconds: number): string {
  if (!seconds) return 'unknown';
  return new Date(seconds * 1000).toLocaleDateString();
}
