import { Fragment, type ReactNode } from 'react';
import { ItemIcon } from '@/components/item-icon';
import { useGameUi } from '@/lib/game';
import { cn } from '@/lib/utils';

/**
 * The game's rich-text colours, sampled from its screens (2026-10-27): the
 * numbers and status names (`<LightOrange>`) and headings such as Activation
 * Conditions (`<Yellow>`).
 */
const TAG_COLORS: Record<string, string> = {
  LightOrange: '#ffc169',
  Orange: '#ffa94d',
  Yellow: '#fff1b1',
  White: '#ffffff',
  Red: '#ff6b6b',
  Green: '#8fe388',
  Blue: '#7ab8ff',
};

/**
 * A game string with its rich text drawn: `<Tag>…</>` colours a run,
 * `<br>` and newlines break the line, and unknown tags keep their text.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts: ReactNode[] = [];
  let color: string | undefined;
  let key = 0;
  for (const token of text.split(/(<[^<>]*>|\n)/)) {
    if (!token) continue;
    if (token === '<br>' || token === '\n') {
      parts.push(<br key={key++} />);
    } else if (token === '</>' || token.startsWith('</')) {
      color = undefined;
    } else if (/^<[A-Za-z]\w*>$/.test(token)) {
      const tag = token.slice(1, -1);
      color = TAG_COLORS[tag] ?? undefined;
    } else if (token.startsWith('<')) {
      // Click links and other tags with attributes: keep only their text.
    } else if (color) {
      parts.push(
        <span key={key++} className="game-tag" style={{ ['--game-tag' as string]: color }}>
          {token}
        </span>,
      );
    } else {
      parts.push(<Fragment key={key++}>{token}</Fragment>);
    }
  }
  return <span className={className}>{parts}</span>;
}

/** The game's grade stars, as its bag draws them over a tile's foot. */
export function GradeStars({ count, size = 14, className }: { count: number; size?: number; className?: string }) {
  const star = useGameUi((state) => state.ui?.starIcon);
  if (count <= 0) return null;
  return (
    <span className={cn('flex items-center justify-center', className)} title={`${count} star grade`}>
      {Array.from({ length: count }, (_, index) => (
        <ItemIcon
          // biome-ignore lint/suspicious/noArrayIndexKey: stars are positional
          key={index}
          item={{
            nameEn: '★',
            iconX: star?.iconX ?? 0,
            iconY: star?.iconY ?? 0,
            category: 'star',
            icon: Boolean(star),
          }}
          size={size}
          className="-mx-px rounded-none border-none bg-transparent"
        />
      ))}
    </span>
  );
}
