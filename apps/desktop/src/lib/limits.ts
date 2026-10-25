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
export const MAX_KARMA_EXP = 2_990_400;
export const MAX_PLAY_TIME = 2_147_483_647;

/** 32-bit safety caps, not claims about the game's limits. */
export const MAX_POINTS = 999_999_999;
export const MAX_STAT = 2_147_483_647;
export const MAX_TRANSCEND_TOTAL = 99;
export const MAX_SOLDIER_GRADE = 99;

/** The only skill type values the game writes: regular slots 1–7 and 801. */
export const SKILL_TYPES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 801];
