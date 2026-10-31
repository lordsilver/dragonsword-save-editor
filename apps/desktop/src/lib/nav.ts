import type { LucideIcon } from 'lucide-react';
import {
  Backpack,
  Coins,
  CookingPot,
  Crown,
  Database,
  Flame,
  Gem,
  LayoutDashboard,
  Map as MapIcon,
  PawPrint,
  ScrollText,
  Shirt,
  SlidersHorizontal,
  Sword,
  Users,
} from 'lucide-react';
import type { Counts, Section } from './types';

export const NAV_GROUPS = ['Save', 'Heroes', 'Collection', 'World', 'Advanced'] as const;

/** The app's own screens, pinned below the save's: they change the editor, not the save. */
export const APP_GROUP = 'App';

export interface NavItem {
  id: Section;
  label: string;
  icon: LucideIcon;
  group: (typeof NAV_GROUPS)[number] | typeof APP_GROUP;
  /** The overview count shown beside the label. */
  count?: (counts: Counts) => number;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Save' },
  { id: 'currencies', label: 'Currencies', icon: Coins, group: 'Save', count: (c) => c.currencies },
  { id: 'inventory', label: 'Inventory', icon: Backpack, group: 'Save', count: (c) => c.stackables },
  { id: 'characters', label: 'Heroes', icon: Users, group: 'Heroes', count: (c) => c.characters },
  { id: 'equipment', label: 'Equipment', icon: Sword, group: 'Heroes', count: (c) => c.equipment },
  { id: 'gems', label: 'Gems', icon: Gem, group: 'Heroes', count: (c) => c.gems },
  { id: 'karma', label: 'Karma', icon: Flame, group: 'Heroes', count: (c) => c.karma },
  { id: 'costumes', label: 'Costumes', icon: Shirt, group: 'Collection', count: (c) => c.costumes },
  { id: 'mounts', label: 'Familiars', icon: PawPrint, group: 'Collection', count: (c) => c.mounts },
  { id: 'titles', label: 'Titles', icon: Crown, group: 'Collection', count: (c) => c.titlesUnlocked },
  { id: 'cooking', label: 'Cooking', icon: CookingPot, group: 'Collection', count: (c) => c.recipesKnown },
  { id: 'world', label: 'World map', icon: MapIcon, group: 'World' },
  { id: 'quests', label: 'Quests', icon: ScrollText, group: 'World' },
  { id: 'raw', label: 'Raw database', icon: Database, group: 'Advanced' },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal, group: APP_GROUP },
];

export const SECTION_LABELS: Record<Section, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.id, item.label]),
) as Record<Section, string>;
