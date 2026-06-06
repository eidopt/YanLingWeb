#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const sharedRoot = path.join(repoRoot, 'shared');
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts']);

const disallowedPatterns = [
  { name: 'CommonJS require()', pattern: /\brequire\s*\(/ },
  { name: 'CommonJS module.exports', pattern: /\bmodule\s*\.\s*exports\b/ },
  { name: 'CommonJS exports.*', pattern: /\bexports\s*\./ },
  { name: 'TypeScript export =', pattern: /\bexport\s*=/ },
];

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(absolutePath);
    }
    return sourceExtensions.has(path.extname(entry.name)) ? [absolutePath] : [];
  });
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const violations = [];

for (const filePath of walk(sharedRoot)) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rule of disallowedPatterns) {
    const match = rule.pattern.exec(content);
    if (!match) {
      continue;
    }
    violations.push({
      rule: rule.name,
      file: path.relative(repoRoot, filePath),
      line: lineNumberForIndex(content, match.index),
    });
  }
}

if (violations.length > 0) {
  console.error('Shared module format check failed. shared/**/*.ts must stay ESM-only.');
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.rule}`);
  }
  process.exit(1);
}

console.log('Shared module format check passed.');
