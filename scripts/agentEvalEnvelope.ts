#!/usr/bin/env tsx
import fs from 'node:fs';

interface GoldenEnvelope {
  schema: string;
  type: string;
  ts: string;
  payload: unknown;
}

function loadJsonl(text: string): GoldenEnvelope[] {
  const lines = text.split('\n').filter(Boolean);
  return lines.map((line) => {
    // Strip optional "data: " prefix (SSE wire format)
    const json = line.startsWith('data: ') ? line.slice(6) : line;
    return JSON.parse(json) as GoldenEnvelope;
  });
}

function loadJsonArray(text: string): GoldenEnvelope[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  // If the content looks like a JSON document, try parsing as a single array
  // or object first. This supports pretty-printed fixtures in addition to JSONL.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as GoldenEnvelope[];
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return [parsed as GoldenEnvelope];
      }
    } catch {
      // Fall through to JSONL parsing below
    }
  }

  return loadJsonl(text);
}

function loadEnvelopes(filePath: string, isGolden: boolean): GoldenEnvelope[] {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const isJsonl = filePath.endsWith('.jsonl');
    return isJsonl ? loadJsonl(text) : loadJsonArray(text);
  } catch (err) {
    process.stderr.write(`Failed to load ${isGolden ? 'golden' : 'actual'} file: ${filePath}\n`);
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

function compareEnvelopes(
  golden: GoldenEnvelope[],
  actual: GoldenEnvelope[],
): { typeMatches: boolean; payloadDiffs: number; lengthMatches: boolean } {
  const goldenTypes = golden.map((e) => e.type);
  const actualTypes = actual.map((e) => e.type);
  const typeMatches = JSON.stringify(goldenTypes) === JSON.stringify(actualTypes);
  const lengthMatches = golden.length === actual.length;

  let payloadDiffs = 0;
  const compareLen = Math.min(golden.length, actual.length);
  for (let i = 0; i < compareLen; i++) {
    if (JSON.stringify(golden[i].payload) !== JSON.stringify(actual[i].payload)) {
      payloadDiffs++;
    }
  }
  return { typeMatches, payloadDiffs, lengthMatches };
}

function main(): void {
  const goldenPath = process.argv[2];
  const actualPath = process.argv[3];
  if (!goldenPath || !actualPath) {
    process.stderr.write('Usage: tsx scripts/agentEvalEnvelope.ts <golden.json|jsonl> <actual.jsonl>\n');
    process.exit(1);
  }

  const golden = loadEnvelopes(goldenPath, true);
  const actual = loadEnvelopes(actualPath, false);

  const result = compareEnvelopes(golden, actual);

  process.stdout.write(`Golden: ${golden.length} events\n`);
  process.stdout.write(`Actual: ${actual.length} events\n`);

  if (!result.lengthMatches) {
    process.stderr.write(`Length mismatch: golden=${golden.length} actual=${actual.length}\n`);
    process.exit(1);
  }
  if (!result.typeMatches) {
    process.stderr.write('Type sequence mismatch:\n');
    const goldenTypes = golden.map((e) => e.type);
    const actualTypes = actual.map((e) => e.type);
    for (let i = 0; i < Math.max(goldenTypes.length, actualTypes.length); i++) {
      if (goldenTypes[i] !== actualTypes[i]) {
        process.stderr.write(`  [${i}] golden=${goldenTypes[i]} actual=${actualTypes[i]}\n`);
      }
    }
    process.exit(1);
  }
  if (result.payloadDiffs > 0) {
    process.stderr.write(`❌ Payload diffs: ${result.payloadDiffs} of ${golden.length} events differ\n`);
    let shown = 0;
    const compareLen = Math.min(golden.length, actual.length);
    for (let i = 0; i < compareLen && shown < 3; i++) {
      if (JSON.stringify(golden[i].payload) !== JSON.stringify(actual[i].payload)) {
        const goldenStr = JSON.stringify(golden[i].payload).slice(0, 100);
        const actualStr = JSON.stringify(actual[i].payload).slice(0, 100);
        process.stderr.write(`  [${i}] expected=${goldenStr} actual=${actualStr}\n`);
        shown++;
      }
    }
    process.exit(1);
  }

  process.stdout.write('Match: all envelopes identical\n');
  process.exit(0);
}

main();
