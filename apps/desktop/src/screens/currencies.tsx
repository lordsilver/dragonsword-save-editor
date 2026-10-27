import { Coins, Crown, Gem, TrendingUp, Wallet } from 'lucide-react';
import { ConfirmButton, EmptyPanel } from '@/components/common';
import { NumberField } from '@/components/fields';
import { ItemIcon } from '@/components/item-icon';
import { PageHeader, Panel } from '@/components/page';
import { CountPill, InfoNote, StatTile } from '@/components/summary';
import { Badge } from '@/components/ui/badge';
import { MAX_CURRENCY, currencyLimit } from '@/lib/limits';
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
  const observed = currencies.filter((currency) => currencyLimit(currency.item.cid).observed);
  const canMaxAny = observed.some((currency) => currency.amount < currencyLimit(currency.item.cid).max);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Currencies"
        description="Every balance the save stores in tb_currency. Amounts are written immediately to the working copy; the encrypted file changes only when you save."
        actions={
          <ConfirmButton
            title="Max out observed balances?"
            description={`Sets each currency with a balance seen in the reference save to its highest observed value. Gold is ${formatNumber(MAX_CURRENCY)}. Currencies with no nonzero balance, including Aether Crystals, are skipped, and a balance already at or above its reference is left alone.`}
            confirmLabel="Max observed balances"
            variant="outline"
            size="sm"
            disabled={busy || !canMaxAny}
            onConfirm={() => void setAllCurrencies()}
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
          label="Gold reference"
          value={formatNumber(MAX_CURRENCY)}
          detail="Highest balance seen in the reference save"
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
          {currencies.map((currency) => {
            const limit = currencyLimit(currency.item.cid);
            return (
              <div key={currency.item.cid} className="rounded-xl border bg-card/70 p-4 shadow-xs">
                <div className="flex items-start gap-4">
                  <ItemIcon item={currency.item} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-heading text-base font-semibold tracking-tight">
                        {itemName(currency.item, language)}
                      </h2>
                      <Badge variant="outline" className="font-mono text-xs">
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
                        max={limit.max}
                        disabled={busy}
                        className="h-9 w-40 text-left text-sm"
                        ariaLabel={`${itemName(currency.item, language)} amount`}
                      />
                      {limit.observed ? (
                        <button
                          type="button"
                          className="text-xs text-brand hover:underline disabled:opacity-50"
                          disabled={busy || currency.amount >= limit.max}
                          title={
                            currency.amount >= limit.max ? 'Already at or above the highest seen balance' : undefined
                          }
                          onClick={() => void setCurrency(currency.item.cid, limit.max)}
                        >
                          Set highest seen
                        </button>
                      ) : (
                        <span
                          className="text-xs text-muted-foreground"
                          title="No nonzero balance for this currency exists in the reference save"
                        >
                          No observed balance
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                  <span className="font-mono">tb_currency · CID {currency.item.cid}</span>
                  <CountPill>{formatNumber(currency.amount)}</CountPill>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Panel title="How currency edits behave" description="A short note before you touch a balance.">
        <InfoNote>
          The editor updates the existing row for each currency; it never creates or deletes balances. Gold is capped at
          the highest balance seen in the reference save ({formatNumber(MAX_CURRENCY)}). Other currencies use a 32-bit
          safety cap because the reference save has no nonzero balance for them, so Aether Crystals is left out of “Max
          observed balances.” A value already above its limit stays editable and is never pulled down by a blur.
        </InfoNote>
      </Panel>
    </div>
  );
}
