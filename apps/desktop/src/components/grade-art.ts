import cardEpic from '@/assets/grade-card-epic.webp';
import cardLegendary from '@/assets/grade-card-legendary.webp';
import cardNormal from '@/assets/grade-card-normal.webp';
import cardRare from '@/assets/grade-card-rare.webp';
import cardSuperior from '@/assets/grade-card-superior.webp';
import tileEpic from '@/assets/grade-tile-epic.webp';
import tileLegendary from '@/assets/grade-tile-legendary.webp';
import tileNormal from '@/assets/grade-tile-normal.webp';
import tileRare from '@/assets/grade-tile-rare.webp';
import tileSuperior from '@/assets/grade-tile-superior.webp';

/**
 * The game's own grade artwork, written by scripts/gen-icons.mjs: the
 * inventory tile background (Frame_Item_Grade_0N) and the item card header
 * (Frame_Grade_0N). An unknown grade gets the normal grade's art.
 */
const NORMAL = { tile: tileNormal, card: cardNormal };
const ART: Record<string, { tile: string; card: string }> = {
  normal: NORMAL,
  superior: { tile: tileSuperior, card: cardSuperior },
  rare: { tile: tileRare, card: cardRare },
  epic: { tile: tileEpic, card: cardEpic },
  legendary: { tile: tileLegendary, card: cardLegendary },
};

function art(grade: string | null | undefined) {
  return ART[(grade ?? '').toLowerCase()] ?? NORMAL;
}

export function gradeTile(grade: string | null | undefined): string {
  return art(grade).tile;
}

export function gradeCard(grade: string | null | undefined): string {
  return art(grade).card;
}
