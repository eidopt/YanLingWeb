#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const scenarioPath = path.resolve('scripts/agent-eval/scenarios.json');
const outputDir = path.resolve(process.env.AGENT_EVAL_OUTPUT_DIR ?? 'output/agent-eval');

function parseArgs(argv) {
  const args = {
    limit: Number(process.env.CACHE_EVAL_LIMIT ?? 100),
    rounds: Number(process.env.CACHE_EVAL_ROUNDS ?? 1),
    target: Number(process.env.CACHE_EVAL_TARGET ?? 0.95),
    delayMs: Number(process.env.CACHE_EVAL_DELAY_MS ?? 750),
    model: process.env.AI_MODEL || process.env.DEV_AI_MODEL || 'deepseek-chat',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--limit') args.limit = Number(argv[++index]);
    else if (arg === '--rounds') args.rounds = Number(argv[++index]);
    else if (arg === '--target') args.target = Number(argv[++index]);
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++index]);
    else if (arg === '--model') args.model = argv[++index];
  }
  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function loadLocalEnv() {
  [
    'backend/.env.dev.local',
    'backend/.env.dev',
    'backend/.env',
    '.env.dev.local',
    '.env.dev',
    '.env',
  ].forEach((file) => loadEnvFile(path.resolve(file)));
}

function readIfExists(filePath, maxChars = 80_000) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8').slice(0, maxChars);
}

function buildStablePrefix() {
  const parts = [
    'You are the YanLingWeb editor AI cache benchmark assistant.',
    'The following project agent contract is stable across all benchmark samples.',
    'Reply with one short sentence. Do not call tools. Do not restate the contract.',
    '',
    '--- shared/agent/prompts/editorCopilotPrompt.ts ---',
    readIfExists(path.resolve('shared/agent/prompts/editorCopilotPrompt.ts')),
    '',
    '--- shared/agent/context/editorContext.ts ---',
    readIfExists(path.resolve('shared/agent/context/editorContext.ts')),
    '',
    '--- backend/src/ai/tools/editor-edit.tool.ts ---',
    readIfExists(path.resolve('backend/src/ai/tools/editor-edit.tool.ts')),
    '',
    '--- scripts/agent-eval/runtime-fixtures.js ---',
    readIfExists(path.resolve('scripts/agent-eval/runtime-fixtures.js'), 60_000),
  ];
  return parts.join('\n');
}

function cacheRate(hit, miss) {
  const total = hit + miss;
  return total > 0 ? hit / total : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestDeepSeek({ apiKey, baseUrl, model, stablePrefix, scenario }) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0,
      max_tokens: 24,
      messages: [
        { role: 'system', content: stablePrefix },
        {
          role: 'user',
          content: [
            `Scenario: ${scenario.id}`,
            `Group: ${scenario.group}`,
            `Mode: ${scenario.mode}`,
            `User request: ${scenario.prompt}`,
            `Expected assertions: ${JSON.stringify(scenario.expected)}`,
            'Answer: cache sample acknowledged.',
          ].join('\n'),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek ${response.status}: ${await response.text()}`);
  }
  const json = await response.json();
  const usage = json.usage || {};
  const promptTokens = usage.prompt_tokens || 0;
  const hit = usage.prompt_cache_hit_tokens || 0;
  const miss = usage.prompt_cache_miss_tokens ?? Math.max(0, promptTokens - hit);
  return {
    scenarioId: scenario.id,
    promptTokens,
    completionTokens: usage.completion_tokens || 0,
    cacheHitTokens: hit,
    cacheMissTokens: miss,
    cacheHitRate: cacheRate(hit, miss),
  };
}

function writeReport(report) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'cache-hitrate-latest.json');
  const mdPath = path.join(outputDir, 'cache-hitrate-latest.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    '# DeepSeek Cache Hit-Rate Report',
    '',
    `- Model: ${report.model}`,
    `- Samples per round: ${report.limit}`,
    `- Rounds run: ${report.roundsRun}`,
    `- Target: ${(report.target * 100).toFixed(1)}%`,
    `- Best cache hit rate: ${(report.bestCacheHitRate * 100).toFixed(1)}%`,
    `- Stable prefix hash: ${report.stablePrefixHash}`,
    '',
    '| Round | Requests | Hit tokens | Miss tokens | Hit rate |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...report.rounds.map((round) => (
      `| ${round.round} | ${round.requests} | ${round.cacheHitTokens} | `
      + `${round.cacheMissTokens} | ${(round.cacheHitRate * 100).toFixed(1)}% |`
    )),
  ];
  fs.writeFileSync(mdPath, `${lines.join('\n')}\n`);
  return { jsonPath, mdPath };
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const apiKey =
    process.env.DEEPSEEK_API_KEY ||
    process.env.DEV_DEEPSEEK_API_KEY ||
    process.env.AI_API_KEY ||
    process.env.DEV_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing DEEPSEEK_API_KEY or AI_API_KEY.');
  }

  const baseUrl =
    process.env.DEEPSEEK_BASE_URL ||
    process.env.DEV_DEEPSEEK_BASE_URL ||
    process.env.AI_BASE_URL ||
    process.env.DEV_AI_BASE_URL ||
    'https://api.deepseek.com';
  const scenarios = JSON.parse(fs.readFileSync(scenarioPath, 'utf8')).slice(0, args.limit);
  if (scenarios.length === 0) {
    throw new Error('No scenarios selected.');
  }

  const stablePrefix = buildStablePrefix();
  const stablePrefixHash = crypto.createHash('sha256').update(stablePrefix).digest('hex').slice(0, 16);
  const rounds = [];
  let bestCacheHitRate = 0;

  for (let round = 1; round <= args.rounds; round += 1) {
    const results = [];
    for (const scenario of scenarios) {
      const result = await requestDeepSeek({
        apiKey,
        baseUrl,
        model: args.model,
        stablePrefix,
        scenario,
      });
      results.push(result);
      console.log(
        `[round ${round}] ${scenario.id} cache=${(result.cacheHitRate * 100).toFixed(1)}% `
        + `hit=${result.cacheHitTokens} miss=${result.cacheMissTokens}`,
      );
      if (args.delayMs > 0) {
        await sleep(args.delayMs);
      }
    }

    const cacheHitTokens = results.reduce((sum, result) => sum + result.cacheHitTokens, 0);
    const cacheMissTokens = results.reduce((sum, result) => sum + result.cacheMissTokens, 0);
    const roundSummary = {
      round,
      requests: results.length,
      cacheHitTokens,
      cacheMissTokens,
      cacheHitRate: cacheRate(cacheHitTokens, cacheMissTokens),
      results,
    };
    rounds.push(roundSummary);
    bestCacheHitRate = Math.max(bestCacheHitRate, roundSummary.cacheHitRate);
    console.log(
      `Round ${round}: ${(roundSummary.cacheHitRate * 100).toFixed(1)}% `
      + `(hit=${cacheHitTokens}, miss=${cacheMissTokens})`,
    );
    if (roundSummary.cacheHitRate >= args.target) {
      break;
    }
  }

  const report = {
    model: args.model,
    baseUrl,
    limit: scenarios.length,
    target: args.target,
    roundsRun: rounds.length,
    bestCacheHitRate,
    stablePrefixHash,
    stablePrefixChars: stablePrefix.length,
    rounds,
  };
  const paths = writeReport(report);
  console.log(`JSON: ${paths.jsonPath}`);
  console.log(`Markdown: ${paths.mdPath}`);

  if (bestCacheHitRate < args.target) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
