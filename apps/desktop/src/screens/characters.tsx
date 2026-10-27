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
import { type CSSProperties, useMemo, useState } from 'react';
import skillDiscCircle from '@/assets/skill-disc-circle.webp';
import skillDiscDiamond from '@/assets/skill-disc-diamond.webp';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { NumberField } from '@/components/fields';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader } from '@/components/page';
import { NativeSelect } from '@/components/select';
import { CountPill } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import {
  MAX_CHARACTER_HP,
  MAX_POINTS,
  MAX_SOLDIER_GRADE,
  MAX_TRANSCEND_TOTAL,
  breakthroughSummary,
  skillLimit,
} from '@/lib/limits';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { Character, HeroEntry, HeroSource, HeroTab, Loadout, LoadoutEntry, Skill, TeamPage } from '@/lib/types';
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
        {tab === 'skills' && <HeroSkills character={character} language={language} busy={busy} />}
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

/** The effect rings per effect, baked by scripts/gen-icons.mjs: skill-ring-<ring>-<effect>.webp. */
const RING_LAYERS = import.meta.glob<string>('../assets/skill-ring-*.webp', { eager: true, import: 'default' });

/** One effect ring of a skill slot, already in the effect's colour, over the slot's whole box. */
function ringStyle(ring: 'glow' | 'line' | 'signal', skill: Skill): CSSProperties {
  const effect = (skill.effect?.key ?? 'ATTACK').toLowerCase();
  const image = RING_LAYERS[`../assets/skill-ring-${ring}-${effect}.webp`];
  return {
    backgroundImage: image ? `url(${image})` : undefined,
    backgroundSize: '100% 100%',
    mixBlendMode: ring === 'glow' ? 'normal' : 'plus-lighter',
  };
}

function skillName(skill: Skill, language: string): string {
  if (skill.info) return language === 'fr' ? skill.info.nameFr : skill.info.nameEn;
  return `Skill ${skill.typeValue}`;
}

function effectName(skill: Skill, language: string): string | null {
  if (!skill.effect) return null;
  return language === 'fr' ? skill.effect.nameFr : skill.effect.nameEn;
}

/**
 * A skill slot drawn from the game's own layers, in the order its
 * DUWG_CharacterSkill_Def (circle) and _Tag (diamond) widgets stack them: the
 * dark disc, the glyph filling the same box (so a tip can reach past the
 * disc's edge), then the effect rings in the skill's colour (MesmerizedUIColor):
 * a translucent glow (FXT_ring13_UI_ad01) and an additive line (_ad02) on a
 * circle, the additive signal ring on a diamond. The rings are the game's own
 * shader maths averaged over their motion (docs/game-assets.md); the game
 * rotates their noise, the editor keeps them still.
 */
function SkillIcon({ skill, size }: { skill: Skill; size: number }) {
  const badge = Math.round(size * 0.4);
  const signal = skill.info?.signal ?? false;
  const glyph = {
    nameEn: skill.info?.nameEn ?? '?',
    iconX: skill.info?.iconX ?? 0,
    iconY: skill.info?.iconY ?? 0,
    category: 'skill',
    icon: Boolean(skill.info && (skill.info.iconX || skill.info.iconY)),
  };
  return (
    // A block box: every layer fills it, as in the game's slot.
    <span className="relative block shrink-0 isolate" style={{ width: size, height: size }}>
      <span
        aria-hidden
        className="absolute inset-0 bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${signal ? skillDiscDiamond : skillDiscCircle})` }}
      />
      <ItemIcon item={glyph} size={size} className="absolute inset-0 rounded-none border-0 bg-transparent" />
      {signal ? (
        <span aria-hidden className="absolute inset-0" style={ringStyle('signal', skill)} />
      ) : (
        <>
          <span aria-hidden className="absolute inset-0" style={ringStyle('glow', skill)} />
          <span aria-hidden className="absolute inset-0" style={ringStyle('line', skill)} />
        </>
      )}
      {skill.effect && (
        <ItemIcon
          item={{ ...skill.effect, category: 'skill', icon: true }}
          size={badge}
          className="absolute -top-1 -left-1 rounded-full border-white/40 bg-zinc-900"
        />
      )}
    </span>
  );
}

