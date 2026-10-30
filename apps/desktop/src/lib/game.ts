import { create } from 'zustand';
import * as api from './api.ts';
import type { GameText, GameUi, StatValue } from './types.ts';

/**
 * The game's own labels, inventory tabs and grade star (`game_ui`), loaded
 * once; they never change while the app runs.
 */
export const useGameUi = create<{ ui: GameUi | null; load: () => void }>((set, get) => ({
  ui: null,
  load: () => {
    if (get().ui) return;
    void api
      .gameUi()
      .then((ui) => set({ ui }))
      .catch(() => undefined);
  },
}));

/** A game text in the UI language. */
export function gameText(text: GameText | null | undefined, language: string): string {
  if (!text) return '';
  return language === 'fr' ? text.fr : text.en;
}

/** One of the game's UI strings by key, with `{0}` filled in. */
export function uiText(ui: GameUi | null, key: string, language: string, value?: string | number): string {
  const text = gameText(ui?.strings[key], language);
  return value === undefined ? text : text.replace('{0}', String(value));
}

/**
 * A stat value the way the game prints it: whole numbers for flat stats, and
 * percentages cut (not rounded) to two decimals, so 0.063611 reads 6.36%.
 */
export function formatStatValue(value: number, percent: boolean): string {
  if (!percent) return Math.floor(value + 1e-6).toLocaleString('en-US');
  const cut = Math.floor(value * 10000 + 1e-6) / 100;
  return `${cut.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

export function statName(stat: Pick<StatValue, 'nameEn' | 'nameFr'>, language: string): string {
  return language === 'fr' ? stat.nameFr : stat.nameEn;
}
