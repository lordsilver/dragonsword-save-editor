import { BadgeCheck, Heart, PackagePlus, Plus, Search, Sparkles, Swords, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { NumberField } from '@/components/fields';
import { ItemIcon, gradeTone } from '@/components/item-icon';
import { PageHeader, Panel } from '@/components/page';
import { NativeSelect } from '@/components/select';
import { CountPill, FieldRow, InfoNote, StatTile } from '@/components/summary';
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
import {
  FATES_INVITATION_CID,
  MAX_CHARACTER_HP,
  MAX_POINTS,
  MAX_SOLDIER_GRADE,
  MAX_TRANSCEND_TOTAL,
  SKILL_TYPES,
  breakthroughSummary,
  skillLimit,
} from '@/lib/limits';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { Character, GrowthLimits, Loadout, TeamPage } from '@/lib/types';
import { cn } from '@/lib/utils';

const SLOT_LABELS: Array<[keyof Omit<Loadout, 'characterCid'>, string]> = [
  ['head', 'Head'],
  ['chest', 'Chest'],
  ['leg', 'Legs'],
  ['hand', 'Hands'],
  ['foot', 'Feet'],
  ['karma', 'Karma'],
  ['vehicle', 'Mount'],
];

export function CharactersScreen() {
  const characters = useApp((state) => state.characters);
  const selectedCharacter = useApp((state) => state.selectedCharacter);
  const skills = useApp((state) => state.skills);
  const teams = useApp((state) => state.teams);
  const loadout = useApp((state) => state.loadout);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const selectCharacter = useApp((state) => state.selectCharacter);
  const setCharacter = useApp((state) => state.setCharacter);
  const removeCharacter = useApp((state) => state.removeCharacter);
  const setSection = useApp((state) => state.setSection);
  const [query, setQuery] = useState('');
  const [skillOpen, setSkillOpen] = useState(false);

  const selected = characters.find((character) => character.cid === selectedCharacter) ?? null;
  const busy = pending !== null;
  // Each hero's caps come from its own breakthrough stage.
  const limits = selected?.limits ?? null;

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

  const highest = characters.reduce((level, character) => Math.max(level, character.level), 0);

  if (!save) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${save.accountId} · Slot ${save.slot}`}
        title="Characters"
        description="Each hero's growth caps follow its own breakthrough; the Mercenary Corps grade only unlocks breakthroughs. Existing values above a cap stay editable. Recruit shop characters through the game after adding Fate's Invitation."
        actions={
          <Button variant="outline" size="sm" onClick={() => setSection('inventory')}>
            <PackagePlus />
            Open inventory
          </Button>
        }
      />

      <InfoNote>
        <span className="font-medium text-foreground">Recruit through the game's shop.</span> Add Fate's Invitation (CID{' '}
        {formatNumber(FATES_INVITATION_CID)}) on the Inventory screen, then buy the character in game. The game writes
        the level-1 character row and purchase record itself. This covers the 11 shop characters; story characters still
        arrive by playing.
      </InfoNote>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile icon={<Users />} label="Owned" value={formatNumber(characters.length)} detail="In this save" />
        <StatTile
          icon={<BadgeCheck />}
          label="Highest level"
          value={formatNumber(highest)}
          detail="Across the roster"
        />
        <StatTile
          icon={<Sparkles />}
          label="Skill rows"
          value={formatNumber(skills.length)}
          detail={selected ? itemName(selected.item, language) : 'No character selected'}
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Panel
          title="Roster"
          actions={<Badge variant="outline">{formatNumber(roster.length)}</Badge>}
          contentClassName="p-0"
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a character"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="scroll-thin max-h-[36rem] overflow-y-auto p-1.5">
            {roster.map((character) => {
              const active = character.cid === selectedCharacter;
              return (
                <button
                  key={character.cid}
                  type="button"
                  onClick={() => void selectCharacter(character.cid)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                    active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  <ItemIcon item={character.item} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{itemName(character.item, language)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Lv {character.level} · CID {character.cid}
                    </div>
                  </div>
                  {character.transcend > 0 && <CountPill tone="brand">T{character.transcend}</CountPill>}
                </button>
              );
            })}
            {roster.length === 0 && (
              <p className="p-6 text-center text-xs text-muted-foreground">No character matches that search.</p>
            )}
          </div>
        </Panel>

        {selected ? (
          <div className="space-y-5">
            <CharacterHero
              character={selected}
              language={language}
              busy={busy}
              onRemove={() => void removeCharacter(selected.cid)}
              onChange={(field, value) => void setCharacter(selected.cid, field, value)}
            />

            <Panel
              title="Skills"
              description="Rows live in tb_skill_growth. Levels are per skill, not per character level."
              actions={
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setSkillOpen(true)}>
                  <Plus />
                  Add skill
                </Button>
              }
              contentClassName="p-0"
            >
              {skills.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  This character has no skill rows yet. Add one to create a row.
                </p>
              ) : (
                <div className="divide-y">
                  {skills.map((skill) => (
                    <div key={skill.typeValue} className="flex items-center gap-3 px-4 py-2">
                      <div className="flex size-8 items-center justify-center rounded-md border bg-muted/40">
                        <Swords className="size-3.5 text-brand" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium">
                          {skill.typeValue >= 800
                            ? 'Special skill'
                            : skill.typeValue >= 5
                              ? 'Basic skill'
                              : 'Active skill'}{' '}
                          {skill.typeValue}
                        </div>
                        <div className="text-[10px] text-muted-foreground">TYPE_VALUE {skill.typeValue}</div>
                      </div>
                      <NumberField
                        value={skill.level}
                        onCommit={(level) => void setSkillLevel(skill.typeValue, level)}
                        max={skillLimit(selected.limits, skill.typeValue)}
                        disabled={busy}
                        className="w-24"
                        ariaLabel={`Skill ${skill.typeValue} level`}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Remove this skill row"
                        disabled={busy}
                        onClick={() => void removeSkillRow(skill.typeValue)}
                      >
                        <Trash2 />
                        <span className="sr-only">Remove skill</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Saved teams"
              description="Each page has three slots. Empty slots must stay at the end, and the active team's selected slot cannot be emptied."
            >
              <div className="grid gap-3 lg:grid-cols-3">
                {teams.map((team) => (
                  <TeamCard key={team.pageId} team={team} characters={characters} language={language} busy={busy} />
                ))}
                {teams.length === 0 && <p className="text-xs text-muted-foreground">This save has no team pages.</p>}
              </div>
            </Panel>

            <Panel
              title="Current loadout"
              description="Read from tb_equip_mount. Change gear on the Equipment screen and karma on the Karma screen."
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                {SLOT_LABELS.map(([slot, label]) => {
                  const entry = loadout?.[slot] ?? null;
                  return (
                    <div key={slot} className="rounded-lg border bg-background/30 p-2">
                      <div className="mb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                        {label}
                      </div>
                      {entry ? (
                        <div className="flex items-center gap-2">
                          <ItemIcon item={entry.item} size={30} />
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-medium">{itemName(entry.item, language)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {slot === 'karma' ? `Ascend ${entry.enchantLevel}` : `+${entry.enchantLevel}`}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-8 items-center text-[11px] text-muted-foreground/70">Empty</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        ) : (
          <EmptyPanel
            icon={<Users />}
            title="No character selected"
            description="Pick someone from the roster to edit their stats, skills and team slots."
          />
        )}
      </div>

      <SkillDialog
        open={skillOpen}
        onOpenChange={setSkillOpen}
        limits={limits}
        busy={busy}
        onAdd={(typeValue, level) => {
          if (selected) void setSkillLevel(typeValue, level);
          setSkillOpen(false);
        }}
      />
    </div>
  );

  async function setSkillLevel(typeValue: number, level: number): Promise<void> {
    if (!selected) return;
    await useApp.getState().setSkill(selected.cid, typeValue, level);
  }

  async function removeSkillRow(typeValue: number): Promise<void> {
    if (!selected) return;
    await useApp.getState().removeSkill(selected.cid, typeValue);
  }
}

function CharacterHero({
  character,
  language,
  busy,
  onChange,
  onRemove,
}: {
  character: Character;
  language: string;
  busy: boolean;
  onChange: (field: string, value: number) => void;
  onRemove: () => void;
}) {
  const limits = character.limits;
  return (
    <section className="overflow-hidden rounded-xl border bg-card/70 shadow-xs">
      <div className="flex flex-wrap items-start gap-4 border-b bg-gradient-to-br from-brand/10 via-transparent to-transparent p-4">
        <ItemIcon item={character.item} size={76} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-xl font-semibold tracking-tight">{itemName(character.item, language)}</h2>
            {character.item.grade && (
              <span className={cn('rounded border px-1.5 py-0.5 text-[10px]', gradeTone(character.item.grade))}>
                {character.item.grade}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">CID {character.cid}</span>
            <span>·</span>
            <span>{character.item.category}</span>
            <span>·</span>
            <span>Created {formatCreated(character.createdAt)}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {breakthroughSummary(character.limits, character.ascend)}
          </div>
        </div>
        <ConfirmButton
          title={`Remove ${itemName(character.item, language)}?`}
          description="Deletes the character row, their skills, their team placements and their equipment links. A character in the active team must be moved off it first; other team pages compact forward. Before saving, Discard changes undoes this along with every other unsaved edit."
          confirmLabel="Remove character"
          variant="destructive"
          size="sm"
          disabled={busy}
          onConfirm={onRemove}
        >
          <Trash2 />
          Remove
        </ConfirmButton>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <EditField
          label="Level"
          value={character.level}
          max={limits.level}
          disabled={busy}
          onChange={(value) => onChange('level', value)}
        />
        <EditField
          label="EXP"
          value={character.exp}
          max={limits.exp}
          disabled={busy}
          onChange={(value) => onChange('exp', value)}
        />
        <EditField
          label="Ascend"
          value={character.ascend}
          max={limits.ascend}
          disabled={busy}
          onChange={(value) => onChange('ascend', value)}
        />
        <EditField
          label="Transcend"
          value={character.transcend}
          max={limits.transcend}
          disabled={busy}
          onChange={(value) => onChange('transcend', value)}
        />
        <EditField
          label="Transcend total"
          value={character.transcendTotal}
          max={MAX_TRANSCEND_TOTAL}
          disabled={busy}
          onChange={(value) => onChange('transcendTotal', value)}
        />
        <EditField
          label="HP"
          value={character.hp}
          max={MAX_CHARACTER_HP}
          disabled={busy}
          onChange={(value) => onChange('hp', value)}
        />
        <EditField
          label="Soldier grade"
          value={character.soldierGrade}
          max={MAX_SOLDIER_GRADE}
          disabled={busy}
          onChange={(value) => onChange('soldierGrade', value)}
        />
        <EditField
          label="Soldier grade points"
          value={character.soldierGradePoint}
          max={MAX_POINTS}
          disabled={busy}
          onChange={(value) => onChange('soldierGradePoint', value)}
        />
      </div>
      <div className="flex items-center gap-2 border-t px-4 py-2 text-[10px] text-muted-foreground">
        <Heart className="size-3 text-brand" />
        Values are committed on Enter or when the field loses focus.
      </div>
    </section>
  );
}

function EditField({
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <FieldRow label={label} hint={`max ${formatNumber(Math.max(max, value))}`}>
      <NumberField value={value} onCommit={onChange} max={max} disabled={disabled} className="w-full text-left" />
    </FieldRow>
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
            <Badge variant="outline" className="border-brand/50 text-[10px] text-brand">
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
                  <span className="text-[10px] text-muted-foreground">{slotNumber}</span>
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
            <p className="text-[10px] text-muted-foreground">1–7 or 801</p>
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
            <p className="text-[10px] text-muted-foreground">0–{maxLevel} for this hero's breakthrough and slot</p>
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

function formatCreated(seconds: number): string {
  if (!seconds) return 'unknown';
  return new Date(seconds * 1000).toLocaleDateString();
}
