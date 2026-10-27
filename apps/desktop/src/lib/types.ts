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

/**
 * Growth ceilings the Rust core derives for one hero or karma from its own
 * breakthrough stage. Existing values above a ceiling remain editable; the UI
 * uses `max(limit, current)` when it builds a field.
 */
export interface GrowthLimits {
  /** The row's ASCEND, clamped to the stages its grade unlocks. */
  stage: number;
  /** The breakthrough stages the grade unlocks, the ascension cap. */
  ascend: number;
  /** The last breakthrough the region's live servers allow. */
  maxStage: number;
  /** The level cap at this stage. */
  level: number;
  /** The EXP range the row's current level allows; it includes the current value. */
  expMin: number;
  exp: number;
  transcend: number;
  /** Active/trigger skills, slots 1–4. */
  skillLow: number;
  /** Basic skills, slots 5–7. */
  skillMid: number;
  /** The special 801 slot. */
  skillSpecial: number;
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
  /** Breakthrough stages the Mercenary Corps grade unlocks. */
  maxAscend: number;
  /** The grade's rank name in the game's own strings. */
  adventureRankEn: string;
  adventureRankFr: string;
  promotionsCompleted: number;
  promotionsTotal: number;
  /** Corps level cap and the EXP range at the current corps level. */
  adventureLimits: GrowthLimits;
  story: Story;
}

/** A main-story quest, numbered the way the game shows it. */
export interface MainQuest {
  id: number;
  number: number;
  nameEn: string;
  nameFr: string;
}

export interface Story {
  completed: number;
  total: number;
  /** The quest in progress, or the first one not done. */
  current: MainQuest | null;
  nextPromotion: {
    grade: number;
    rankEn: string;
    rankFr: string;
    requires: MainQuest;
    storyDone: boolean;
  } | null;
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
  /** False for a story hero the game seeded who has not joined yet. */
  joined: boolean;
  limits: GrowthLimits;
}

/** A hero the game hands out, for the recruit list. */
export interface HeroEntry {
  cid: number;
  item: Item;
  /** The shop, or the quest whose completion brings the hero (as a reward or by joining). */
  sources: HeroSource[];
  owned: boolean;
}

export type HeroSource = { kind: 'shop' } | { kind: 'quest'; questId: number; nameEn: string; nameFr: string };

/** One slot of a hero's skill tree from the game data. */
export interface SkillInfo {
  type: number;
  /** The game's SlotOrder: 1–4 the left column, 5–8 the right, 9 the master skill. */
  order: number;
  master: boolean;
  /** One of the two signal skills, which the game draws as diamonds. */
  signal: boolean;
  nameEn: string;
  nameFr: string;
  descEn: string;
  descFr: string;
  /** The SkillEffect key, or null for a plain attack. */
  effect: string | null;
  iconX: number;
  iconY: number;
}

export interface Skill {
  typeValue: number;
  level: number;
  /** Whether the save has a tb_skill_growth row for this slot. */
  saved: boolean;
  /** False for Dodge, which the game never stores and keeps at level 1. */
  editable: boolean;
  info: SkillInfo | null;
  /** The effect the skill applies, named and badged as in the game. */
  effect: SkillEffect | null;
}

export interface SkillEffect {
  /** The game's IconColor: AIR, BLEED, STUN, … */
  key: string;
  nameEn: string;
  nameFr: string;
  /** The badge's colour, #rrggbb, which tints the skill's disc. */
  color: string;
  iconX: number;
  iconY: number;
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
  /** The level the karma's EXP reaches in its rarity's table. */
  level: number;
  limits: GrowthLimits;
}

export interface Costume {
  dbid: string;
  item: Item;
  cid: number;
  equipCharacterCid: number;
  partsOn: number;
  isNew: boolean;
}

/** The rewards one completed quest lists in the game's quest table. */
export interface QuestRewards {
  questId: number;
  category: string;
  nameEn: string;
  nameFr: string;
  gold: number;
  /** Mercenary Corps EXP; listed but never granted. */
  advExp: number;
  items: Array<{
    item: Item;
    count: number;
    route: 'currency' | 'stack' | 'mount' | 'title' | 'hero' | 'dish' | 'equipment' | 'none';
  }>;
  /** Why the editor cannot complete this quest, for a quest in progress. */
  blocked: string | null;
}

export interface QuestCompletion {
  grant: RewardGrant;
  joined: Item[];
  levelsGained: number;
  newGrade: number | null;
  started: Array<{ questId: number; nameEn: string; nameFr: string }>;
}

export interface RewardGrant {
  granted: Array<{ item: Item; count: number }>;
  notGranted: Array<{ item: Item; count: number }>;
  advExpNotGranted: number;
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

export type HeroTab = 'info' | 'skills' | 'equipment';
