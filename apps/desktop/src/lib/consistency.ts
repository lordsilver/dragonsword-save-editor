import type { ConsistencyReport } from './types.ts';

/**
 * Human-readable descriptions of the broken links a save already had. The
 * editor never creates these, but both reference saves contain some.
 */
export function consistencyIssues(report: ConsistencyReport | undefined): string[] {
  if (!report) return [];
  const issues: string[] = [];
  for (const link of report.danglingGemLinks) {
    issues.push(`Equipment ${link.equipmentDbid} links gem ${link.gemDbid}, which is missing or deleted.`);
  }
  for (const link of report.duplicateGemLinks) {
    issues.push(
      `Gem ${link.gemDbid} is linked to ${link.equipmentDbids.length} pieces: ${link.equipmentDbids.join(', ')}.`,
    );
  }
  return issues;
}
