import { BadgeCheck, Heart, Plus, Search, Sparkles, Swords, Trash2, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { NumberField } from '@/components/fields';
import { ItemIcon, gradeTone } from '@/components/item-icon';
import { PageHeader, Panel } from '@/components/page';
import { NativeSelect } from '@/components/select';
import { CountPill, FieldRow, StatTile } from '@/components/summary';
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
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { Character, Loadout, TeamPage } from '@/lib/types';
import { cn } from '@/lib/utils';

const MAX_LEVEL = 999;
const MAX_EXP = 999_999_999;
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
  const catalog = useApp((state) => state.characterCatalog);
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
  const unlockAllCharacters = useApp((state) => state.unlockAllCharacters);
  const [query, setQuery] = useState('');
  const [recruitOpen, setRecruitOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);

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

  const highest = characters.reduce((level, character) => Math.max(level, character.level), 0);
  const missing = catalog.filter((entry) => !entry.owned).length;

  if (!save) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${save.accountId} · Slot ${save.slot}`}
        title="Characters"
        description="The roster, each character's growth values, their skills, saved teams, and the gear they currently wear."
        actions={
          <>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setRecruitOpen(true)}>
              <UserPlus />
              Recruit character
            </Button>
            <ConfirmButton
              title="Recruit every character?"
              description="Adds every catalog character the save does not already own. New rows use the game's initial level, EXP, ascend and transcend values."
              confirmLabel="Recruit all"
              variant="outline"
              size="sm"
              disabled={busy || missing === 0}
              onConfirm={() => void unlockAllCharacters()}
            >
              <Users />
              Recruit all
            </ConfirmButton>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Users />}
          label="Owned"
          value={formatNumber(characters.length)}
          detail={`of ${catalog.length} catalog characters`}
        />
        <StatTile icon={<UserPlus />} label="Missing" value={formatNumber(missing)} detail="Can be recruited here" />
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
                          {skill.typeValue >= 800 ? 'Special skill' : 'Skill slot'} {skill.typeValue}
                        </div>
                        <div className="text-[10px] text-muted-foreground">TYPE_VALUE {skill.typeValue}</div>
                      </div>
                      <NumberField
                        value={skill.level}
                        onCommit={(level) => void setSkillLevel(skill.typeValue, level)}
                        max={99}
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

            <Panel title="Saved teams" description="Each page has three slots. Setting a slot to Empty clears it.">
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
            description="Pick someone from the roster, or recruit a character to get started."
            action={
              <Button size="sm" onClick={() => setRecruitOpen(true)}>
                <UserPlus />
                Recruit character
              </Button>
            }
          />
        )}
      </div>

      <RecruitDialog
        open={recruitOpen}
        onOpenChange={setRecruitOpen}
        catalog={catalog}
        language={language}
        busy={busy}
      />
      <SkillDialog
        open={skillOpen}
        onOpenChange={setSkillOpen}
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
        </div>
        <ConfirmButton
          title={`Remove ${itemName(character.item, language)}?`}
          description="Deletes the character row, their skills, their team placements and their equipment links. This cannot be undone except by discarding changes."
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
          max={MAX_LEVEL}
          disabled={busy}
          onChange={(value) => onChange('level', value)}
        />
        <EditField
          label="EXP"
          value={character.exp}
          max={MAX_EXP}
          disabled={busy}
          onChange={(value) => onChange('exp', value)}
        />
        <EditField
          label="Ascend"
          value={character.ascend}
          max={99}
          disabled={busy}
          onChange={(value) => onChange('ascend', value)}
        />
        <EditField
          label="Transcend"
          value={character.transcend}
          max={99}
          disabled={busy}
          onChange={(value) => onChange('transcend', value)}
        />
        <EditField
          label="Transcend total"
          value={character.transcendTotal}
          max={99}
          disabled={busy}
          onChange={(value) => onChange('transcendTotal', value)}
        />
        <EditField
          label="HP"
          value={character.hp}
          max={MAX_EXP}
          disabled={busy}
          onChange={(value) => onChange('hp', value)}
        />
        <EditField
          label="Soldier grade"
          value={character.soldierGrade}
          max={99}
          disabled={busy}
          onChange={(value) => onChange('soldierGrade', value)}
        />
        <EditField
          label="Soldier grade points"
          value={character.soldierGradePoint}
          max={MAX_EXP}
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
    <FieldRow label={label} hint={`max ${formatNumber(max)}`}>
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
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium">Page {team.pageId}</span>
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

function RecruitDialog({
  open,
  onOpenChange,
  catalog,
  language,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Array<{ item: Character['item']; owned: boolean }>;
  language: string;
  busy: boolean;
}) {
  const addCharacter = useApp((state) => state.addCharacter);
  const [query, setQuery] = useState('');
  const [showOwned, setShowOwned] = useState(false);
  const needle = query.trim().toLowerCase();
  const results = catalog.filter((entry) => {
    if (!showOwned && entry.owned) return false;
    if (!needle) return true;
    return (
      entry.item.nameEn.toLowerCase().includes(needle) ||
      entry.item.nameFr.toLowerCase().includes(needle) ||
      entry.item.cid.toString().includes(needle)
    );
  });
  const missing = catalog.filter((entry) => !entry.owned).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recruit a character</DialogTitle>
          <DialogDescription>
            {missing === 0
              ? 'Every catalog character is already in this save.'
              : `${missing} catalog characters are missing. New rows start from tb_init_character.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the character catalog"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showOwned}
                onChange={(event) => setShowOwned(event.target.checked)}
                className="size-3.5 accent-[var(--brand)]"
              />
              Show owned
            </label>
          </div>
          <div className="scroll-thin max-h-80 overflow-y-auto rounded-lg border">
            {results.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                {missing === 0 && !showOwned
                  ? 'Every character is owned. Turn on "Show owned" to browse the catalog.'
                  : 'No character matches that search.'}
              </p>
            ) : (
              <div className="divide-y">
                {results.map((entry) => (
                  <div key={entry.item.cid} className="flex items-center gap-3 px-3 py-2">
                    <ItemIcon item={entry.item} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{itemName(entry.item, language)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        CID {entry.item.cid} · {entry.item.grade || entry.item.category}
                      </div>
                    </div>
                    {entry.owned ? (
                      <Badge variant="outline" className="text-[10px]">
                        Owned
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void addCharacter(entry.item.cid)}
                      >
                        <Plus />
                        Recruit
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SkillDialog({
  open,
  onOpenChange,
  busy,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onAdd: (typeValue: number, level: number) => void;
}) {
  const [typeValue, setTypeValue] = useState('0');
  const [level, setLevel] = useState('1');
  const parsedType = Number(typeValue) || 0;
  const parsedLevel = Number(level) || 0;
  const validType = (parsedType >= 0 && parsedType <= 99) || (parsedType >= 800 && parsedType <= 899);
  const valid = validType && parsedLevel >= 0 && parsedLevel <= 99;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a skill row</DialogTitle>
          <DialogDescription>
            TYPE_VALUE identifies the skill slot. Regular slots use 0–99; special skills use 800–899.
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
            <p className="text-[10px] text-muted-foreground">0–99 or 800–899</p>
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
            <p className="text-[10px] text-muted-foreground">0–99</p>
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
