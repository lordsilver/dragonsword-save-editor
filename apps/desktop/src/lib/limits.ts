/**
 * Ceilings observed in the 100% reference save (93265845_Slot2.db).
 *
 * The game's own tables are not readable yet, so the editor uses the largest
 * value it has actually seen instead of inventing a round number. The Rust
 * setters enforce the same values; these are here for the input fields and the
 * one-click "max" actions.
 */
export const MAX_LEVEL = 70;
export const MAX_ASCEND = 5;
export const MAX_TRANSCEND = 6;
export const MAX_CHARACTER_EXP = 2_990_400;
export const MAX_CHARACTER_HP = 22_229;
export const MAX_SKILL_LEVEL = 10;
export const MAX_ENCHANT = 15;
export const MAX_EQUIP_EXP = 90_000;
export const MAX_ADV_LEVEL = 80;
export const MAX_ADV_GRADE = 6;
export const MAX_ADV_EXP = 962_500;
export const MAX_CURRENCY = 47_451_809;
export const MAX_STACK = 61_525;
export const MAX_CURRENCY_SAFETY = 2_147_483_647;
export const MAX_KARMA_EXP = 2_990_400;
export const MAX_PLAY_TIME = 2_147_483_647;

/** 32-bit safety caps, not claims about the game's limits. */
export const MAX_POINTS = 999_999_999;
export const MAX_STAT = 2_147_483_647;
export const MAX_TRANSCEND_TOTAL = 99;
export const MAX_SOLDIER_GRADE = 99;

/** The only skill type values the game writes: regular slots 1–7 and 801. */
export const SKILL_TYPES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 801];

export interface CurrencyLimit {
  max: number;
  /** True only when a nonzero balance was seen in the reference save. */
  observed: boolean;
}

/**
 * Currency limits are per CID. Gold's reference balance bounds gold; every
 * other currency, including Aether Crystals, gets a 32-bit safety cap because
 * the reference save cannot tell us what a legitimate balance looks like.
 */
export function currencyLimit(cid: number): CurrencyLimit {
  if (cid === 1_000_001) return { max: MAX_CURRENCY, observed: true };
  return { max: MAX_CURRENCY_SAFETY, observed: false };
}

/** Item kinds Fill is allowed to raise. Keep this in step with dsa-core. */
export function isFillableStackKind(kind: string): boolean {
  return (
    kind === 'COMMON' ||
    kind === 'COOKING_INGREDIENT' ||
    kind === 'GEM_SOCKET_MATERIAL' ||
    kind === 'CHANGE_EQUIPMENT_SUB_STAT' ||
    kind.endsWith('_EXP')
  );
}
