import {
  Clock3,
  Coins,
  Crown,
  Flame,
  Gem,
  MapPin,
  Pencil,
  Shield,
  Sparkles,
  Sword,
  Trophy,
  Users,
  Utensils,
  Wand2,
  Zap,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ConfirmButton } from '@/components/common';
import { NumberField } from '@/components/fields';
import { ItemIcon } from '@/components/item-icon';
import { KeyValue, PageHeader, Panel } from '@/components/page';
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
import { MAX_ADV_EXP, MAX_ADV_GRADE, MAX_ADV_LEVEL, MAX_CURRENCY, MAX_PLAY_TIME, MAX_STACK } from '@/lib/limits';
import { formatNumber, itemName, useApp } from '@/lib/store';

export function OverviewScreen() {
  const overview = useApp((state) => state.overview);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const setPlayerName = useApp((state) => state.setPlayerName);
  const setAdventureBatch = useApp((state) => state.setAdventureBatch);
  const setCurrency = useApp((state) => state.setCurrency);
  const unlockAllTitles = useApp((state) => state.unlockAllTitles);
  const unlockAllRecipes = useApp((state) => state.unlockAllRecipes);
  const fillStacks = useApp((state) => state.fillStacks);
  const [renameOpen, setRenameOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);

  if (!overview || !save) {
    return <div className="h-40 animate-pulse rounded-xl border bg-card/40" />;
  }

  const counts = overview.counts;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${overview.accountId} · Slot ${save.slot}`}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Welcome back, {overview.playerName || 'adventurer'}
            <Button variant="ghost" size="icon-sm" title="Rename player" onClick={() => setRenameOpen(true)}>
              <Pencil />
              <span className="sr-only">Rename player</span>
            </Button>
          </span>
        }
        description="A snapshot of the account, its collection, and the save file itself."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setRankOpen(true)}>
              <Sparkles />
              Edit adventure rank
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFillOpen(true)}>
              <Wand2 />
              Fill every stack
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<Trophy />}
          label="Adventure"
          value={`Grade ${overview.adventureGrade} · Lv ${overview.adventureLevel}`}
          detail={`${formatNumber(overview.adventureExp)} EXP`}
        />
        <Metric
          icon={<Clock3 />}
          label="Play time"
          value={formatPlayTime(overview.playTime)}
          detail={`Last login ${overview.lastLogin}`}
        />
        <Metric
          icon={<Zap />}
          label="Stamina"
          value={`${formatNumber(overview.stamina)} / ${formatNumber(overview.maxStamina)}`}
          detail="Current and maximum"
        />
        <Metric
          icon={<MapPin />}
          label="Location"
          value={`Region ${overview.regionCid}`}
          detail={`Section ${overview.sectionUid} · ${overview.position.join(', ')}`}
        />
      </div>

      <Panel
        title="Currencies"
        description="Amounts are written straight to tb_currency."
        actions={
          <Badge variant="outline" className="font-mono">
            {counts.currencies} rows
          </Badge>
        }
        contentClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {overview.currencies.map((currency) => (
          <CurrencyCard
            key={currency.item.cid}
            cid={currency.item.cid}
            name={itemName(currency.item, language)}
            icon={currency.item}
            amount={currency.amount}
            busy={pending !== null}
            onCommit={(amount) => void setCurrency(currency.item.cid, amount)}
          />
        ))}
        {overview.currencies.length === 0 && (
          <p className="text-sm text-muted-foreground">This save has no currency rows.</p>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Collection progress" description="Counts come from the save, not from the catalog.">
          <div className="space-y-4">
            <ProgressRow label="Characters" icon={<Users />} value={counts.characters} />
            <ProgressRow label="Titles" icon={<Crown />} value={counts.titlesUnlocked} total={counts.titlesTotal} />
            <ProgressRow
              label="Cooking recipes"
              icon={<Utensils />}
              value={counts.recipesKnown}
              total={counts.recipesTotal}
            />
            <ProgressRow label="Completed quests" icon={<Shield />} value={counts.questsCompleted} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SmallCount icon={<Sword />} label="Equipment" value={counts.equipment} />
            <SmallCount icon={<Gem />} label="Gems" value={counts.gems} />
            <SmallCount icon={<Flame />} label="Karma" value={counts.karma} />
            <SmallCount icon={<Coins />} label="Stackables" value={counts.stackables} />
            <SmallCount icon={<Shield />} label="Costumes" value={counts.costumes} />
            <SmallCount icon={<Zap />} label="Mounts" value={counts.mounts} />
          </div>
        </Panel>

        <Panel
          title="Quick actions"
          description="Bulk edits. Each one only changes this save; nothing is written until you save."
        >
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled
              title="Recruiting is turned off in this build: the catalog's character list includes items and skins that the game cannot load."
            >
              <Users />
              Recruit every character
            </Button>
            <ConfirmButton
              title="Unlock every title?"
              description="Sets every title bit while preserving the favorite-title mask."
              confirmLabel="Unlock all"
              disabled={counts.titlesUnlocked >= counts.titlesTotal}
              onConfirm={() => void unlockAllTitles()}
              variant="outline"
              className="w-full justify-start"
            >
              <Crown />
              Unlock every title
            </ConfirmButton>
            <ConfirmButton
              title="Learn every recipe?"
              description="Sets every cooking recipe bit in tb_switch."
              confirmLabel="Learn all"
              disabled={counts.recipesKnown >= counts.recipesTotal}
              onConfirm={() => void unlockAllRecipes()}
              variant="outline"
              className="w-full justify-start"
            >
              <Utensils />
              Learn every recipe
            </ConfirmButton>
            <Button variant="outline" className="w-full justify-start" onClick={() => setFillOpen(true)}>
              <Wand2 />
              Fill every stack
            </Button>
          </div>
        </Panel>
      </div>

      <Panel title="Save file" description="The encrypted database this editor is working on.">
        <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
          <KeyValue label="Path" value={<span className="break-all">{save.path}</span>} mono />
          <KeyValue label="Account DBID" value={overview.accountId} mono />
          <KeyValue label="Created" value={overview.createdAt} />
          <KeyValue label="Last logout" value={overview.lastLogout} />
          <KeyValue label="Last login" value={overview.lastLogin} />
          <KeyValue label="Adventure EXP" value={formatNumber(overview.adventureExp)} />
          <KeyValue label="Selected title CID" value={overview.titleCid || 'None'} mono />
          <KeyValue label="Region / section" value={`${overview.regionCid} / ${overview.sectionUid}`} mono />
        </div>
      </Panel>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        initial={overview.playerName}
        busy={pending !== null}
        onSave={(name) => {
          void setPlayerName(name);
          setRenameOpen(false);
        }}
      />
      <RankDialog
        open={rankOpen}
        onOpenChange={setRankOpen}
        initial={{
          grade: overview.adventureGrade,
          level: overview.adventureLevel,
          exp: overview.adventureExp,
          playTime: overview.playTime,
        }}
        busy={pending !== null}
        onSave={(patch) => {
          void setAdventureBatch(patch);
          setRankOpen(false);
        }}
      />
      <FillDialog
        open={fillOpen}
        onOpenChange={setFillOpen}
        busy={pending !== null}
        onSave={(count) => {
          void fillStacks(count);
          setFillOpen(false);
        }}
      />
    </div>
  );
}

function Metric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border bg-card/70 p-4 shadow-xs">
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase [&_svg]:size-3.5 [&_svg]:text-brand">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-heading text-lg font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function ProgressRow({ label, icon, value, total }: { label: string; icon: ReactNode; value: number; total?: number }) {
  const percent = total ? Math.min(100, (value / total) * 100) : null;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground [&_svg]:size-3.5 [&_svg]:text-brand">
          {icon}
          {label}
        </span>
        <span className="numeric text-xs">
          {formatNumber(value)}
          {total !== undefined && <span className="text-muted-foreground"> / {formatNumber(total)}</span>}
        </span>
      </div>
      {percent !== null && <Progress value={percent} />}
    </div>
  );
}

function SmallCount({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background/30 px-2.5 py-2">
      <span className="text-brand [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <div className="numeric text-sm font-medium">{formatNumber(value)}</div>
        <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
      </div>
    </div>
  );
}

function CurrencyCard({
  cid,
  name,
  icon,
  amount,
  busy,
  onCommit,
}: {
  cid: number;
  name: string;
  icon: Parameters<typeof ItemIcon>[0]['item'];
  amount: number;
  busy: boolean;
  onCommit: (amount: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background/30 p-3">
      <ItemIcon item={icon} size={42} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="font-mono text-[10px] text-muted-foreground">CID {cid}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <NumberField value={amount} onCommit={onCommit} max={MAX_CURRENCY} disabled={busy} />
        <button
          type="button"
          className="text-[10px] text-brand hover:underline disabled:opacity-50"
          disabled={busy}
          onClick={() => onCommit(MAX_CURRENCY)}
        >
          Set highest seen
        </button>
      </div>
    </div>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  initial,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: string;
  busy: boolean;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName(initial);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename player</DialogTitle>
          <DialogDescription>
            The nickname is stored in tb_advent_status and shown on the save select screen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="player-name">Nickname</Label>
          <Input
            id="player-name"
            value={name}
            maxLength={32}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) onSave(name.trim());
            }}
          />
          <p className="text-[11px] text-muted-foreground">1–32 characters.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim()} onClick={() => onSave(name.trim())}>
            {busy ? <Spinner /> : <Pencil />}
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RankDialog({
  open,
  onOpenChange,
  initial,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: { grade: number; level: number; exp: number; playTime: number };
  busy: boolean;
  onSave: (patch: Record<string, number>) => void;
}) {
  const [grade, setGrade] = useState(initial.grade);
  const [level, setLevel] = useState(initial.level);
  const [exp, setExp] = useState(initial.exp);
  const [playTime, setPlayTime] = useState(initial.playTime);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGrade(initial.grade);
      setLevel(initial.level);
      setExp(initial.exp);
      setPlayTime(initial.playTime);
    }
  }

  const patch: Record<string, number> = {};
  if (grade !== initial.grade) patch.grade = grade;
  if (level !== initial.level) patch.level = level;
  if (exp !== initial.exp) patch.exp = exp;
  if (playTime !== initial.playTime) patch.playTime = playTime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adventure rank</DialogTitle>
          <DialogDescription>
            These values live in tb_advent_status. The game recalculates rank on its own.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Grade" value={grade} onChange={setGrade} max={MAX_ADV_GRADE} />
          <Field label="Level" value={level} onChange={setLevel} max={MAX_ADV_LEVEL} />
          <Field label="EXP" value={exp} onChange={setExp} max={MAX_ADV_EXP} />
          <Field label="Play time (seconds)" value={playTime} onChange={setPlayTime} max={MAX_PLAY_TIME} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || Object.keys(patch).length === 0} onClick={() => onSave(patch)}>
            {busy ? <Spinner /> : <Sparkles />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <NumberField value={value} onCommit={onChange} max={max} className="w-full" />
    </div>
  );
}

function FillDialog({
  open,
  onOpenChange,
  busy,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSave: (count: number) => void;
}) {
  const [count, setCount] = useState(999);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fill every stack</DialogTitle>
          <DialogDescription>
            Sets STACK_CNT on every row of tb_stackable_item. The highest count seen in the reference save is{' '}
            {formatNumber(MAX_STACK)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="stack-count">Count</Label>
          <Input
            id="stack-count"
            value={count}
            inputMode="numeric"
            onChange={(event) => setCount(Number(event.target.value.replaceAll(',', '')) || 0)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || count < 0 || count > MAX_STACK} onClick={() => onSave(count)}>
            {busy ? <Spinner /> : <Wand2 />}
            Fill stacks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatPlayTime(seconds: number): string {
  if (!seconds) return '0 min';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export { formatPlayTime };
