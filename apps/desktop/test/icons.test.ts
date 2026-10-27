import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPRITE_CELL } from '@/components/item-icon';

describe('icon sprite', () => {
  it('uses the cell size the catalog was packed with', () => {
    const catalog = JSON.parse(readFileSync(resolve(__dirname, '../../../crates/core/data/items.json'), 'utf8'));
    expect(SPRITE_CELL).toBe(catalog.iconSize);
  });
});
