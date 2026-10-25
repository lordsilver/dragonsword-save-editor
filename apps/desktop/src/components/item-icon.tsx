import sprite from '@/assets/sprite.webp';
import type { Item } from '@/lib/types';
import { cn } from '@/lib/utils';

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
}: {
  item: Pick<Item, 'nameEn' | 'iconX' | 'iconY' | 'category' | 'icon'>;
  size?: number;
  className?: string;
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

  const scale = size / 64;
  return (
    <div
      aria-hidden
      className={cn('relative shrink-0 overflow-hidden rounded-md border border-white/5 bg-black/20', className)}
      style={{ width: size, height: size }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          backgroundImage: `url(${sprite})`,
          backgroundPosition: `${item.iconX}px ${item.iconY}px`,
          backgroundRepeat: 'no-repeat',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
}

export function gradeTone(grade: string): string {
  switch (grade.toLowerCase()) {
    case 'legendary':
    case 'mythic':
      return 'text-amber-300 border-amber-400/30 bg-amber-400/10';
    case 'epic':
      return 'text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-400/10';
    case 'rare':
      return 'text-sky-300 border-sky-400/30 bg-sky-400/10';
    case 'uncommon':
      return 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10';
    default:
      return 'text-muted-foreground border-border bg-muted/40';
  }
}
