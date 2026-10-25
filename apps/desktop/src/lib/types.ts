export interface Item {
  cid: number;
  nameFr: string;
  nameEn: string;
  category: string;
  kind: string;
  grade: string;
  group: string;
  iconPath: string;
  iconX: number;
  iconY: number;
  known: boolean;
  icon: boolean;
}

export interface Category {
  key: string;
  labelFr: string;
  labelEn: string;
  color: string;
  group: string;
}

export interface SlotInfo {
  path: string;
  accountId: string;
  slot: number;
  screenshot: string | null;
  sav: string | null;
  modifiedMs: number;
  size: number;
}

export interface ScanResult {
  roots: string[];
  slots: SlotInfo[];
}

export interface GemLink {
  equipmentDbid: string;
  gemDbid: string;
}

export interface DuplicateGemLink {
  gemDbid: string;
  equipmentDbids: string[];
}

export interface TeamIssue {
  pageId: number;
  kind: string;
  detail: string;
}

export interface ConsistencyReport {
  danglingGemLinks: GemLink[];
  duplicateGemLinks: DuplicateGemLink[];
  teamIssues: TeamIssue[];
}

export interface SaveHandle {
  path: string;
  accountId: string;
  slot: number;
  userId: number;
  dirty: boolean;
  warnings: string[];
  consistency: ConsistencyReport;
}

export interface WriteReport {
  backup: string | null;
  bytes: number;
  path: string;
  consistency: ConsistencyReport;
}

export interface CatalogInfo {
  items: number;
  recipes: number;
  titles: number;
  categories: number;
}

export interface AppInfo {
  version: string;
  platform: string;
  dataDir: string;
  settingsPath: string;
  suggestedRoots: string[];
  catalog: CatalogInfo;
  statNames: string[];
}

export interface Settings {
  language: 'en' | 'fr';
  theme: 'system' | 'light' | 'dark';
  compactRows: boolean;
  showUnknown: boolean;
  lastFolder: string | null;
}

export interface Counts {
  characters: number;
  currencies: number;
  stackables: number;
  equipment: number;
  gems: number;
  karma: number;
  costumes: number;
  mounts: number;
  titlesUnlocked: number;
  titlesTotal: number;
  recipesKnown: number;
  recipesTotal: number;
  questsCompleted: number;
}

export interface Currency {
  item: Item;
  amount: number;
}

export interface Overview {
  accountId: number;
  playerName: string;
  adventureGrade: number;
  adventureLevel: number;
  adventureExp: number;
  playTime: number;
  regionCid: number;
  sectionUid: number;
  stamina: number;
  maxStamina: number;
  titleCid: number;
  createdAt: string;
  lastLogin: string;
  lastLogout: string;
  position: [number, number, number];
  counts: Counts;
  currencies: Currency[];
}

export interface Stack {
  item: Item;
  kind: 'stackable' | 'cook';
  id: string;
  count: number;
}

export interface Character {
  item: Item;
  cid: number;
  level: number;
  exp: number;
  ascend: number;
  hp: number;
  transcend: number;
  transcendTotal: number;
  soldierGrade: number;
  soldierGradePoint: number;
  createdAt: number;
}

export interface Skill {
  typeValue: number;
  level: number;
}

export interface TeamSlot {
  item: Item | null;
  cid: number;
  level: number;
}

export interface TeamPage {
  pageId: number;
  slots: TeamSlot[];
  selected: boolean;
}

export interface LoadoutEntry {
  dbid: string;
  item: Item;
  enchantLevel: number;
}

export interface Loadout {
  characterCid: number;
  head: LoadoutEntry | null;
  chest: LoadoutEntry | null;
  leg: LoadoutEntry | null;
  hand: LoadoutEntry | null;
  foot: LoadoutEntry | null;
  karma: LoadoutEntry | null;
  vehicle: LoadoutEntry | null;
}

export interface Equipment {
  dbid: string;
  item: Item;
  cid: number;
  enchantLevel: number;
  exp: number;
  isLock: boolean;
  gemDbid: string;
  mainStatCid: number;
  subStatCids: number[];
  mainStatValue: number;
  subStatValues: number[];
  hasStatValues: boolean;
}

export interface Gem {
  dbid: string;
  item: Item;
  cid: number;
  statInfoCid: number;
  isLock: boolean;
}

export interface Karma {
  dbid: string;
  item: Item;
  cid: number;
  isLock: boolean;
  exp: number;
  ascend: number;
  transcend: number;
  equippedBy: number | null;
}

export interface Costume {
  dbid: string;
  item: Item;
  cid: number;
  equipCharacterCid: number;
  partsOn: number;
  isNew: boolean;
}

export interface Vehicle {
  dbid: string;
  item: Item;
  cid: number;
  equippedBy: number | null;
}

export interface CatalogEntry {
  item: Item;
  owned: boolean;
}

export interface TitleStat {
  type: string;
  value: number;
}

export interface TitleEntry {
  id: number;
  category: number;
  bit: number;
  nameFr: string;
  nameEn: string;
  color: string;
  stats: TitleStat[];
  unlocked: boolean;
  favorite: boolean;
}

export interface EffectText {
  fr?: string;
  en?: string;
}

export interface RecipeIngredient {
  kind: 'item' | 'type';
  id: number;
  nameFr: string;
  nameEn: string;
  qty: number;
  owned: number;
  iconCid: number | null;
  iconPath: string;
}

export interface Recipe {
  key: number;
  category: number;
  bit: number;
  tool: string;
  known: boolean;
  ingredients: RecipeIngredient[];
  dish: Item;
  dishes: number[];
  effectName: EffectText | null;
  effects: EffectText[];
}

export interface RawTable {
  name: string;
  rows: number;
  columns: number;
  readOnly: boolean;
}

export interface RawColumn {
  name: string;
  kind: string;
  notNull: boolean;
  primaryKey: boolean;
  readOnly: boolean;
}

export type RawValue =
  | { type: 'null' }
  | { type: 'integer'; value: string }
  | { type: 'real'; value: number }
  | { type: 'text'; value: string }
  | { type: 'blob'; value: string };

export interface RawRow {
  rowid: string;
  cells: RawValue[];
}

export interface RawPage {
  table: string;
  columns: RawColumn[];
  rows: RawRow[];
  total: number;
  offset: number;
  limit: number;
  search: string | null;
  readOnly: boolean;
}

export type Section =
  | 'overview'
  | 'currencies'
  | 'inventory'
  | 'characters'
  | 'equipment'
  | 'gems'
  | 'karma'
  | 'costumes'
  | 'mounts'
  | 'titles'
  | 'cooking'
  | 'raw'
  | 'settings';
