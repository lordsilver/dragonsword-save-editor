import { Gift } from 'lucide-react';
import { useState } from 'react';
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
import { formatNumber, itemName, useApp } from '@/lib/store';
import type { QuestRewards, RewardGrant } from '@/lib/types';
import { cn } from '@/lib/utils';

const ROUTE_NOTE: Record<string, string> = {
  none: 'Not granted: equipment, dishes and heroes need rows the editor does not create.',
};

/**
 * Lists the rewards of the quests the save records as complete and grants
 * the chosen ones. A save edited forward by another tool marks quests done
 * without handing out what they give; the game's quest table says what that
 * was.
 */
export function QuestRewardsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const loadRewards = useApp((state) => state.questRewards);
  const grantRewards = useApp((state) => state.grantQuestRewards);
  const [rewards, setRewards] = useState<QuestRewards[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<RewardGrant | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRewards(null);
      setResult(null);
      void loadRewards().then((list) => {
        setRewards(list);
        setChosen(new Set(list.map((reward) => reward.questId)));
      });
    }
  }

  const picked = (rewards ?? []).filter((reward) => chosen.has(reward.questId));
  const gold = picked.reduce((sum, reward) => sum + reward.gold, 0);
  const grantable = picked.flatMap((reward) => reward.items.filter((entry) => entry.route !== 'none'));
  const busy = pending !== null;

  function toggle(questId: number, on: boolean): void {
    const next = new Set(chosen);
    if (on) next.add(questId);
    else next.delete(questId);
    setChosen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Quest rewards</DialogTitle>
          <DialogDescription>
            What each completed quest hands out, from the game's own quest table. Use this when a quest was marked
            complete by an editor and its rewards never arrived. The editor cannot tell which rewards the game already
            gave, so granting a quest twice adds its rewards twice.
          </DialogDescription>
        </DialogHeader>

        {rewards === null ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner />
          </div>
        ) : rewards.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No completed quest in this save lists a reward.
          </p>
        ) : (
          <div className="scroll-thin max-h-[52vh] divide-y overflow-y-auto rounded-lg border">
            {rewards.map((reward) => (
              <div key={reward.questId} className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/40">
                <Checkbox
                  id={`quest-${reward.questId}`}
                  className="mt-0.5"
                  checked={chosen.has(reward.questId)}
                  onCheckedChange={(checked) => toggle(reward.questId, checked === true)}
                  aria-label={`Grant ${reward.nameEn}`}
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`quest-${reward.questId}`} className="cursor-pointer text-sm font-medium">
                      {language === 'fr' ? reward.nameFr : reward.nameEn}
                    </label>
                    <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                      {reward.category.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {reward.gold > 0 && <Chip label={`${formatNumber(reward.gold)} gold`} />}
                    {reward.items.map((entry) => (
                      <Chip
                        key={entry.item.cid}
                        label={`${itemName(entry.item, language)} ×${formatNumber(entry.count)}`}
                        icon={<ItemIcon item={entry.item} size={18} />}
                        muted={entry.route === 'none'}
                        title={ROUTE_NOTE[entry.route]}
                      />
                    ))}
                    {reward.advExp > 0 && (
                      <Chip
                        label={`${formatNumber(reward.advExp)} corps EXP`}
                        muted
                        title="Not granted: corps EXP would move the corps level without the level's own rewards."
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {result && (result.notGranted.length > 0 || result.advExpNotGranted > 0) && (
          <p className="text-[11px] text-muted-foreground">
            Not granted:{' '}
            {[
              ...result.notGranted.map((entry) => `${itemName(entry.item, language)} ×${entry.count}`),
              ...(result.advExpNotGranted > 0 ? [`${formatNumber(result.advExpNotGranted)} corps EXP`] : []),
            ].join(', ')}
            .
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {picked.length} quest{picked.length === 1 ? '' : 's'} · {formatNumber(gold)} gold · {grantable.length} item
            {grantable.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              disabled={busy || picked.length === 0 || result !== null}
              onClick={async () => {
                const grant = await grantRewards(picked.map((reward) => reward.questId));
                if (grant) setResult(grant);
              }}
            >
              {busy ? <Spinner /> : <Gift />}
              {result ? 'Granted' : 'Grant rewards'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chip({
  label,
  icon,
  muted,
  title,
}: {
  label: string;
  icon?: React.ReactNode;
  muted?: boolean;
  title?: string;
}) {
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
