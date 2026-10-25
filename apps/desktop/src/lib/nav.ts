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
  PawPrint,
  Settings,
  Shirt,
  Sword,
  Users,
} from 'lucide-react';
import type { Section } from './types';

export interface NavItem {
  id: Section;
  label: string;
  icon: LucideIcon;
  group: 'Save' | 'Collection' | 'Advanced';
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Save' },
  { id: 'currencies', label: 'Currencies', icon: Coins, group: 'Save' },
  { id: 'inventory', label: 'Inventory', icon: Backpack, group: 'Save' },
  { id: 'characters', label: 'Characters', icon: Users, group: 'Save' },
  { id: 'equipment', label: 'Equipment', icon: Sword, group: 'Save' },
  { id: 'gems', label: 'Gems', icon: Gem, group: 'Save' },
  { id: 'karma', label: 'Karma', icon: Flame, group: 'Save' },
  { id: 'costumes', label: 'Costumes', icon: Shirt, group: 'Collection' },
  { id: 'mounts', label: 'Mounts', icon: PawPrint, group: 'Collection' },
  { id: 'titles', label: 'Titles', icon: Crown, group: 'Collection' },
  { id: 'cooking', label: 'Cooking', icon: CookingPot, group: 'Collection' },
  { id: 'raw', label: 'Raw database', icon: Database, group: 'Advanced' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'Advanced' },
];

export const SECTION_LABELS: Record<Section, string> = Object.fromEntries(
  NAV_ITEMS.map((item) => [item.id, item.label]),
) as Record<Section, string>;
