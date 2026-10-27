import type { CSSProperties } from 'react';
import sprite from '@/assets/sprite.webp';
import type { Item } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Pixels per sprite cell: `iconSize` in items.json, written by scripts/gen-icons.mjs. */
export const SPRITE_CELL = 128;
/** Cells per sprite row, `COLUMNS` in scripts/gen-icons.mjs. */
export const SPRITE_COLUMNS = 32;

const CATEGORY_COLORS: Record<string, string> = {
  character: 'from-sky-500/25 to-sky-900/10 text-sky-300',
  gear: 'from-amber-500/25 to-amber-900/10 text-amber-300',
  currency: 'from-yellow-400/25 to-yellow-900/10 text-yellow-300',
  material: 'from-emerald-500/20 to-emerald-900/10 text-emerald-300',
  food: 'from-orange-500/20 to-orange-900/10 text-orange-300',
  costume: 'from-fuchsia-500/20 to-fuchsia-900/10 text-fuchsia-300',
  mount: 'from-cyan-500/20 to-cyan-900/10 text-cyan-300',
  title: 'from-rose-500/20 to-rose-900/10 text-rose-300',
};

export function ItemIcon({
  item,
  size = 40,
  className,
  style,
  underlay,
}: {
  item: Pick<Item, 'nameEn' | 'iconX' | 'iconY' | 'category' | 'icon'>;
  size?: number;
  className?: string;
  /** Extra styles for the icon's frame, such as its border colour. */
  style?: CSSProperties;
  /** A CSS image drawn under the icon, such as a skill's tinted disc. */
  underlay?: string;
}) {
  if (!item.icon) {
    const tone = CATEGORY_COLORS[item.category] ?? 'from-muted to-muted/40 text-muted-foreground';
    return (
      <div
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md border border-white/5 bg-gradient-to-br font-heading font-semibold',
          tone,
          className,
        )}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.32) }}
      >
        {item.nameEn.replace(/^(The|A|An)\s+/i, '').charAt(0) || '?'}
      </div>
    );
  }

  // The cell is scaled through background-size and drawn from the border
  // box, so a frame's border never shifts the icon off centre.
  const scale = size / SPRITE_CELL;
  const layers = (sprite: string, under: string) => (underlay ? `${sprite}, ${under}` : sprite);
  return (
    <div
      aria-hidden
      className={cn('relative shrink-0 overflow-hidden rounded-md border border-white/5 bg-black/20', className)}
      style={{
        ...style,
        width: size,
        height: size,
        backgroundImage: layers(`url(${sprite})`, underlay ?? ''),
        backgroundSize: layers(`${SPRITE_COLUMNS * SPRITE_CELL * scale}px auto`, '100% 100%'),
        backgroundPosition: layers(`${item.iconX * scale}px ${item.iconY * scale}px`, 'center'),
        backgroundRepeat: 'no-repeat',
        backgroundOrigin: 'border-box',
      }}
    />
  );
}

export function gradeTone(grade: string): string {
  switch (grade.toLowerCase()) {
    case 'legendary':
    case 'mythic':
      return 'text-amber-700 dark:text-amber-300 border-amber-400/40 bg-amber-400/10';
    case 'epic':
      return 'text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-400/10';
    case 'rare':
      return 'text-sky-700 dark:text-sky-300 border-sky-400/40 bg-sky-400/10';
    case 'uncommon':
      return 'text-emerald-700 dark:text-emerald-300 border-emerald-400/40 bg-emerald-400/10';
    default:
      return 'text-muted-foreground border-border bg-muted/40';
  }
}
