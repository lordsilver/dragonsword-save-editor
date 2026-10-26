import { CheckCheck, Gift } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ItemIcon } from '@/components/item-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { QuestRewards, RewardGrant } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Quests in progress, which the editor can complete the way the game does,
 * and the rewards of completed quests, for saves another tool edited forward
 * without handing them out.
 */
export function QuestsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Quests</DialogTitle>
          <DialogDescription>
            Rewards come from the game's own quest table. Nothing is written to the file until you save.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <Tabs defaultValue="progress">
            <TabsList>
              <TabsTrigger value="progress">In progress</TabsTrigger>
              <TabsTrigger value="missed">Missed rewards</TabsTrigger>
            </TabsList>
            <TabsContent value="progress">
              <InProgress />
            </TabsContent>
            <TabsContent value="missed">
              <MissedRewards onClose={() => onOpenChange(false)} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InProgress() {
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const loadQuests = useApp((state) => state.questsInProgress);
  const completeQuest = useApp((state) => state.completeQuest);
  const [quests, setQuests] = useState<QuestRewards[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (quests === null && !loading) {
    setLoading(true);
    void loadQuests().then((list) => {
      setQuests(list);
      setLoading(false);
    });
  }

  async function complete(questId: number): Promise<void> {
    const completion = await completeQuest(questId);
    if (completion) setQuests(await loadQuests());
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Completing a quest records it as done, hands out its gold, items, dishes and heroes, adds its Mercenary Corps
        EXP, promotes the corps for a promotion exam, and starts the quests that were waiting for it, the way the game
        does. Corps level rewards stay to be claimed in game. Story events such as cutscenes are skipped.
      </p>
      {quests === null ? (
        <Loading />
      ) : quests.length === 0 ? (
        <Empty>No quest is in progress in this save.</Empty>
      ) : (
        <QuestList>
          {quests.map((quest) => (
            <div key={quest.questId} className="flex items-start gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <QuestTitle quest={quest} language={language} />
                <RewardChips quest={quest} language={language} withCorpsExp />
                {quest.blocked && <p className="text-[11px] text-amber-600 dark:text-amber-400">{quest.blocked}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending !== null || quest.blocked !== null}
                onClick={() => void complete(quest.questId)}
              >
                <CheckCheck />
                Complete
              </Button>
            </div>
          ))}
        </QuestList>
      )}
    </div>
  );
}

function MissedRewards({ onClose }: { onClose: () => void }) {
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const loadRewards = useApp((state) => state.questRewards);
  const grantRewards = useApp((state) => state.grantQuestRewards);
  const [rewards, setRewards] = useState<QuestRewards[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<RewardGrant | null>(null);

  if (rewards === null && !loading) {
    setLoading(true);
    void loadRewards().then((list) => {
      setRewards(list);
      setLoading(false);
    });
  }

  const picked = (rewards ?? []).filter((reward) => chosen.has(reward.questId));
  const gold = picked.reduce((sum, reward) => sum + reward.gold, 0);
  const grantable = picked.flatMap((reward) => reward.items.filter((entry) => entry.route !== 'none'));

  function toggle(questId: number, on: boolean): void {
    const next = new Set(chosen);
    if (on) next.add(questId);
    else next.delete(questId);
    setChosen(next);
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        For quests another tool marked complete without handing out their rewards. Tick the ones you missed. The editor
        cannot tell which rewards the game already gave, so granting a quest twice adds its rewards twice. Corps EXP is
        not granted here.
      </p>
      {rewards === null ? (
        <Loading />
      ) : rewards.length === 0 ? (
        <Empty>No completed quest in this save lists a reward.</Empty>
      ) : (
        <QuestList>
          {rewards.map((reward) => (
            <div key={reward.questId} className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/40">
              <Checkbox
                id={`quest-${reward.questId}`}
                className="mt-0.5"
                checked={chosen.has(reward.questId)}
                onCheckedChange={(checked) => toggle(reward.questId, checked === true)}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <QuestTitle quest={reward} language={language} htmlFor={`quest-${reward.questId}`} />
                <RewardChips quest={reward} language={language} />
              </div>
            </div>
          ))}
        </QuestList>
      )}

      {result && result.notGranted.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Not granted:{' '}
          {result.notGranted.map((entry) => `${itemName(entry.item, language)} ×${entry.count}`).join(', ')}.
        </p>
      )}

      <DialogFooter className="items-center sm:justify-between">
        <span className="text-[11px] text-muted-foreground">
          {picked.length} quest{picked.length === 1 ? '' : 's'} · {formatNumber(gold)} gold · {grantable.length} item
          {grantable.length === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={pending !== null || picked.length === 0}
            onClick={async () => {
              const grant = await grantRewards(picked.map((reward) => reward.questId));
              if (grant) {
                setResult(grant);
                setChosen(new Set());
              }
            }}
          >
            {pending !== null ? <Spinner /> : <Gift />}
            Grant rewards
          </Button>
        </div>
      </DialogFooter>
    </div>
  );
}

function QuestTitle({ quest, language, htmlFor }: { quest: QuestRewards; language: string; htmlFor?: string }) {
  const name = language === 'fr' ? quest.nameFr : quest.nameEn;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="cursor-pointer text-sm font-medium">
          {name}
        </label>
      ) : (
        <span className="text-sm font-medium">{name}</span>
      )}
      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
        {quest.category.toLowerCase().replace('_', ' ')}
      </Badge>
    </div>
  );
}

function RewardChips({
  quest,
  language,
  withCorpsExp,
}: {
  quest: QuestRewards;
  language: string;
  withCorpsExp?: boolean;
}) {
  if (quest.gold === 0 && quest.advExp === 0 && quest.items.length === 0) {
    return <span className="text-[11px] text-muted-foreground">No reward.</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {quest.gold > 0 && <Chip label={`${formatNumber(quest.gold)} gold`} />}
      {quest.items.map((entry) => (
        <Chip
          key={entry.item.cid}
          label={`${itemName(entry.item, language)} ×${formatNumber(entry.count)}`}
          icon={<ItemIcon item={entry.item} size={18} />}
          muted={entry.route === 'none'}
          title={
            entry.route === 'none' ? 'Not granted: equipment needs rows the editor does not create yet.' : undefined
          }
        />
      ))}
      {quest.advExp > 0 && (
        <Chip
          label={`${formatNumber(quest.advExp)} corps EXP`}
          muted={!withCorpsExp}
          title={withCorpsExp ? undefined : 'Granted only when the editor completes the quest.'}
        />
      )}
    </div>
  );
}

function Chip({ label, icon, muted, title }: { label: string; icon?: ReactNode; muted?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border bg-background/60 px-1.5 py-0.5 text-[11px]',
        muted && 'border-dashed text-muted-foreground line-through decoration-muted-foreground/40',
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function QuestList({ children }: { children: ReactNode }) {
  return <div className="scroll-thin max-h-[48vh] divide-y overflow-y-auto rounded-lg border">{children}</div>;
}

function Loading() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Spinner />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
