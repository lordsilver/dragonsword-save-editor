import { describe, expect, it } from 'vitest';
import {
  MAX_CURRENCY,
  MAX_CURRENCY_SAFETY,
  breakthroughSummary,
  currencyLimit,
  isFillableStackKind,
  skillLimit,
} from '@/lib/limits';
import { clampBigNumberDraft, clampNumberDraft, parseBigNumberDraft, parseNumberDraft } from '@/lib/numbers';
import type { GrowthLimits } from '@/lib/types';

// Two rows from the same grade-3 save, as the Rust core sends them: one hero
// at breakthrough 0 and one at breakthrough 2.
const STAGE_ZERO: GrowthLimits = {
  stage: 0,
  ascend: 2,
  maxStage: 4,
  level: 20,
  expMin: 76_900,
  exp: 76_900,
  transcend: 6,
  skillLow: 3,
  skillMid: 3,
  skillSpecial: 1,
};
const STAGE_TWO: GrowthLimits = { ...STAGE_ZERO, stage: 2, level: 40, skillLow: 7, skillMid: 7 };

describe('parseNumberDraft', () => {
  it('treats a blank draft as nothing to commit, not zero', () => {
    expect(parseNumberDraft('')).toBeNull();
    expect(parseNumberDraft('   ')).toBeNull();
    expect(parseNumberDraft('0')).toBe(0);
  });

  it('accepts grouped digits and rejects non-numeric text', () => {
    expect(parseNumberDraft('1,234')).toBe(1_234);
    expect(parseNumberDraft('abc')).toBeNull();
  });
});

describe('parseBigNumberDraft', () => {
  it('treats a blank draft as nothing to commit', () => {
    expect(parseBigNumberDraft('')).toBeNull();
    expect(parseBigNumberDraft('   ')).toBeNull();
    expect(parseBigNumberDraft('0')).toBe(0n);
  });

  it('accepts grouped digits and rejects signs or letters', () => {
    expect(parseBigNumberDraft('72,057,594,037,927,936')).toBe(72_057_594_037_927_936n);
    expect(parseBigNumberDraft('-1')).toBeNull();
    expect(parseBigNumberDraft('1e3')).toBeNull();
  });
});

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

describe('skillLimit', () => {
  it("uses each row's own breakthrough caps", () => {
    expect(skillLimit(STAGE_ZERO, 1)).toBe(3);
    expect(skillLimit(STAGE_ZERO, 5)).toBe(3);
    expect(skillLimit(STAGE_ZERO, 801)).toBe(1);
    expect(skillLimit(STAGE_TWO, 4)).toBe(7);
    expect(skillLimit(STAGE_TWO, 7)).toBe(7);
    expect(skillLimit(STAGE_TWO, 801)).toBe(1);
  });
});

describe('breakthroughSummary', () => {
  it("describes the row's own stage", () => {
    expect(breakthroughSummary(STAGE_ZERO, 0)).toBe('Breakthrough 0 of 4 · level cap 20 · skill cap 3');
    expect(breakthroughSummary(STAGE_TWO, 2)).toBe('Breakthrough 2 of 4 · level cap 40 · skill cap 7');
  });

  it('flags an ASCEND above the grade limit', () => {
    expect(breakthroughSummary(STAGE_TWO, 5)).toContain("ASCEND 5 is above this grade's limit");
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
