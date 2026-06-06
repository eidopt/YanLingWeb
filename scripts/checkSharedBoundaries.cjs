const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs']);
const sharedAgentPrefix = '@shared/agent/';

const boundaryConfigs = [
  {
    label: 'frontend',
    roots: ['src'],
    allowedSegments: new Set(['browser', 'contracts', 'tools']),
    allowedDescription: 'browser/contracts/tools',
    rejectRuntimeSubpaths: false,
  },
  {
    label: 'backend/eval',
    roots: ['backend/src'],
    allowedSegments: new Set(['contracts', 'runtime', 'tools']),
    allowedDescription: 'contracts/runtime/tools',
    rejectRuntimeSubpaths: true,
  },
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walkFiles(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.next')) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, output);
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

function extractSharedAgentImports(source) {
  const imports = [];
  const patterns = [
    /from\s+['"](?<specifier>@shared\/agent\/[^'"]+)['"]/g,
    /import\s*\(\s*['"](?<specifier>@shared\/agent\/[^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      imports.push(match.groups.specifier);
    }
  }
  return imports;
}

function classifySpecifier(specifier, config) {
  const rest = specifier.slice(sharedAgentPrefix.length);
  const segment = rest.split('/')[0];
  if (!config.allowedSegments.has(segment)) {
    return `${config.label} imports may use only ${config.allowedDescription}; "${segment}" is not a public ${config.label} segment`;
  }
  if (config.rejectRuntimeSubpaths && segment === 'runtime' && rest !== 'runtime') {
    return 'backend/eval imports must use the @shared/agent/runtime barrel, not runtime subpaths';
  }
  return null;
}

function main() {
  const violations = [];
  for (const config of boundaryConfigs) {
    for (const sourceRoot of config.roots) {
      const root = path.join(repoRoot, sourceRoot);
      if (!fs.existsSync(root)) {
        continue;
      }
      for (const filePath of walkFiles(root)) {
        const relativePath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
        const source = readText(filePath);
        for (const specifier of extractSharedAgentImports(source)) {
          const reason = classifySpecifier(specifier, config);
          if (reason) {
            violations.push(`${relativePath}: ${specifier} - ${reason}`);
          }
        }
      }
    }
  }

  if (violations.length) {
    throw new Error(
      [
        'Shared agent boundary check failed.',
        'Frontend code may import only browser/contracts/tools surfaces.',
        'Backend/eval code may import only contracts/runtime/tools surfaces; runtime implementation must use the @shared/agent/runtime barrel.',
        ...violations.map((violation) => `  - ${violation}`),
      ].join('\n'),
    );
  }

  console.log('Shared agent boundary check passed.');
}

main();
