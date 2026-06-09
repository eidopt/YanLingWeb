#!/usr/bin/env tsx
/* eslint-disable no-console -- CLI runner needs stdout output */
import fs from 'node:fs';
import path from 'node:path';

interface GoldenEnvelope {
  schema: string;
  type: string;
  ts: string;
  payload: unknown;
}

function loadJsonl(filePath: string): GoldenEnvelope[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split('\n').filter(Boolean);
  return lines.map((line) => {
    // Strip optional "data: " prefix (SSE wire format)
    const json = line.startsWith('data: ') ? line.slice(6) : line;
    return JSON.parse(json) as GoldenEnvelope;
  });
}

function loadJson(filePath: string): GoldenEnvelope[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(text) as GoldenEnvelope[];
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

  const golden = goldenPath.endsWith('.jsonl') ? loadJsonl(goldenPath) : loadJson(goldenPath);
  const actual = loadJsonl(actualPath);

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
    console.error(`Payload diffs: ${result.payloadDiffs} of ${golden.length} events differ`);
    process.exit(1);
  }

  console.log('Match: all envelopes identical');
  process.exit(0);
}

main();
