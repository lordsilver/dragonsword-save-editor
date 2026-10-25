import { describe, expect, it } from 'vitest';
import { MAX_CURRENCY, MAX_CURRENCY_SAFETY, currencyLimit, isFillableStackKind } from '@/lib/limits';
import { clampBigNumberDraft, clampNumberDraft } from '@/lib/numbers';

describe('clampNumberDraft', () => {
  it('does not lower a saved value that is already above the reference', () => {
    expect(clampNumberDraft(50_000_000, 50_000_000, 0, MAX_CURRENCY)).toBeNull();
  });

  it('allows an explicit lower value', () => {
    expect(clampNumberDraft(49_000_000, 50_000_000, 0, MAX_CURRENCY)).toBe(49_000_000);
  });

  it('uses the current value as the ceiling when it is above the reference', () => {
    expect(clampNumberDraft(49_500_000, 50_000_000, 0, MAX_CURRENCY)).toBe(49_500_000);
    expect(clampNumberDraft(50_000_001, 50_000_000, 0, MAX_CURRENCY)).toBeNull();
  });

  it('clamps a new value to the reference when the current value is below it', () => {
    expect(clampNumberDraft(MAX_CURRENCY + 1, 10, 0, MAX_CURRENCY)).toBe(MAX_CURRENCY);
  });

  it('honours the minimum and reports no change for an equal value', () => {
    expect(clampNumberDraft(-1, 10, 0, MAX_CURRENCY)).toBe(0);
    expect(clampNumberDraft(10, 10, 0, MAX_CURRENCY)).toBeNull();
  });
});

describe('clampBigNumberDraft', () => {
  it('does not lower an id above its nominal maximum', () => {
    expect(clampBigNumberDraft(20n, 20n, 0n, 10n)).toBeNull();
    expect(clampBigNumberDraft(15n, 20n, 0n, 10n)).toBe(15n);
    expect(clampBigNumberDraft(21n, 20n, 0n, 10n)).toBeNull();
    expect(clampBigNumberDraft(19n, 20n, 0n, 10n)).toBe(19n);
  });
});

describe('currencyLimit', () => {
  it('uses gold\u2019s observed balance only for gold', () => {
    expect(currencyLimit(1_000_001)).toEqual({ max: MAX_CURRENCY, observed: true });
  });

  it('gives aether and unknown currencies the safety cap', () => {
    expect(currencyLimit(1_000_002)).toEqual({ max: MAX_CURRENCY_SAFETY, observed: false });
    expect(currencyLimit(9_999_999)).toEqual({ max: MAX_CURRENCY_SAFETY, observed: false });
  });
});

describe('isFillableStackKind', () => {
  it('accepts normal materials and EXP but never progress counters', () => {
    expect(isFillableStackKind('COMMON')).toBe(true);
    expect(isFillableStackKind('COOKING_INGREDIENT')).toBe(true);
    expect(isFillableStackKind('CHARACTER_EXP')).toBe(true);
    expect(isFillableStackKind('QUEST')).toBe(false);
    expect(isFillableStackKind('MAP')).toBe(false);
    expect(isFillableStackKind('ACHIEVEMENT_POINT')).toBe(false);
    expect(isFillableStackKind('CHARACTER_MASTER_SOUL')).toBe(false);
    expect(isFillableStackKind('GEM')).toBe(false);
  });
});
