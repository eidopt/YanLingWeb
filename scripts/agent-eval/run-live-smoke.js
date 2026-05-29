#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const scenarioPath = path.resolve('scripts/agent-eval/scenarios.json');
const outputDir = path.resolve(process.env.AGENT_EVAL_OUTPUT_DIR ?? 'output/agent-eval');

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.AGENT_EVAL_BASE_URL ?? 'http://localhost:4000/api',
    required: process.env.AGENT_EVAL_LIVE_SMOKE_REQUIRED === 'true',
    scenarioIds: (process.env.AGENT_EVAL_LIVE_SMOKE_SCENARIOS ?? 'component-add-001')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    timeoutMs: Number(process.env.AGENT_EVAL_SCENARIO_TIMEOUT_MS ?? 120000),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') {
      args.baseUrl = argv[++index];
    } else if (arg === '--scenario') {
      args.scenarioIds = [argv[++index]];
    } else if (arg === '--scenarios') {
      args.scenarioIds = argv[++index]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === '--timeout-ms') {
      args.timeoutMs = Number(argv[++index]);
    } else if (arg === '--required') {
      args.required = true;
    }
  }

  return args;
}

function loadScenarios(ids) {
  const scenarios = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
  const selected = scenarios.filter((scenario) => ids.includes(scenario.id));
  const missing = ids.filter((id) => !selected.some((scenario) => scenario.id === id));
  if (missing.length > 0) {
    throw new Error(`Live smoke scenario(s) not found: ${missing.join(', ')}`);
  }
  return selected;
}

function shouldSkipForMissingProvider(message) {
  return /AI_API_KEY is not configured|Missing AI_API_KEY|Missing DEEPSEEK_API_KEY/i.test(message);
}

function shouldSkipForUnavailableBackend(error) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : undefined;
  const code =
    cause && typeof cause === 'object' && 'code' in cause && typeof cause.code === 'string' ? cause.code : '';
  return (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ENOTFOUND' ||
    /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(message)
  );
}

function summarize(results, skippedReason) {
  const passed = results.filter((result) => result.status === 'passed').length;
  const skipped = results.filter((result) => result.status === 'skipped').length;
  const failed = results.filter((result) => result.status !== 'passed' && result.status !== 'skipped').length;
  return {
    mode: 'live-smoke',
    status: skippedReason ? 'skipped' : failed === 0 ? 'passed' : 'failed',
    skippedReason,
    total: results.length,
    passed,
    skipped,
    failed,
    passRate: results.length > 0 ? passed / results.length : 0,
    results,
    generatedAt: new Date().toISOString(),
  };
}

function writeReport(summary) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'live-smoke-latest.json');
  const mdPath = path.join(outputDir, 'live-smoke-latest.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    mdPath,
    [
      '# Agent Live Smoke',
      '',
      `Status: ${summary.status}`,
      summary.skippedReason ? `Skipped reason: ${summary.skippedReason}` : '',
      `Scenarios: ${summary.total}`,
      `Passed: ${summary.passed}`,
      `Skipped: ${summary.skipped}`,
      `Failed: ${summary.failed}`,
      '',
      ...summary.results.map((result) => `- ${result.status}: ${result.scenarioId}`),
      '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  );
  return { jsonPath, mdPath };
}

async function runScenario(baseUrl, timeoutMs, scenario) {
  const response = await fetch(`${baseUrl}/ai/agent-eval/live`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(scenario),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`backend eval returned ${response.status}: ${text}`);
  }

  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenarios = loadScenarios(args.scenarioIds);
  const results = [];
  let skippedReason = '';

  for (const scenario of scenarios) {
    try {
      const result = await runScenario(args.baseUrl, args.timeoutMs, scenario);
      if (result?.error && shouldSkipForMissingProvider(String(result.error))) {
        skippedReason = String(result.error);
        results.push({ scenarioId: scenario.id, status: 'skipped', error: skippedReason });
        break;
      }
      results.push(result);
      const status = result.status === 'passed' ? 'PASS' : 'FAIL';
      console.log(`[${status}] ${scenario.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (shouldSkipForMissingProvider(message) || shouldSkipForUnavailableBackend(error)) {
        skippedReason = message;
        results.push({ scenarioId: scenario.id, status: 'skipped', error: skippedReason });
        break;
      }
      throw error;
    }
  }

  const summary = summarize(results, skippedReason);
  const reportPaths = writeReport(summary);
  if (summary.status === 'skipped') {
    console.log(`[SKIP] Agent live smoke: ${summary.skippedReason}`);
  } else {
    console.log(`Agent live smoke: ${summary.passed}/${summary.total} passed`);
  }
  console.log(`JSON: ${reportPaths.jsonPath}`);
  console.log(`Markdown: ${reportPaths.mdPath}`);

  if ((summary.status === 'skipped' && args.required) || summary.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
