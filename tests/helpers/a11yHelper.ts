import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export type ViolationSeverity = 'critical' | 'serious' | 'moderate' | 'minor';

export interface ViolationEntry {
  pageName: string;
  url: string;
  ruleId: string;
  impact: ViolationSeverity;
  description: string;
  help: string;
  helpUrl: string;
  nodeCount: number;
  nodes: string[];
}

/**
 * Converts raw axe violations into structured ViolationEntry records.
 */
export function toViolationEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  violations: any[],
  pageName: string,
  url: string,
): ViolationEntry[] {
  return violations.map((v) => ({
    pageName,
    url,
    ruleId: v.id as string,
    impact: ((v.impact as string) ?? 'minor') as ViolationSeverity,
    description: v.description as string,
    help: v.help as string,
    helpUrl: v.helpUrl as string,
    nodeCount: (v.nodes as unknown[]).length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodes: (v.nodes as any[]).map((n) => (n.html as string)).slice(0, 3),
  }));
}

/**
 * Formats violations into a human-readable string for use in test assertion
 * failure messages, so engineers see exactly what broke and where.
 */
export function formatViolations(violations: ViolationEntry[]): string {
  if (violations.length === 0) return 'No violations.';
  return violations
    .map(
      (v) =>
        `[${v.impact.toUpperCase()}] ${v.ruleId}: ${v.help}\n` +
        `  Description : ${v.description}\n` +
        `  Elements    : ${v.nodeCount}\n` +
        `  Reference   : ${v.helpUrl}`,
    )
    .join('\n\n');
}

/**
 * Groups violations by impact severity bucket.
 */
export function groupBySeverity(
  violations: ViolationEntry[],
): Record<ViolationSeverity, ViolationEntry[]> {
  return {
    critical: violations.filter((v) => v.impact === 'critical'),
    serious: violations.filter((v) => v.impact === 'serious'),
    moderate: violations.filter((v) => v.impact === 'moderate'),
    minor: violations.filter((v) => v.impact === 'minor'),
  };
}

/**
 * Writes a Markdown accessibility report grouped by severity to `outputPath`.
 * Creates missing parent directories automatically.
 */
export function generateMarkdownReport(
  violations: ViolationEntry[],
  outputPath: string,
): void {
  const grouped = groupBySeverity(violations);
  const SEVERITIES: ViolationSeverity[] = ['critical', 'serious', 'moderate', 'minor'];
  const EMOJI: Record<ViolationSeverity, string> = {
    critical: '🔴',
    serious: '🟠',
    moderate: '🟡',
    minor: '⚪',
  };

  // ── Header & summary tables ────────────────────────────────────────────────
  const lines: string[] = [
    '# Accessibility Report — WCAG 2.1 AA',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Total violations:** ${violations.length}`,
    '',
    '## Summary by Severity',
    '',
    '| Severity | Count |',
    '|----------|------:|',
    ...SEVERITIES.map(
      (s) =>
        `| ${EMOJI[s]} ${s.charAt(0).toUpperCase()}${s.slice(1)} | ${grouped[s].length} |`,
    ),
    '',
  ];

  // ── Per-page summary ───────────────────────────────────────────────────────
  const byPage: Record<string, number> = {};
  for (const v of violations) {
    byPage[v.pageName] = (byPage[v.pageName] ?? 0) + 1;
  }

  lines.push('## Summary by Page', '');
  if (Object.keys(byPage).length === 0) {
    lines.push('_No violations found on any page._', '');
  } else {
    lines.push('| Page | Violations |', '|------|----------:|');
    for (const [pageName, count] of Object.entries(byPage)) {
      lines.push(`| ${pageName} | ${count} |`);
    }
    lines.push('');
  }

  // ── Violations grouped by severity ────────────────────────────────────────
  for (const severity of SEVERITIES) {
    const bucket = grouped[severity];
    if (bucket.length === 0) continue;

    const label = `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
    lines.push(`## ${EMOJI[severity]} ${label} Violations (${bucket.length})`, '');

    for (const v of bucket) {
      lines.push(`### \`${v.ruleId}\` — ${v.help}`, '');
      lines.push(`- **Page:** ${v.pageName}`);
      lines.push(`- **URL:** \`${v.url}\``);
      lines.push(`- **Description:** ${v.description}`);
      lines.push(`- **Elements affected:** ${v.nodeCount}`);
      lines.push(`- **Reference:** [axe-core docs](${v.helpUrl})`);

      if (v.nodes.length > 0) {
        lines.push('- **Example elements:**');
        for (const html of v.nodes) {
          lines.push('  ```html', `  ${html.trim()}`, '  ```');
        }
      }
      lines.push('');
    }
  }

  if (violations.length === 0) {
    lines.push(
      '## ✅ All Pages Pass',
      '',
      'Every scanned page meets WCAG 2.1 AA requirements. No violations detected.',
      '',
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}
