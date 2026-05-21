#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { writeReports } from './report-writer.js';

function parseArgs(argv) {
  const args = {
    inputs: [],
    cacheWarmupCount: Number(process.env.AGENT_EVAL_CACHE_WARMUP_COUNT ?? 3),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      args.inputs.push(argv[++index]);
    } else if (arg === '--output') {
      args.output = argv[++index];
    } else if (arg === '--target-cache-hit-rate') {
      args.targetCacheHitRate = Number(argv[++index]);
    } else if (arg === '--target-pass-rate') {
      args.targetPassRate = Number(argv[++index]);
    } else if (arg === '--cache-warmup-count') {
      args.cacheWarmupCount = Number(argv[++index]);
    }
  }
  return args;
}

function readSummary(input) {
  const filePath = path.resolve(input, 'latest.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function aggregate(summaries, targetCacheHitRate, cacheWarmupCount = 3) {
  const results = summaries.flatMap((summary) => summary.results ?? []);
  const total = results.length;
  const passed = results.filter((result) => result.status === 'passed').length;
  const errored = results.filter((result) => result.status === 'errored').length;
  const failed = total - passed;
  const cacheHitTokens = results.reduce((sum, result) => sum + (result.tokenUsage?.cacheHitTokens || 0), 0);
  const cacheMissTokens = results.reduce((sum, result) => sum + (result.tokenUsage?.cacheMissTokens || 0), 0);
  const cacheTotalTokens = cacheHitTokens + cacheMissTokens;
  const cacheHitRate = cacheTotalTokens > 0 ? cacheHitTokens / cacheTotalTokens : 0;
  const normalizedWarmupCount = Number.isFinite(cacheWarmupCount)
    ? Math.max(0, Math.floor(cacheWarmupCount))
    : 0;
  const postWarmupResults = results.slice(Math.min(normalizedWarmupCount, results.length));
  const postWarmupCacheHitTokens = postWarmupResults
    .reduce((sum, result) => sum + (result.tokenUsage?.cacheHitTokens || 0), 0);
  const postWarmupCacheMissTokens = postWarmupResults
    .reduce((sum, result) => sum + (result.tokenUsage?.cacheMissTokens || 0), 0);
  const postWarmupCacheTotalTokens = postWarmupCacheHitTokens + postWarmupCacheMissTokens;
  const postWarmupCacheHitRate = postWarmupCacheTotalTokens > 0
    ? postWarmupCacheHitTokens / postWarmupCacheTotalTokens
    : 0;
  const prefixHashes = [
    ...new Set(results.map((result) => result.cacheDiagnostics?.prefixHash).filter(Boolean)),
  ];
  const toolHashes = [
    ...new Set(results.map((result) => result.cacheDiagnostics?.toolHash).filter(Boolean)),
  ];
  const toolCallCount = results.filter((result) => result.toolCalls?.length > 0).length;
  const renderPassed = results.filter((result) => result.render?.passed).length;
  const partialSuccess = results.filter((result) => (
    result.status !== 'passed'
    && result.validation?.valid
    && (result.semantic?.taskScore ?? 0) > 0
  )).length;
  const failures = results.filter((result) => result.status !== 'passed').map((result) => ({
    scenarioId: result.scenarioId,
    prompt: result.prompt,
    reason: result.error || result.status,
    validatorErrors: (result.validation?.errors ?? []).map((item) => item.message),
    semanticFailures: (result.semantic?.failures ?? []).map((item) => item.message),
    unrelatedChanges: (result.unrelatedDiff?.unrelatedChanges ?? []).map((item) => item.path),
  }));

  return {
    mode: summaries[0]?.mode ?? 'live',
    total,
    passed,
    failed,
    errored,
    passRate: total ? passed / total : 0,
    errorRate: total ? errored / total : 0,
    toolCallRate: total ? toolCallCount / total : 0,
    structurePassRate: total ? results.filter((result) => result.validation?.valid).length / total : 0,
    semanticPassRate: total ? results.filter((result) => result.semantic?.passed).length / total : 0,
    renderPassRate: total ? renderPassed / total : 0,
    unrelatedDiffFailureRate: total ? results.filter((result) => !result.unrelatedDiff?.passed).length / total : 0,
    partialSuccess,
    averageDurationMs: results.reduce((sum, result) => sum + (result.durationMs || 0), 0) / Math.max(1, total),
    cacheHitTokens,
    cacheMissTokens,
    cacheHitRate,
    cacheMissTokensPerRequest: cacheMissTokens / Math.max(1, total),
    cacheWarmupCount: normalizedWarmupCount,
    postWarmupCacheHitTokens,
    postWarmupCacheMissTokens,
    postWarmupCacheHitRate,
    postWarmupCacheMissTokensPerRequest: postWarmupCacheMissTokens / Math.max(1, postWarmupResults.length),
    prefixHashCount: prefixHashes.length,
    toolHashCount: toolHashes.length,
    prefixHashes,
    toolHashes,
    targetCacheHitRate,
    cacheHitRateMet: targetCacheHitRate === undefined ? undefined : cacheHitRate >= targetCacheHitRate,
    failures,
    results,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputs.length) {
    throw new Error('At least one --input directory is required');
  }
  if (!args.output) {
    throw new Error('--output is required');
  }

  const summaries = args.inputs.map(readSummary);
  const summary = aggregate(summaries, args.targetCacheHitRate, args.cacheWarmupCount);
  const reportPaths = writeReports(path.resolve(args.output), summary);

  console.log(`Aggregated ${summary.total} results`);
  console.log(`Agent eval: ${summary.passed}/${summary.total} passed (${(summary.passRate * 100).toFixed(1)}%)`);
  console.log(
    `Cache hit rate: ${(summary.cacheHitRate * 100).toFixed(1)}% `
    + `(hit=${summary.cacheHitTokens}, miss=${summary.cacheMissTokens})`,
  );
  console.log(
    `Post-warmup cache hit rate: ${(summary.postWarmupCacheHitRate * 100).toFixed(1)}% `
    + `(skip=${summary.cacheWarmupCount}, hit=${summary.postWarmupCacheHitTokens}, `
    + `miss=${summary.postWarmupCacheMissTokens})`,
  );
  console.log(
    `Cache miss/request: ${summary.cacheMissTokensPerRequest.toFixed(1)} `
    + `(post-warmup ${summary.postWarmupCacheMissTokensPerRequest.toFixed(1)})`,
  );
  console.log(`Prefix hashes: ${summary.prefixHashCount}; tool hashes: ${summary.toolHashCount}`);
  if (summary.targetCacheHitRate !== undefined) {
    console.log(`Cache target: ${(summary.targetCacheHitRate * 100).toFixed(1)}% (${summary.cacheHitRateMet ? 'met' : 'missed'})`);
  }
  console.log(`JSON: ${reportPaths.latestJsonPath}`);
  console.log(`Markdown: ${reportPaths.latestMdPath}`);

  if (Number.isFinite(args.targetPassRate) && summary.passRate < args.targetPassRate) {
    process.exitCode = 1;
  }
  if (summary.cacheHitRateMet === false) {
    process.exitCode = 1;
  }
}

main();
