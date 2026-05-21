import type { SemanticScenarioExpected, TemplateDiffChange, ThemeLayoutDocument, UnrelatedDiffResult } from '../types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, stable(nested)]));
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function walkDiff(before: unknown, after: unknown, path: string, changes: TemplateDiffChange[]): void {
  if (isEqual(before, after)) {
    return;
  }
  if (before === undefined) {
    changes.push({ path, type: 'added', after });
    return;
  }
  if (after === undefined) {
    changes.push({ path, type: 'removed', before });
    return;
  }
  if (Array.isArray(before) || Array.isArray(after) || !isPlainObject(before) || !isPlainObject(after)) {
    changes.push({ path, type: 'changed', before, after });
    return;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.forEach((key) => {
    walkDiff(before[key], after[key], path ? `${path}.${key}` : key, changes);
  });
}

export function collectTemplateDiff(
  before: ThemeLayoutDocument | undefined,
  after: ThemeLayoutDocument | undefined,
): TemplateDiffChange[] {
  if (!before || !after) {
    return [];
  }
  const changes: TemplateDiffChange[] = [];
  walkDiff(before, after, '', changes);
  return changes.filter((change) => change.path.length > 0);
}

function pathAllowed(path: string, allowed: readonly string[]): boolean {
  return allowed.some((allowedPath) => (
    path === allowedPath ||
    path.startsWith(`${allowedPath}.`) ||
    allowedPath.endsWith('*') && path.startsWith(allowedPath.slice(0, -1))
  ));
}

export function evaluateUnrelatedDiff(
  before: ThemeLayoutDocument | undefined,
  after: ThemeLayoutDocument | undefined,
  expected: SemanticScenarioExpected | undefined,
): UnrelatedDiffResult {
  const changes = collectTemplateDiff(before, after);
  const allowed = expected?.allowedChanges?.map((item) => item.path) ?? [];
  const unrelatedChanges = allowed.length > 0
    ? changes.filter((change) => !pathAllowed(change.path, allowed))
    : [];
  const score = changes.length === 0 ? 0 : unrelatedChanges.length / Math.max(1, changes.length);
  const maxScore = expected?.maxUnrelatedChangeScore ?? 0.1;
  return {
    passed: score <= maxScore,
    score,
    maxScore,
    changes,
    unrelatedChanges,
  };
}
