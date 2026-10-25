import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rawUpdate, setStack } from '@/lib/api';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const invoked = vi.mocked(invoke);

describe('64-bit ids cross the IPC boundary as strings', () => {
  beforeEach(() => {
    invoked.mockClear();
  });

  it('sends a cooked dish id exactly as the save stores it', async () => {
    // Number('73605708196654092') is 73605708196654100, which is another dish.
    await setStack('cook', '73605708196654092', 5);

    expect(invoked).toHaveBeenCalledTimes(1);
    expect(invoked).toHaveBeenCalledWith('stack_set', {
      kind: 'cook',
      id: '73605708196654092',
      count: 5,
    });
    const args = invoked.mock.lastCall?.[1] as { id?: unknown } | undefined;
    expect(typeof args?.id).toBe('string');
  });

  it('sends a raw row id exactly, with the advanced flag', async () => {
    // rowid is the equipment's 17-digit ITEM_DBID.
    await rawUpdate('tb_equipment', '70000000820699118', 'ENCHANT_LEVEL', { type: 'integer', value: '7' }, false);

    expect(invoked).toHaveBeenCalledTimes(1);
    expect(invoked).toHaveBeenCalledWith('raw_update', {
      table: 'tb_equipment',
      rowid: '70000000820699118',
      column: 'ENCHANT_LEVEL',
      value: { type: 'integer', value: '7' },
      advanced: false,
    });
    const args = invoked.mock.lastCall?.[1] as { rowid?: unknown } | undefined;
    expect(typeof args?.rowid).toBe('string');
  });

  it('passes the advanced switch through unchanged', async () => {
    await rawUpdate('tb_equipment', '70000000820699118', 'GEM_DBID', { type: 'integer', value: '1' }, true);

    expect(invoked).toHaveBeenCalledWith(
      'raw_update',
      expect.objectContaining({ advanced: true, rowid: '70000000820699118' }),
    );
  });
});
