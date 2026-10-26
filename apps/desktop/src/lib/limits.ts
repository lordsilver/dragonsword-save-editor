import type { CharacterLimits } from './types.ts';

/**
 * The two adventure grades the editor has evidence for. The Rust core returns
 * these limits for grade 1 and grade 6; the constants are the fallback while
 * the overview is loading and the fixtures used by the frontend tests.
 */
export const GRADE_ONE_CHARACTER_LIMITS: CharacterLimits = {
  grade: 1,
  level: 20,
  exp: 76_900,
  ascend: 0,
  transcend: 1,
  skillLow: 3,
  skillMid: 2,
  skillSpecial: 1,
};

export const GRADE_SIX_CHARACTER_LIMITS: CharacterLimits = {
  grade: 6,
  level: 70,
  exp: 2_990_400,
  ascend: 5,
  transcend: 6,
  skillLow: 10,
  skillMid: 7,
  skillSpecial: 1,
};

export const MAX_CHARACTER_HP = 22_229;
export const MAX_ENCHANT = 15;
export const MAX_EQUIP_EXP = 90_000;
export const MAX_ADV_LEVEL = 80;
export const MAX_ADV_GRADE = 6;
export const MAX_ADV_EXP = 962_500;
export const MAX_CURRENCY = 47_451_809;
export const MAX_STACK = 61_525;
/** Cooked dishes are not material stacks; the 100% save tops out at 203. */
export const MAX_DISH = 203;
export const MAX_CURRENCY_SAFETY = 2_147_483_647;
export const MAX_PLAY_TIME = 2_147_483_647;
/** Fate's Invitation, the shop currency used to recruit the 11 shop characters. */
export const FATES_INVITATION_CID = 1_000_500;

/** Skill slots are grouped the same way as the Rust core: 1–4, 5–7, and 801. */
export function skillLimit(limits: CharacterLimits, typeValue: number): number {
  if (typeValue === 801) return limits.skillSpecial;
  if (typeValue >= 5) return limits.skillMid;
  return limits.skillLow;
}

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
