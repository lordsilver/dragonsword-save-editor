import { describe, expect, it } from 'vitest';
import { consistencyIssues } from '@/lib/consistency';
import type { ConsistencyReport } from '@/lib/types';

const clean: ConsistencyReport = {
  danglingGemLinks: [],
  duplicateGemLinks: [],
  teamIssues: [],
};

describe('consistencyIssues', () => {
  it('renders team problems alongside gem links', () => {
    expect(
      consistencyIssues({
        ...clean,
        teamIssues: [
          {
            pageId: 0,
            kind: 'duplicate-character',
            detail: 'team page 0 lists character 10001 in slots 1 and 2',
          },
        ],
      }),
    ).toEqual(['team page 0 lists character 10001 in slots 1 and 2']);
  });

  it('returns nothing for a clean report or no report', () => {
    expect(consistencyIssues(clean)).toEqual([]);
    expect(consistencyIssues(undefined)).toEqual([]);
  });
});
