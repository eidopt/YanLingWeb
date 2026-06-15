import fs from 'node:fs';
import path from 'node:path';

export function ensureOutputDirs(outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'failures'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'snapshots'), { recursive: true });
}

export function writeReports(outputDir, summary) {
  ensureOutputDirs(outputDir);
  const latestJsonPath = path.join(outputDir, 'latest.json');
  const latestMdPath = path.join(outputDir, 'latest.md');
  fs.writeFileSync(latestJsonPath, `${JSON.stringify(summary, null, 2)}\n`);

  const lines = [
    '# Agent Eval Report',
    '',
    `- Mode: ${summary.mode}`,
    `- Total: ${summary.total}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    `- Errored: ${summary.errored}`,
    `- Pass rate: ${(summary.passRate * 100).toFixed(1)}%`,
    `- Error rate: ${(summary.errorRate * 100).toFixed(1)}%`,
  ];

  // PR-B.2: failure category breakdown — surfaces the most-routed-to
  // preValidateAndFix rule family for quick triage.
  const categoryCounts = summary.failures.reduce((acc, failure) => {
    const key = failure.category ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const categoryLines = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([category, count]) => `- ${category}: ${count}`);
  if (categoryLines.length > 0) {
    lines.push('', '### Failure categories', '', ...categoryLines);
  }
  lines.push(
    '',
    `- Tool call rate: ${(summary.toolCallRate * 100).toFixed(1)}%`,
    `- Clarification count: ${summary.clarificationCount ?? 0}`,
    `- Clarification rate: ${((summary.clarificationRate ?? 0) * 100).toFixed(1)}%`,
    `- Clarification custom replies: ${summary.clarificationCustomCount ?? 0}`,
    `- Clarification custom reply rate: ${((summary.clarificationCustomRate ?? 0) * 100).toFixed(1)}%`,
    `- Structure pass rate: ${(summary.structurePassRate * 100).toFixed(1)}%`,
    `- Semantic pass rate: ${(summary.semanticPassRate * 100).toFixed(1)}%`,
    `- Render pass rate: ${(summary.renderPassRate * 100).toFixed(1)}%`,
    `- Unrelated diff failure rate: ${(summary.unrelatedDiffFailureRate * 100).toFixed(1)}%`,
    `- Partial success count: ${summary.partialSuccess}`,
    `- Average duration: ${summary.averageDurationMs.toFixed(1)}ms`,
    `- Cache hit rate: ${(summary.cacheHitRate * 100).toFixed(1)}%`,
    `- Cache tokens: hit ${summary.cacheHitTokens}, miss ${summary.cacheMissTokens}`,
    `- Cache miss/request: ${(summary.cacheMissTokensPerRequest ?? 0).toFixed(1)}`,
    `- Post-warmup cache hit rate: ${((summary.postWarmupCacheHitRate ?? 0) * 100).toFixed(1)}% (skip ${summary.cacheWarmupCount ?? 0})`,
    `- Post-warmup cache tokens: hit ${summary.postWarmupCacheHitTokens ?? 0}, miss ${summary.postWarmupCacheMissTokens ?? 0}`,
    `- Post-warmup cache miss/request: ${(summary.postWarmupCacheMissTokensPerRequest ?? 0).toFixed(1)}`,
    `- Prefix hashes: ${summary.prefixHashCount ?? 0}`,
    `- Tool hashes: ${summary.toolHashCount ?? 0}`,
    ...(summary.targetCacheHitRate === undefined
      ? []
      : [
          `- Cache target: ${(summary.targetCacheHitRate * 100).toFixed(1)}%`,
          `- Cache target met: ${summary.cacheHitRateMet ? 'yes' : 'no'}`,
        ]),
    '',
    '## Failures',
    '',
  );

  if (summary.failures.length === 0) {
    lines.push('No failures.');
  } else {
    summary.failures.forEach((failure) => {
      lines.push(`### ${failure.scenarioId}`);
      lines.push('');
      lines.push(`- Prompt: ${failure.prompt}`);
      lines.push(`- Reason: ${failure.reason}`);
      // PR-B.2: surface the rule-routable category for triage.
      lines.push(
        `- Category: ${failure.category ?? 'unknown'}` + (failure.ruleHint ? ` (auto-fix: ${failure.ruleHint})` : ''),
      );
      lines.push(`- Validator errors: ${failure.validatorErrors.join('; ') || 'none'}`);
      lines.push(`- Semantic failures: ${failure.semanticFailures.join('; ') || 'none'}`);
      lines.push(`- Unrelated changes: ${failure.unrelatedChanges.join('; ') || 'none'}`);
      lines.push('');
    });
  }

  fs.writeFileSync(latestMdPath, `${lines.join('\n')}\n`);

  summary.results
    .filter((result) => result.status !== 'passed')
    .forEach((result) => {
      fs.writeFileSync(
        path.join(outputDir, 'failures', `${result.scenarioId}.json`),
        `${JSON.stringify(result, null, 2)}\n`,
      );
    });

  summary.results.forEach((result) => {
    if (result.initialDocument) {
      fs.writeFileSync(
        path.join(outputDir, 'snapshots', `${result.scenarioId}.before.json`),
        `${JSON.stringify(result.initialDocument, null, 2)}\n`,
      );
    }
    if (result.finalDocument) {
      fs.writeFileSync(
        path.join(outputDir, 'snapshots', `${result.scenarioId}.after.json`),
        `${JSON.stringify(result.finalDocument, null, 2)}\n`,
      );
    }
  });

  return { latestJsonPath, latestMdPath };
}
