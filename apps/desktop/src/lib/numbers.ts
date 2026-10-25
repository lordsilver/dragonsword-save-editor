/**
 * Clamp a number draft for commit. A reference limit is an observation, not a
 * game rule: when the saved value is already above it, the value itself is the
 * effective ceiling so a blur cannot pull it down. `null` means "nothing to
 * commit" (an unchanged value or an invalid draft).
 */
export function clampNumberDraft(parsed: number, current: number, min: number, max?: number): number | null {
  if (!Number.isFinite(parsed)) return null;
  let next = Math.trunc(parsed);
  if (next < min) next = min;
  const ceiling = max === undefined ? undefined : Math.max(max, current);
  if (ceiling !== undefined && next > ceiling) next = ceiling;
  return next === current ? null : next;
}

/** The 64-bit-id equivalent of {@link clampNumberDraft}. */
export function clampBigNumberDraft(parsed: bigint, current: bigint, min: bigint, max: bigint): bigint | null {
  let next = parsed;
  if (next < min) next = min;
  const ceiling = max > current ? max : current;
  if (next > ceiling) next = ceiling;
  return next === current ? null : next;
}
