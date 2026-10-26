import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  AppInfo,
  CatalogEntry,
  Character,
  Costume,
  Currency,
  Equipment,
  Gem,
  Karma,
  Loadout,
  Overview,
  QuestRewards,
  RawPage,
  RawTable,
  RawValue,
  Recipe,
  RewardGrant,
  SaveHandle,
  ScanResult,
  Settings,
  Skill,
  SlotInfo,
  Stack,
  TeamPage,
  TitleEntry,
  Vehicle,
  WriteReport,
} from './types.ts';

export type ErrorKind =
  | 'io'
  | 'sqlite'
  | 'json'
  | 'crypto'
  | 'invalid'
  | 'notOpen'
  | 'schema'
  | 'stale'
  | 'blocked'
  | 'inconsistent'
  | 'failed';

export class CommandError extends Error {
  readonly kind: ErrorKind;

  constructor(message: string, kind: ErrorKind) {
    super(message);
    this.name = 'CommandError';
    this.kind = kind;
  }
}

function toCommandError(error: unknown): CommandError {
  if (error && typeof error === 'object' && 'message' in error) {
    const { message, kind } = error as { message: unknown; kind?: unknown };
    return new CommandError(String(message), typeof kind === 'string' ? (kind as ErrorKind) : 'failed');
  }
  return new CommandError(String(error), 'failed');
}

async function invoke<T = void>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await tauriInvoke<T>(command, args);
  } catch (error) {
    throw toCommandError(error);
  }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function appInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('app_info');
}

export async function settingsGet(): Promise<Settings> {
  return invoke<Settings>('settings_get');
}

export async function settingsSet(settings: Settings): Promise<Settings> {
  return invoke<Settings>('settings_set', { settings });
}

export async function setWindowTheme(theme: 'light' | 'dark' | null): Promise<void> {
  await getCurrentWindow().setTheme(theme);
}

/** Opens a save file picker; null when the user cancels. */
export async function pickSaveFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: false,
    title: 'Open a DragonSword Awakening save',
    filters: [{ name: 'Save database', extensions: ['db'] }],
  });
  return typeof result === 'string' ? result : null;
}

/** Opens a folder picker; null when the user cancels. */
export async function pickFolder(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: true,
    title: 'Choose the folder that contains your saves',
  });
  return typeof result === 'string' ? result : null;
}

export async function scanSlots(path?: string): Promise<ScanResult> {
  return invoke<ScanResult>('slots_scan', { path: path ?? null });
}

export async function openSave(path: string): Promise<SaveHandle> {
  return invoke<SaveHandle>('save_open', { path });
}

export async function currentSave(): Promise<SaveHandle | null> {
  return invoke<SaveHandle | null>('save_current');
}

export async function closeSave(): Promise<void> {
  await invoke('save_close');
}

/** The UI kept editing, so the next native close should ask it again. */
export async function closeRequestCancelled(): Promise<void> {
  await invoke('close_request_cancelled');
}

/** Close the native window after the session has been saved or discarded. */
export async function closeWindow(): Promise<void> {
  await invoke('window_close');
}

export async function writeSave(): Promise<WriteReport> {
  return invoke<WriteReport>('save_write');
}

export async function backupSave(): Promise<string> {
  return invoke<string>('save_backup');
}

export async function overview(): Promise<Overview> {
  return invoke<Overview>('overview_get');
}

export async function setPlayerName(name: string): Promise<void> {
  await invoke('player_name_set', { name });
}

export async function setAdventure(field: string, value: number): Promise<void> {
  await invoke('adventure_set', { field, value });
}

export async function currencies(): Promise<Currency[]> {
  return invoke<Currency[]>('currencies_get');
}

export async function setCurrency(cid: number, amount: number): Promise<void> {
  await invoke('currency_set', { cid, amount });
}

export async function inventory(): Promise<Stack[]> {
  return invoke<Stack[]>('inventory_get');
}

export async function setStack(kind: string, id: string, count: number): Promise<void> {
  await invoke('stack_set', { kind, id, count });
}

export async function addStack(cid: number, count: number): Promise<void> {
  await invoke('stack_add', { cid, count });
}

export async function stackableCatalog(): Promise<import('./types.ts').Item[]> {
  return invoke('stackable_catalog');
}

export async function fillStacks(count: number): Promise<number> {
  return invoke<number>('stacks_fill', { count });
}

export async function characters(): Promise<Character[]> {
  return invoke<Character[]>('characters_get');
}

