#!/usr/bin/env tsx
/* eslint-disable no-console -- CLI runner needs stdout output */
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
    console.error(`Failed to load ${isGolden ? 'golden' : 'actual'} file: ${filePath}`);
    console.error(err instanceof Error ? err.message : String(err));
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
    console.error('Usage: tsx scripts/agentEvalEnvelope.ts <golden.json|jsonl> <actual.jsonl>');
    process.exit(1);
  }

  const golden = loadEnvelopes(goldenPath, true);
  const actual = loadEnvelopes(actualPath, false);

  const result = compareEnvelopes(golden, actual);

  console.log(`Golden: ${golden.length} events`);
  console.log(`Actual: ${actual.length} events`);

  if (!result.lengthMatches) {
    console.error(`Length mismatch: golden=${golden.length} actual=${actual.length}`);
    process.exit(1);
  }
  if (!result.typeMatches) {
    console.error('Type sequence mismatch:');
    const goldenTypes = golden.map((e) => e.type);
    const actualTypes = actual.map((e) => e.type);
    for (let i = 0; i < Math.max(goldenTypes.length, actualTypes.length); i++) {
      if (goldenTypes[i] !== actualTypes[i]) {
        console.error(`  [${i}] golden=${goldenTypes[i]} actual=${actualTypes[i]}`);
      }
    }
    process.exit(1);
  }
  if (result.payloadDiffs > 0) {
    console.error(`❌ Payload diffs: ${result.payloadDiffs} of ${golden.length} events differ`);
    let shown = 0;
    const compareLen = Math.min(golden.length, actual.length);
    for (let i = 0; i < compareLen && shown < 3; i++) {
      if (JSON.stringify(golden[i].payload) !== JSON.stringify(actual[i].payload)) {
        const goldenStr = JSON.stringify(golden[i].payload).slice(0, 100);
        const actualStr = JSON.stringify(actual[i].payload).slice(0, 100);
        console.error(`  [${i}] expected=${goldenStr} actual=${actualStr}`);
        shown++;
      }
    }
    process.exit(1);
  }

  console.log('Match: all envelopes identical');
  process.exit(0);
}

main();
