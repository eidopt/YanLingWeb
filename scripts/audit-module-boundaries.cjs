#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function walkFiles(directory, extensions, output = []) {
  if (!fs.existsSync(directory)) {
    return output;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolutePath, extensions, output);
    } else if (extensions.has(path.extname(entry.name))) {
      output.push(absolutePath);
    }
  }
  return output;
}

function countMatchingScripts(scripts, pattern) {
  return Object.entries(scripts).filter(([, command]) => pattern.test(command));
}

function extractImports(source) {
  const imports = [];
  const patterns = [/from\s+['"](?<specifier>[^'"]+)['"]/g, /import\s*\(\s*['"](?<specifier>[^'"]+)['"]\s*\)/g];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      imports.push(match.groups.specifier);
    }
  }
  return imports;
}

function summarizeSharedAgentImports(rootNames) {
  const segmentCounts = new Map();
  const fileCounts = new Map();
  for (const rootName of rootNames) {
    const root = path.join(repoRoot, rootName);
    for (const filePath of walkFiles(root, new Set(['.ts', '.tsx']))) {
      const source = fs.readFileSync(filePath, 'utf8');
      const sharedImports = extractImports(source).filter((specifier) => specifier.startsWith('@shared/agent/'));
      if (!sharedImports.length) {
        continue;
      }
      const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      fileCounts.set(relativePath, sharedImports.length);
      for (const specifier of sharedImports) {
        const segment = specifier.slice('@shared/agent/'.length).split('/')[0];
        segmentCounts.set(segment, (segmentCounts.get(segment) ?? 0) + 1);
      }
    }
  }
  return {
    files: [...fileCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
    segments: [...segmentCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  };
}

function summarizeRelativeImportsWithoutExtensions() {
  const missing = [];
  for (const filePath of walkFiles(path.join(repoRoot, 'backend', 'src'), new Set(['.ts']))) {
    const source = fs.readFileSync(filePath, 'utf8');
    const specifiers = extractImports(source).filter((specifier) => {
      if (!specifier.startsWith('.')) {
        return false;
      }
      return !path.extname(specifier);
    });
    if (specifiers.length) {
      missing.push({
        file: path.relative(repoRoot, filePath).replace(/\\/g, '/'),
        count: specifiers.length,
      });
    }
  }
  return missing;
}

function assertEvidence(condition, message) {
  if (!condition) {
    throw new Error(`Module boundary audit evidence missing: ${message}`);
  }
}

const rootPackage = readJson('package.json');
const backendPackage = readJson('backend/package.json');
const backendTsconfig = readJson('backend/tsconfig.json');
const backendJestConfig = readText('backend/jest.config.js');
const backendMigrationScripts = countMatchingScripts(backendPackage.scripts ?? {}, /typeorm-ts-node-commonjs/);
const backendTsNodeScripts = countMatchingScripts(rootPackage.scripts ?? {}, /ts-node|tsconfig-paths/);
const relativeImportsWithoutExtensions = summarizeRelativeImportsWithoutExtensions();
const frontendSharedAgent = summarizeSharedAgentImports(['src']);
const backendSharedAgent = summarizeSharedAgentImports(['backend/src']);

const audit = {
  backendEsm: {
    packageType: backendPackage.type ?? '(not set)',
    tsModule: backendTsconfig.compilerOptions?.module,
    hasSharedPathAlias: Boolean(backendTsconfig.compilerOptions?.paths?.['@shared/*']),
    migrationScriptsUsingCommonjsCli: backendMigrationScripts.map(([name]) => name),
    rootScriptsUsingTsNodePaths: backendTsNodeScripts.map(([name]) => name),
    jestUsesTsJest: backendJestConfig.includes('ts-jest'),
    jestUsesModuleNameMapperForShared: backendJestConfig.includes('moduleNameMapper'),
    relativeImportsWithoutExtensions: {
      files: relativeImportsWithoutExtensions.length,
      imports: relativeImportsWithoutExtensions.reduce((sum, item) => sum + item.count, 0),
    },
  },
  sharedPhysicalSplit: {
    frontendAgentSegments: Object.fromEntries(frontendSharedAgent.segments),
    frontendFilesWithAgentImports: frontendSharedAgent.files.length,
    backendAgentSegments: Object.fromEntries(backendSharedAgent.segments),
    backendFilesWithAgentImports: backendSharedAgent.files.length,
  },
};

assertEvidence(rootPackage.type === 'module', 'root package should remain ESM while auditing backend mismatch');
assertEvidence(backendTsconfig.compilerOptions?.module === 'commonjs', 'backend tsconfig commonjs module evidence');
assertEvidence(backendMigrationScripts.length > 0, 'TypeORM CommonJS migration CLI scripts');
assertEvidence(backendJestConfig.includes('ts-jest'), 'backend Jest ts-jest transformer evidence');
assertEvidence(frontendSharedAgent.files.length > 0, 'frontend @shared/agent import graph');
assertEvidence(backendSharedAgent.files.length > 0, 'backend @shared/agent import graph');

console.log(JSON.stringify(audit, null, 2));