export async function setCharacter(cid: number, field: string, value: number): Promise<void> {
  await invoke('character_set', { cid, field, value });
}

export async function removeCharacter(cid: number): Promise<void> {
  await invoke('character_remove', { cid });
}

export async function skills(cid: number): Promise<Skill[]> {
  return invoke<Skill[]>('skills_get', { cid });
}

export async function setSkill(cid: number, typeValue: number, level: number): Promise<void> {
  await invoke('skill_set', { cid, typeValue, level });
}

export async function removeSkill(cid: number, typeValue: number): Promise<void> {
  await invoke('skill_remove', { cid, typeValue });
}

export async function teams(): Promise<TeamPage[]> {
  return invoke<TeamPage[]>('teams_get');
}

export async function setTeamSlot(pageId: number, slot: number, cid: number): Promise<void> {
  await invoke('team_slot_set', { pageId, slot, cid });
}

export async function loadout(cid: number): Promise<Loadout> {
  return invoke<Loadout>('loadout_get', { cid });
}

export async function equipment(): Promise<Equipment[]> {
  return invoke<Equipment[]>('equipment_get');
}

export async function setEquipment(dbid: string, field: string, value: number): Promise<void> {
  await invoke('equipment_set', { dbid, field, value });
}

export async function setEquipmentGem(dbid: string, gemDbid: string): Promise<void> {
  await invoke('equipment_gem_set', { dbid, gemDbid });
}

export async function gems(): Promise<Gem[]> {
  return invoke<Gem[]>('gems_get');
}

export async function setGem(dbid: string, field: string, value: number): Promise<void> {
  await invoke('gem_set', { dbid, field, value });
}

export async function karma(): Promise<Karma[]> {
  return invoke<Karma[]>('karma_get');
}

export async function setKarma(dbid: string, field: string, value: number): Promise<void> {
  await invoke('karma_set', { dbid, field, value });
}

export async function equipKarma(characterCid: number, dbid: string): Promise<void> {
  await invoke('karma_equip', { characterCid, dbid });
}

export async function costumes(): Promise<Costume[]> {
  return invoke<Costume[]>('costumes_get');
}

export async function costumeCatalog(): Promise<CatalogEntry[]> {
  return invoke<CatalogEntry[]>('costume_catalog');
}

export async function unlockCostume(cid: number): Promise<boolean> {
  return invoke<boolean>('costume_unlock', { cid });
}

export async function equipCostume(dbid: string, characterCid: number): Promise<void> {
  await invoke('costume_equip', { dbid, characterCid });
}

export async function mounts(): Promise<Vehicle[]> {
  return invoke<Vehicle[]>('mounts_get');
}

export async function mountCatalog(): Promise<CatalogEntry[]> {
  return invoke<CatalogEntry[]>('mount_catalog');
}

export async function questRewards(): Promise<QuestRewards[]> {
  return invoke<QuestRewards[]>('quest_rewards_get');
}

export async function grantQuestRewards(questIds: number[]): Promise<RewardGrant> {
  return invoke<RewardGrant>('quest_rewards_grant', { questIds });
}

export async function unlockMount(cid: number): Promise<boolean> {
  return invoke<boolean>('mount_unlock', { cid });
}

export async function equipMount(characterCid: number, dbid: string): Promise<void> {
  await invoke('mount_equip', { characterCid, dbid });
}

export async function titles(): Promise<TitleEntry[]> {
  return invoke<TitleEntry[]>('titles_get');
}

export async function setTitle(id: number, unlocked: boolean): Promise<void> {
  await invoke('title_set', { id, unlocked });
}

export async function unlockAllTitles(): Promise<number> {
  return invoke<number>('titles_unlock_all');
}

export async function recipes(): Promise<Recipe[]> {
  return invoke<Recipe[]>('recipes_get');
}

export async function setRecipe(key: number, known: boolean): Promise<void> {
  await invoke('recipe_set', { key, known });
}

export async function unlockAllRecipes(): Promise<number> {
  return invoke<number>('recipes_unlock_all');
}

export async function rawTables(): Promise<RawTable[]> {
  return invoke<RawTable[]>('raw_tables');
}

export async function rawPage(table: string, offset: number, limit: number, search?: string): Promise<RawPage> {
  return invoke<RawPage>('raw_page', { table, offset, limit, search: search ?? null });
}

export async function rawUpdate(
  table: string,
  rowid: string,
  column: string,
  value: RawValue,
  advanced: boolean,
): Promise<void> {
  await invoke('raw_update', { table, rowid, column, value, advanced });
}

export type { SlotInfo };
