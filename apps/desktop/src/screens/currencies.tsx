import { Coins, Crown, Gem, TrendingUp, Wallet } from 'lucide-react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { NumberField } from '@/components/fields';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader, Panel } from '@/components/page';
import { CountPill, InfoNote, StatTile } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { MAX_CURRENCY } from '@/lib/limits';
import { formatNumber, itemName, useApp } from '@/lib/store';

export function CurrenciesScreen() {
  const currencies = useApp((state) => state.currencies);
  const save = useApp((state) => state.save);
  const language = useApp((state) => state.settings.language);
  const pending = useApp((state) => state.pending);
  const setCurrency = useApp((state) => state.setCurrency);
  const setAllCurrencies = useApp((state) => state.setAllCurrencies);

  if (!save) return null;

  const total = currencies.reduce((sum, currency) => sum + currency.amount, 0);
  const largest = currencies.reduce<(typeof currencies)[number] | null>(
    (best, currency) => (!best || currency.amount > best.amount ? currency : best),
    null,
  );
  const busy = pending !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`Account ${save.accountId} · Slot ${save.slot}`}
        title="Currencies"
        description="Every balance the save stores in tb_currency. Amounts are written immediately to the working copy; the encrypted file changes only when you save."
        actions={
          <ConfirmButton
            title="Max out every currency?"
            description={`Sets all ${currencies.length} currency rows to ${formatNumber(MAX_CURRENCY)}. This is the highest balance seen in the reference save.`}
            confirmLabel="Max everything"
            variant="outline"
            size="sm"
            disabled={busy || currencies.length === 0}
            onConfirm={() => void setAllCurrencies(MAX_CURRENCY)}
          >
            <TrendingUp />
            Max every balance
          </ConfirmButton>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={<Wallet />}
          label="Currency rows"
          value={formatNumber(currencies.length)}
          detail="Stored in tb_currency"
        />
        <StatTile icon={<Coins />} label="Combined balance" value={formatNumber(total)} detail="Sum of every row" />
        <StatTile
          icon={<Crown />}
          label="Largest balance"
          value={largest ? itemName(largest.item, language) : '—'}
          detail={largest ? formatNumber(largest.amount) : 'No rows'}
        />
        <StatTile
          icon={<Gem />}
          label="Highest balance seen"
          value={formatNumber(MAX_CURRENCY)}
          detail="Reference save"
        />
      </div>

      {currencies.length === 0 ? (
        <EmptyPanel
          icon={<Coins />}
          title="This save has no currency rows"
          description="Currency entries are created by the game. If a balance is missing, add it through the raw database browser."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {currencies.map((currency) => (
            <div key={currency.item.cid} className="rounded-xl border bg-card/70 p-4 shadow-xs">
              <div className="flex items-start gap-4">
                <ItemIcon item={currency.item} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-heading text-base font-semibold tracking-tight">
                      {itemName(currency.item, language)}
                    </h2>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      CID {currency.item.cid}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {currency.item.grade || 'Currency'} · {currency.item.category}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <NumberField
                      value={currency.amount}
                      onCommit={(amount) => void setCurrency(currency.item.cid, amount)}
                      max={MAX_CURRENCY}
                      disabled={busy}
                      className="h-9 w-40 text-left text-sm"
                      ariaLabel={`${itemName(currency.item, language)} amount`}
                    />
                    <button
                      type="button"
                      className="text-[11px] text-brand hover:underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void setCurrency(currency.item.cid, MAX_CURRENCY)}
                    >
                      Set highest seen
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-2 text-[10px] text-muted-foreground">
                <span className="font-mono">tb_currency · CID {currency.item.cid}</span>
                <CountPill>{formatNumber(currency.amount)}</CountPill>
              </div>
            </div>
          ))}
        </div>
      )}

      <Panel title="How currency edits behave" description="A short note before you touch a balance.">
        <InfoNote>
          The editor updates the existing row for each currency; it never creates or deletes balances. Balances are
          capped at the highest value seen in the reference save ({formatNumber(MAX_CURRENCY)}), so a value above that
          reference is not offered. Gold and premium currencies both live here.
        </InfoNote>
      </Panel>
    </div>
  );
}
