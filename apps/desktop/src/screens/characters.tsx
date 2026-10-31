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
import { NumberField, SearchField } from '@/components/fields';
import { GradeStars, RichText } from '@/components/game-text';
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
import { formatStatValue, gameText, statName, uiText, useGameUi } from '@/lib/game';
import {
  MAX_CHARACTER_HP,
  MAX_POINTS,
  MAX_SOLDIER_GRADE,
  MAX_TRANSCEND_TOTAL,
  breakthroughSummary,
  skillLimit,
} from '@/lib/limits';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type {
  Character,
  HeroEntry,
  HeroSource,
  HeroTab,
  Item,
  Loadout,
  LoadoutEntry,
  Skill,
  TeamPage,
  TraitInfo,
} from '@/lib/types';
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
  ['awaken', 'Awaken'],
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
            {character.traitInfo && <TraitEmblem info={character.traitInfo} size={30} language={language} />}
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

      {/* The Skills tab scrolls its tree and its detail apart, so it has no shared scroll. */}
      {tab === 'skills' ? (
        <HeroSkills character={character} language={language} busy={busy} />
      ) : (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'info' && <HeroInformation character={character} busy={busy} language={language} />}
          {tab === 'equipment' && <HeroEquipment character={character} language={language} busy={busy} />}
          {tab === 'awaken' && <HeroAwaken character={character} language={language} />}
        </div>
      )}
    </div>
  );
}

/** A trait's emblem, as the game draws it beside a hero's or karma's name. */
export function TraitEmblem({ info, size, language }: { info: TraitInfo; size: number; language: string }) {
  return (
    <span title={language === 'fr' ? info.nameFr : info.nameEn} className="inline-flex shrink-0">
      <ItemIcon
        item={{ nameEn: info.nameEn, iconX: info.iconX, iconY: info.iconY, category: 'trait', icon: true }}
        size={size}
        className="rounded-none border-none bg-transparent"
      />
    </span>
  );
}

/**
 * The hero screen's stat block, computed from the game's own tables: the
 * hero's level and breakthrough, worn equipment and its sets, and karma.
 */