function HeroSkills({ character, language, busy }: { character: Character; language: string; busy: boolean }) {
  const skills = useApp((state) => state.skills);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const selected = skills.find((skill) => skill.typeValue === selectedType) ?? skills[0];

  if (!selected) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        The game data names no skills for this hero, and the save has no skill rows.
      </p>
    );
  }

  // The game's two columns: SlotOrder 1–4 on the left, 5–8 on the right,
  // and the master skill (9) below.
  const order = (skill: Skill) => skill.info?.order ?? 10;
  const left = skills.filter((skill) => order(skill) <= 4);
  const right = skills.filter((skill) => order(skill) >= 5 && order(skill) <= 8);
  const rest = skills.filter((skill) => order(skill) >= 9);
  const node = (skill: Skill) => (
    <SkillNode
      key={skill.typeValue}
      skill={skill}
      language={language}
      selected={skill.typeValue === selected.typeValue}
      onSelect={() => setSelectedType(skill.typeValue)}
    />
  );

  // The detail pane sits beside the tree only when the panel has room for
  // both, so narrow windows never cut the skill names short.
  return (
    <div className="@container">
      <div className="grid max-w-4xl gap-6 @2xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-3">
            <div className="space-y-1">{left.map(node)}</div>
            <div className="space-y-1">{right.map(node)}</div>
          </div>
          {rest.length > 0 && (
            <div className="flex justify-center border-t pt-4">
              <div className="w-1/2 space-y-1">{rest.map(node)}</div>
            </div>
          )}
        </div>
        <SkillDetail key={selected.typeValue} skill={selected} character={character} language={language} busy={busy} />
      </div>
    </div>
  );
}

function SkillNode({
  skill,
  language,
  selected,
  onSelect,
}: {
  skill: Skill;
  language: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const detail = skill.info?.master ? 'Master skill' : effectName(skill, language);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-brand/60 bg-muted',
      )}
    >
      <span className={cn('relative block shrink-0', !skill.saved && skill.editable && 'opacity-60')}>
        <SkillIcon skill={skill} size={44} />
        <span className="absolute -bottom-1 -left-1 flex size-5 items-center justify-center rounded-full border bg-background text-[11px] font-semibold tabular-nums">
          {skill.saved || !skill.editable ? skill.level : '–'}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm font-medium',
            !skill.saved && skill.editable && 'text-muted-foreground',
          )}
        >
          {skillName(skill, language)}
        </span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
    </button>
  );
}

function SkillDetail({
  skill,
  character,
  language,
  busy,
}: {
  skill: Skill;
  character: Character;
  language: string;
  busy: boolean;
}) {
  const setSkill = useApp((state) => state.setSkill);
  const removeSkill = useApp((state) => state.removeSkill);
  const max = skillLimit(character.limits, skill.typeValue);
  const name = skillName(skill, language);
  const description = language === 'fr' ? skill.info?.descFr : skill.info?.descEn;
  const effect = effectName(skill, language);

  return (
    <aside className="flex flex-col items-center gap-3 self-start rounded-lg border p-5 text-center">
      <SkillIcon skill={skill} size={88} />
      <div>
        <div className="text-sm text-muted-foreground tabular-nums">
          {skill.saved || !skill.editable ? `Lv. ${skill.level}` : 'Not in this save'}
        </div>
        <h3 className="font-heading text-lg font-semibold">{name}</h3>
        {effect && <div className="text-xs text-muted-foreground">Applies {effect}</div>}
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="mt-1 w-full border-t pt-4">
        {!skill.editable ? (
          <p className="text-xs text-muted-foreground">
            The game keeps no save row for this slot. It is always at level {skill.level}.
          </p>
        ) : skill.saved ? (
          <div className="flex items-center justify-center gap-2">
            <NumberField
              value={skill.level}
              onCommit={(level) => void setSkill(character.cid, skill.typeValue, level)}
              max={max}
              disabled={busy}
              ariaLabel={`${name} level`}
              className="h-8 w-20"
            />
            <span className="text-xs text-muted-foreground tabular-nums">max {max}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Remove this skill's save row"
              disabled={busy}
              onClick={() => void removeSkill(character.cid, skill.typeValue)}
            >
              <Trash2 />
              <span className="sr-only">Remove skill row</span>
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy || max < 1}
            onClick={() => void setSkill(character.cid, skill.typeValue, 1)}
          >
            <Plus />
            Add at level 1
          </Button>
        )}
      </div>
    </aside>
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

function heroSource(source: HeroSource, language: string): string {
  if (source.kind === 'shop') return "Shop (Fate's Invitation)";
  return `From quest ${language === 'fr' ? source.nameFr : source.nameEn}`;
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
                  <div className="text-xs text-muted-foreground">
                    {hero.sources.map((source) => heroSource(source, language)).join(' · ')}
                  </div>
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
