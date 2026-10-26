import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, NAV_ITEMS, SECTION_LABELS } from '@/lib/nav';
import { compareDbid, formatBytes, formatDate, formatNumber, itemName } from '@/lib/store';
import type { Item } from '@/lib/types';

const ITEM: Item = {
  cid: 1000001,
  nameFr: 'Or',
  nameEn: 'Gold',
  category: 'currency',
  kind: 'CURRENCY',
  grade: 'NORMAL',
  group: '0',
  iconPath: '',
  iconX: 0,
  iconY: 0,
  known: true,
  icon: false,
};

describe('formatting helpers', () => {
  it('groups large numbers with commas', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(999_999_999_999)).toBe('999,999,999,999');
  });

  it('scales byte counts', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('treats a zero timestamp as unknown', () => {
    expect(formatDate(0)).toBe('Unknown');
    expect(formatDate(Date.UTC(2024, 0, 2, 3, 4, 5))).not.toBe('Unknown');
  });

  it('falls back to English when a French name is missing', () => {
    expect(itemName(ITEM, 'en')).toBe('Gold');
    expect(itemName(ITEM, 'fr')).toBe('Or');
    expect(itemName({ ...ITEM, nameFr: '' }, 'fr')).toBe('Gold');
  });

  it('orders 64-bit ids without losing precision', () => {
    const ids = ['70000000887056247', '70000000530855168', '70000000887056248'];
    expect(ids.sort(compareDbid)).toEqual(['70000000530855168', '70000000887056247', '70000000887056248']);
    expect(compareDbid('9007199254740993', '9007199254740992')).toBe(1);
    expect(compareDbid('9007199254740993', '9007199254740993')).toBe(0);
  });
});

describe('navigation', () => {
  it('has a unique label for every section', () => {
    const ids = NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of NAV_ITEMS) expect(SECTION_LABELS[item.id]).toBe(item.label);
  });

  it('keeps every section in a known group', () => {
    for (const item of NAV_ITEMS) expect(NAV_GROUPS).toContain(item.group);
  });
});