function HeroStatBlock({ character, language }: { character: Character; language: string }) {
  const gameUi = useGameUi((state) => state.ui);
  const [detailed, setDetailed] = useState(false);
  const stats = character.stats;
  if (!stats) return null;
  const label = (key: string, fallback: string) => uiText(gameUi, `stat.${key}`, language) || fallback;
  const rows: Array<[string, string]> = [
    [label('Attack', 'Attack'), formatStatValue(stats.attack, false)],
    [label('Defence', 'Defense'), formatStatValue(stats.defence, false)],
    [label('MAXHP', 'Max HP'), formatStatValue(stats.maxHp, false)],
    [label('Critical_Per', 'Critical Rate'), formatStatValue(stats.critical, true)],
    [label('CriticalDmg_Per', 'Critical Damage'), formatStatValue(stats.criticalDamage, true)],
    [label('MaxStamina', 'Max Stamina'), formatStatValue(stats.maxStamina, false)],
  ];
  return (
    <section className="space-y-3">
      <div className="space-y-px">
        {rows.map(([name, value]) => (
          <div key={name} className="flex items-center justify-between rounded-md px-3 py-1 odd:bg-muted/50">
            <span className="text-sm">{name}</span>
            <span className="text-base font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      {stats.details.length > 0 && (
        <div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setDetailed(!detailed)}
          >
            {uiText(gameUi, 'detailedStats', language) || 'Detailed Stats'} ({stats.details.length})
          </button>
          {detailed && (
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
              {stats.details.map((stat) => (
                <div key={stat.key} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{statName(stat, language)}</span>
                  <span className="tabular-nums">{formatStatValue(stat.value, stat.percent)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {stats.karmaTraitApplied === false && (
        <p className="text-xs text-muted-foreground">
          {uiText(gameUi, 'traitEffect', language)} ({uiText(gameUi, 'notApplied', language)}): the worn karma's trait
          differs from the hero's.
        </p>
      )}
      {(character.quote || character.bio) && (
        <div className="space-y-2 border-t pt-3 text-sm text-muted-foreground italic">
          {character.quote && <RichText text={gameText(character.quote, language)} className="block" />}
          {character.bio && <RichText text={gameText(character.bio, language)} className="block" />}
        </div>
      )}
    </section>
  );
}

/** The six Awaken steps, as the game's Awaken tab lists them. */
function HeroAwaken({ character, language }: { character: Character; language: string }) {
  if (character.awaken.length === 0) {
    return <p className="text-sm text-muted-foreground">The game data names no Awaken steps for this hero.</p>;
  }
  return (
    <div className="max-w-3xl space-y-2">
      <p className="text-xs text-muted-foreground">
        Awakened {character.transcend} of {character.awaken.length}; the Information tab edits the step.
      </p>
      {character.awaken.map((step) => {
        const reached = step.step <= character.transcend;
        return (
          <div
            key={step.step}
            className={cn('rounded-lg border p-3', reached ? 'border-brand/50 bg-brand/5' : 'opacity-80')}
          >
            <div className="flex items-baseline gap-2">
              <span className="flex size-5 items-center justify-center rounded-full border text-xs tabular-nums">
                {step.step}
              </span>
              <h4 className="font-medium">{language === 'fr' ? step.nameFr : step.nameEn}</h4>
              {reached && <Badge variant="outline">Awakened</Badge>}
            </div>
            <RichText
              text={language === 'fr' ? step.descFr : step.descEn}
              className="mt-1 block text-sm text-muted-foreground"
            />
          </div>
        );
      })}
    </div>
  );
}

function HeroInformation({ character, busy, language }: { character: Character; busy: boolean; language: string }) {
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
      <HeroStatBlock character={character} language={language} />
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
 * rotates their noise, the editor keeps them still. The effect's mark is the
 * State_Mark glyph on the small dark plate the game gives it, centred on the
 * ring's top-left edge.
 */
function SkillIcon({ skill, size, badge = true }: { skill: Skill; size: number; badge?: boolean }) {
  // The ring art puts its line 0.21 of the slot in from each side at 45°.
  // The game's mark is about a fifth of the ring across; at list sizes that
  // is under 12px, so 12px is the least it gets.
  const mark = Math.max(12, Math.round(size * 0.16));
  const edge = Math.round(size * 0.21 - mark / 2);
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
      {badge && skill.effect && (
        <span
          aria-hidden
          className="absolute flex items-center justify-center rounded-[25%] bg-[#10202a] ring-1 ring-black"
          style={{ top: edge, left: edge, width: mark, height: mark }}
        >
          <ItemIcon
            item={{ ...skill.effect, category: 'skill', icon: true }}
            size={Math.round(mark * 0.8)}
            className="rounded-none border-0 bg-transparent"
          />
        </span>
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
      <div className="px-6 py-5">
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          The game data names no skills for this hero, and the save has no skill rows.
        </p>
      </div>
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

  // The detail stays beside the tree at every window width, and each scrolls
  // on its own, so picking a skill never sends its detail out of view. The
  // tree keeps the game's two columns when it has room and stacks them, in
  // slot order, when it does not.
  return (
    <div className="@container flex min-h-0 flex-1">
      <div className="scroll-thin @container/tree min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="grid gap-x-3 gap-y-1 @sm/tree:grid-cols-2">
          <div className="space-y-1">{left.map(node)}</div>
          <div className="space-y-1">{right.map(node)}</div>
        </div>
        {rest.length > 0 && (
          <div className="mt-4 flex justify-center border-t pt-4">
            <div className="w-full space-y-1 @sm/tree:w-1/2">{rest.map(node)}</div>
          </div>
        )}
      </div>
      <SkillDetail key={selected.typeValue} skill={selected} character={character} language={language} busy={busy} />
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
            'line-clamp-2 text-sm leading-snug font-medium',
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
    <aside
      aria-label={name}
      className="scroll-thin min-h-0 w-64 shrink-0 overflow-y-auto border-l bg-muted/10 @3xl:w-80"
    >
      <div className="flex flex-col items-center gap-3 p-5 text-center">
        {(skill.label || (effect && skill.effect)) && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
            {effect && skill.effect && (
              <span className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-2 pl-0.5">
                <ItemIcon
                  item={{ ...skill.effect, category: 'skill', icon: true }}
                  size={18}
                  className="rounded-full border-none bg-zinc-900"
                />
                {effect}
              </span>
            )}
            {skill.label && (
              <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                {gameText(skill.label, language)}
              </span>
            )}
          </div>
        )}
        {/* The effect chip above names the effect, so the large icon carries no mark. */}
        <SkillIcon skill={skill} size={88} badge={false} />
        <div>
          <div className="text-sm text-muted-foreground tabular-nums">
            {skill.saved || !skill.editable ? `Lv. ${skill.level}` : 'Not in this save'}
          </div>
          <h3 className="font-heading text-lg font-semibold">{name}</h3>
        </div>
        {skill.lines.length > 0 ? (
          <div className="w-full space-y-1.5 text-left text-sm">
            {skill.lines.map((line) => (
              <RichText
                key={line.kind}
                text={gameText(line.text, language)}
                className={cn(
                  'block leading-relaxed',
                  // Damage and the inflicted status sit on the game's tinted rows.
                  line.kind === '2' || line.kind === '3'
                    ? 'rounded-md bg-muted/60 px-2.5 py-1'
                    : 'text-muted-foreground',
                  line.kind === '4' && 'pt-1',
                )}
              />
            ))}
          </div>
        ) : (
          description && <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {skill.next && <SkillCostView cost={skill.next} language={language} />}
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
      </div>
    </aside>
  );
}

/** The Skill screen's Required Materials and gold for the next level. */
function SkillCostView({ cost, language }: { cost: NonNullable<Skill['next']>; language: string }) {
  const gameUi = useGameUi((state) => state.ui);
  // A level with nothing to pay shows no Required Materials, as in the game.
  if (cost.gold === 0 && cost.items.length === 0 && !cost.ascend) return null;
  return (
    <div className="w-full space-y-2 border-t pt-3 text-left">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>{uiText(gameUi, 'requiredMaterials', language) || 'Required Materials'}</span>
        <span>Lv. {cost.level}</span>
      </div>
      {cost.items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cost.items.map(({ item, count, owned }) => (
            <div key={item.cid} className="flex flex-col items-center gap-0.5" title={itemName(item, language)}>
              <ItemIcon item={item} size={40} />
              <span className="text-[11px] tabular-nums">
                <span className={owned < count ? 'text-destructive' : undefined}>{formatNumber(owned)}</span>/
                {formatNumber(count)}
              </span>
            </div>
          ))}
        </div>
      )}
      {cost.gold > 0 && (
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">{uiText(gameUi, 'required', language) || 'Required'}</span>
          <span className={cn('font-medium tabular-nums', cost.goldOwned < cost.gold && 'text-destructive')}>
            {formatNumber(cost.gold)} gold
          </span>
        </div>
      )}
      {cost.ascend ? <p className="text-xs text-muted-foreground">Needs breakthrough {cost.ascend}.</p> : null}
    </div>
  );
}

function slotLabel(slot: SlotKey): string {
  if (slot === 'karma') return 'Karma';
  if (slot === 'vehicle') return 'Familiar';
  return GEAR_SLOTS.find(([key]) => key === slot)?.[1] ?? slot;
}

function HeroEquipment({ character, language, busy }: { character: Character; language: string; busy: boolean }) {
  const loadout = useApp((state) => state.loadout);
  const [picking, setPicking] = useState<SlotKey | null>(null);
  // Until the loadout arrives every slot reads empty, so none opens yet.
  const disabled = busy || !loadout;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Gear</h3>
        <div className="grid grid-cols-5 gap-3">
          {GEAR_SLOTS.map(([slot, label, icon]) => (
            <SlotTile
              key={slot}
              label={label}
              icon={icon}
              entry={loadout?.[slot] ?? null}
              language={language}
              disabled={disabled}
              onPick={() => setPicking(slot)}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Karma</h3>
          <SlotTile
            wide
            karma
            label="Karma"
            icon={Flame}
            entry={loadout?.karma ?? null}
            language={language}
            disabled={disabled}
            onPick={() => setPicking('karma')}
          />
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Familiar</h3>
          <SlotTile
            wide
            label="Familiar"
            icon={PawPrint}
            entry={loadout?.vehicle ?? null}
            language={language}
            disabled={disabled}
            onPick={() => setPicking('vehicle')}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose a slot to change what {itemName(character.item, language)} wears.
      </p>
      <EquipPicker
        slot={picking}
        character={character}
        language={language}
        busy={busy}
        onClose={() => setPicking(null)}
      />
    </div>
  );
}

/**
 * An equipment slot as the game draws it: the item, or the slot's outline
 * when empty. Choosing it opens the slot's picker.
 */
function SlotTile({
  label,
  icon: Icon,
  entry,
  language,
  disabled,
  onPick,
  wide = false,
  karma = false,
}: {
  label: string;
  icon: LucideIcon;
  entry: LoadoutEntry | null;
  language: string;
  disabled: boolean;
  onPick: () => void;
  wide?: boolean;
  karma?: boolean;
}) {
  const frame = cn(
    'rounded-lg border outline-none transition-colors hover:border-brand/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60',
    wide
      ? 'flex h-16 w-full items-center gap-3 px-3 text-left'
      : 'flex aspect-square w-full flex-col items-center justify-center gap-1.5 p-2 text-center',
  );
  if (!entry) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        title={`${label}: empty. Choose to equip.`}
        className={cn(
          frame,
          'justify-center border-dashed bg-muted/20 text-muted-foreground/60 hover:bg-muted/50 hover:text-muted-foreground',
        )}
      >
        <Icon aria-hidden className="size-6" />
        <span className="text-xs">{wide ? `No ${label.toLowerCase()}` : label}</span>
      </button>
    );
  }
  const name = itemName(entry.item, language);
  const level = karma ? `Breakthrough ${entry.enchantLevel}` : `+${entry.enchantLevel}`;
  if (wide) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        title={`${label}: ${name}. Choose to change.`}
        className={cn(frame, 'bg-muted/30 hover:bg-muted/60')}
      >
        <ItemIcon item={entry.item} size={44} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{name}</span>
          {!entry.item.category.startsWith('mount') && (
            <span className="block text-xs text-muted-foreground">{level}</span>
          )}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      title={`${label}: ${name}. Choose to change.`}
      className={cn(frame, 'bg-muted/30 hover:bg-muted/60')}
    >
      <ItemIcon item={entry.item} size={52} />
      <span className="block w-full truncate text-xs font-medium">{name}</span>
      <span className="block text-xs text-muted-foreground">{level}</span>
    </button>
  );
}

/** One owned piece, karma or familiar in a slot's picker. */
interface Choice {
  dbid: string;
  item: Item;
  /** Grade stars, for gear. */
  stars: number;
  /** The enchant, or a karma's level and breakthrough. */
  level: string;
  /** What orders pieces of one grade: the enchant, or a karma's level. */
  rank: number;
  /** The main stat and set, or whether a karma's trait applies here. */
  note: string | null;
  /** The note is good news: a karma whose trait matches the hero's. */
  good: boolean;
  /** The trait a piece needs, or a karma's trait. */
  traitInfo: TraitInfo | null;
  /** The hero wearing it now, when that is another hero. */
  wearer: Item | null;
  /** Why this hero cannot wear it, as the game refuses it. */
  blocked: string | null;
}

/**
 * The owned gear for one slot, or the owned karma or familiars, to put on
 * the hero without leaving the hero screen. Each opening reads the save
 * again, so who wears what is current.
 */
function EquipPicker({
  slot,
  character,
  language,
  busy,
  onClose,
}: {
  slot: SlotKey | null;
  character: Character;
  language: string;
  busy: boolean;
  onClose: () => void;
}) {
  const gameUi = useGameUi((state) => state.ui);
  const loadout = useApp((state) => state.loadout);
  const equipment = useApp((state) => state.equipment);
  const karma = useApp((state) => state.karma);
  const mounts = useApp((state) => state.mounts);
  const characters = useApp((state) => state.characters);
  const loadEquipment = useApp((state) => state.loadEquipment);
  const loadKarma = useApp((state) => state.loadKarma);
  const loadMounts = useApp((state) => state.loadMounts);
  const equipGear = useApp((state) => state.equipGear);
  const equipKarma = useApp((state) => state.equipKarma);
  const equipMount = useApp((state) => state.equipMount);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<SlotKey | null>(null);
  const [loaded, setLoaded] = useState<SlotKey | null>(null);
  if (slot !== shown) {
    setShown(slot);
    setQuery('');
    if (slot) {
      const load = slot === 'karma' ? loadKarma : slot === 'vehicle' ? loadMounts : loadEquipment;
      void load().then(() => setLoaded(slot));
    }
  }

  const current = slot ? (loadout?.[slot] ?? null) : null;
  const choices = useMemo((): Choice[] => {
    if (!slot) return [];
    const heroTrait = character.traitInfo?.key ?? null;
    const wornBy = (cid: number | null) =>
      cid === null || cid === character.cid ? null : (characters.find((hero) => hero.cid === cid)?.item ?? null);
    const trait = (info: TraitInfo) => (language === 'fr' ? info.nameFr : info.nameEn);
    let list: Choice[];
    if (slot === 'karma') {
      const effect = uiText(gameUi, 'traitEffect', language) || 'Trait Effect';
      const notApplied = uiText(gameUi, 'notApplied', language) || 'Not Applied';
      list = karma.map((entry) => {
        const applies = entry.traitInfo !== null && entry.traitInfo.key === heroTrait;
        return {
          dbid: entry.dbid,
          item: entry.item,
          stars: 0,
          level: `Lv. ${entry.level} · Breakthrough ${entry.ascend}`,
          rank: entry.level * 100 + entry.ascend,
          note: entry.traitInfo ? (applies ? effect : `${effect} (${notApplied})`) : null,
          good: applies,
          traitInfo: entry.traitInfo,
          wearer: wornBy(entry.equippedBy),
          blocked: null,
        };
      });
    } else if (slot === 'vehicle') {
      list = mounts.map((mount) => ({
        dbid: mount.dbid,
        item: mount.item,
        stars: 0,
        level: '',
        rank: 0,
        note: null,
        good: false,
        traitInfo: null,
        wearer: wornBy(mount.equippedBy),
        blocked: null,
      }));
    } else {
      list = equipment
        .filter((piece) => piece.stats?.part.toLowerCase() === slot)
        .map((piece) => {
          const needs = piece.stats?.traitInfo ?? null;
          const main = piece.stats?.main;
          const note = [
            main && `${statName(main, language)} ${formatStatValue(main.value, main.percent)}`,
            piece.set && (language === 'fr' ? piece.set.nameFr : piece.set.nameEn),
          ].filter(Boolean);
          return {
            dbid: piece.dbid,
            item: piece.item,
            stars: piece.stats?.stars ?? 0,
            level: `+${piece.enchantLevel}`,
            rank: piece.enchantLevel,
            note: note.length > 0 ? note.join(' · ') : null,
            good: false,
            traitInfo: needs,
            wearer: piece.equippedBy === character.cid ? null : piece.equippedItem,
            blocked: needs && needs.key !== heroTrait ? `Only ${trait(needs)} heroes can wear this` : null,
          };
        });
    }
    // What the hero can wear first, the best of it on top.
    return list
      .filter((choice) => choice.dbid !== current?.dbid)
      .sort(
        (left, right) =>
          Number(left.blocked !== null) - Number(right.blocked !== null) ||
          Number(right.good) - Number(left.good) ||
          right.stars - left.stars ||
          right.rank - left.rank ||
          itemName(left.item, language).localeCompare(itemName(right.item, language)),
      );
  }, [slot, current, character, characters, equipment, karma, mounts, gameUi, language]);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? choices.filter(
        (choice) =>
          choice.item.nameEn.toLowerCase().includes(needle) || choice.item.nameFr.toLowerCase().includes(needle),
      )
    : choices;
  const hero = itemName(character.item, language);
  const label = slot ? slotLabel(slot) : '';
  const kind = slot === 'karma' ? 'karma' : slot === 'vehicle' ? 'familiar' : 'piece';

  const pick = async (dbid: string) => {
    if (!slot) return;
    if (slot === 'karma') await equipKarma(character.cid, dbid);
    else if (slot === 'vehicle') await equipMount(character.cid, dbid);
    else await equipGear(character.cid, slot, dbid);
    onClose();
  };

  return (
    <Dialog open={slot !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {hero} · {label}
          </DialogTitle>
          <DialogDescription>
            {slot === 'karma'
              ? `Choosing karma another hero holds moves it to ${hero}. A karma's trait effect applies only to a hero of the same trait.`
              : `Choosing a ${kind} another hero has moves it to ${hero}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
          {current ? (
            <>
              <ItemIcon item={current.item} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">Equipped now</span>
                <span className="block truncate text-sm font-medium">{itemName(current.item, language)}</span>
              </span>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void pick('0')}>
                Unequip
              </Button>
            </>
          ) : (
            <span className="py-2.5 text-sm text-muted-foreground">Nothing in this slot.</span>
          )}
        </div>
        {choices.length > 8 && <SearchField value={query} onChange={setQuery} placeholder={`Find a ${kind}`} />}
        {loaded !== slot && choices.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner />
          </div>
        ) : visible.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {needle
              ? 'Nothing matches that search.'
              : kind === 'piece'
                ? 'This save has no other piece for this slot.'
                : `This save has no other ${kind}.`}
          </p>
        ) : (
          <div className="scroll-thin max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
            {visible.map((choice) => (
              <button
                key={choice.dbid}
                type="button"
                disabled={busy || choice.blocked !== null}
                onClick={() => void pick(choice.dbid)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <ItemIcon item={choice.item} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{itemName(choice.item, language)}</span>
                    {choice.traitInfo && <TraitEmblem info={choice.traitInfo} size={16} language={language} />}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {choice.stars > 0 && <GradeStars count={choice.stars} size={12} />}
                    {choice.level && <span className="tabular-nums">{choice.level}</span>}
                    {choice.note && (
                      <span className={cn(choice.good && 'text-emerald-600 dark:text-emerald-400')}>{choice.note}</span>
                    )}
                  </span>
                  {choice.blocked && <span className="block text-xs text-destructive">{choice.blocked}</span>}
                </span>
                {choice.wearer && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand/10 py-px pr-1.5 pl-px text-xs text-brand">
                    <ItemIcon item={choice.wearer} size={16} className="rounded-full" />
                    {uiText(gameUi, 'equippedBy', language, itemName(choice.wearer, language))}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
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
