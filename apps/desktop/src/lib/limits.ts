import type { GrowthLimits } from './types.ts';

/**
 * One line describing a hero's breakthrough stage and the caps it sets. The
 * Rust core sends each row's own limits; this only formats them.
 */
export function breakthroughSummary(limits: GrowthLimits, ascend: number): string {
  const summary = `Breakthrough ${limits.stage} of ${limits.maxStage} · level cap ${limits.level} · skill cap ${limits.skillLow}`;
  return ascend > limits.ascend ? `${summary} · ASCEND ${ascend} is above this grade's limit` : summary;
}

export const MAX_CHARACTER_HP = 22_229;
export const MAX_ENCHANT = 15;
export const MAX_EQUIP_EXP = 90_000;
export const MAX_CURRENCY = 47_451_809;
export const MAX_STACK = 61_525;
/** Cooked dishes are not material stacks; the 100% save tops out at 203. */
export const MAX_DISH = 203;
export const MAX_CURRENCY_SAFETY = 2_147_483_647;
export const MAX_PLAY_TIME = 2_147_483_647;
/** Fate's Invitation, the shop currency used to recruit the 11 shop characters. */
export const FATES_INVITATION_CID = 1_000_500;

/**
 * Active slots 1–4 and basic slots 5–7 follow the row's breakthrough stage;
 * 801 caps at 1. Keep this in step with dsa-core.
 */
export function skillLimit(limits: GrowthLimits, typeValue: number): number {
  if (typeValue === 801) return limits.skillSpecial;
  if (typeValue >= 5) return limits.skillMid;
  return limits.skillLow;
}

/** 32-bit safety caps, not claims about the game's limits. */
export const MAX_POINTS = 999_999_999;
export const MAX_STAT = 2_147_483_647;
export const MAX_TRANSCEND_TOTAL = 99;
export const MAX_SOLDIER_GRADE = 99;

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
