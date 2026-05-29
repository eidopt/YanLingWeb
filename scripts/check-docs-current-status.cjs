const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

const files = {
  docsIndex: path.join(repoRoot, 'docs', 'README.md'),
  currentStatus: path.join(repoRoot, 'docs', 'current-implementation-status.md'),
  sourceExportMatrix: path.join(repoRoot, 'docs', 'source-export-interaction-matrix.md'),
  sourceExportAsyncDataDesign: path.join(repoRoot, 'docs', 'source-export-async-data-design.md'),
  moduleBoundaryAudit: path.join(repoRoot, 'docs', 'module-boundary-migration-audit.md'),
  defectProgress: path.join(repoRoot, 'reports', '03-code-framework-defects-progress.md'),
  stageSummary: path.join(repoRoot, 'reports', '03-defects-stage-summary.md'),
  historicalDocs: [
    path.join(repoRoot, 'docs', 'agent-low-code-generation-plan.md'),
    path.join(repoRoot, 'docs', 'dual-export-strategy-and-e2e-plan.md'),
    path.join(repoRoot, 'docs', 'dual-export-implementation-plan.md'),
    path.join(repoRoot, 'docs', 'deepseek-high-cache-hit-strategy.md'),
    path.join(repoRoot, 'docs', 'architect-refactor.md'),
  ],
  liveRunbooks: [path.join(repoRoot, 'docs', 'database-migration-runbook.md')],
};

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function fail(message) {
  throw new Error(`Docs current-status check failed: ${message}`);
}

function requireSnippet(label, text, snippet) {
  if (!text.includes(snippet)) {
    fail(`${label} must include "${snippet}"`);
  }
}

function readLastUpdated(label, text) {
  const match = /^Last updated:\s*(\d{4}-\d{2}-\d{2})$/m.exec(text);
  if (!match) {
    fail(`${label} must include a "Last updated: YYYY-MM-DD" line`);
  }
  return match[1];
}

function assertSection(label, text, heading) {
  requireSnippet(label, text, `## ${heading}`);
}

const docsIndex = readText(files.docsIndex);
const currentStatus = readText(files.currentStatus);
const sourceExportMatrix = readText(files.sourceExportMatrix);
const sourceExportAsyncDataDesign = readText(files.sourceExportAsyncDataDesign);
const moduleBoundaryAudit = readText(files.moduleBoundaryAudit);
const defectProgress = readText(files.defectProgress);
const stageSummary = readText(files.stageSummary);
const doubleAssertionText = 'as unknown' + ' as';

const currentStatusDate = readLastUpdated('docs/current-implementation-status.md', currentStatus);
const defectProgressDate = readLastUpdated('reports/03-code-framework-defects-progress.md', defectProgress);
if (currentStatusDate !== defectProgressDate) {
  fail(
    `docs/current-implementation-status.md date ${currentStatusDate} must match ` +
      `reports/03-code-framework-defects-progress.md date ${defectProgressDate}`,
  );
}

[
  'current-implementation-status.md',
  '../reports/03-code-framework-defects-progress.md',
  '../reports/03-defects-stage-summary.md',
  'source-export-interaction-matrix.md',
  'source-export-async-data-design.md',
  'module-boundary-migration-audit.md',
  'C:\\Users\\Administrator\\.codex\\memories\\YanLingWeb.md',
  'Maintenance Rule',
  'historical',
  'live database migration and rollback runbook',
].forEach((snippet) => requireSnippet('docs/README.md', docsIndex, snippet));

for (const filePath of files.historicalDocs) {
  const label = path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
  const text = readText(filePath);
  requireSnippet(label, text, 'Document status:');
  requireSnippet(label, text, 'docs/current-implementation-status.md');
  requireSnippet(label, text, 'reports/03-code-framework-defects-progress.md');
}

for (const filePath of files.liveRunbooks) {
  const label = path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
  const text = readText(filePath);
  requireSnippet(label, text, 'Document status: Live runbook.');
}

[
  'Workspace Rules',
  'Backend',
  'Frontend',
  'Shared Agent Boundary',
  'Renderer And Export',
  'Testing And Quality Gates',
  'Active Known Gaps',
].forEach((heading) => assertSection('docs/current-implementation-status.md', currentStatus, heading));

[
  'Package manager is `pnpm` only.',
  `Avoid \`${doubleAssertionText}\`; use explicit guards or converters at JSON/data`,
  '@next/eslint-plugin-next',
  'prettier.config.mjs` derives Prettier `printWidth`',
  'pnpm shared:module-format:check',
  'Backend still builds as CommonJS',
  'localStorage restore coverage',
  'matrix tests plus optional live-provider smoke',
  'coverage still needs expansion',
  'pnpm agent:live-smoke',
  'pnpm module-boundaries:audit',
  'AGENT_EVAL_LIVE_SMOKE_REQUIRED=true',
  'multi-domain generation',
  'unrelated-diff failure detection',
  'Complex source-export interactions beyond generated local components',
  'docs/source-export-interaction-matrix.md',
  'docs/source-export-async-data-design.md',
  'docs/module-boundary-migration-audit.md',
  'long-term 80% backend coverage target is not reached yet',
  'not physically',
].forEach((snippet) => requireSnippet('docs/current-implementation-status.md', currentStatus, snippet));

[
  'Document status: Live capability matrix.',
  'Supported',
  'Degraded',
  'Unsupported',
  'Next Implementation Batch',
  '`core.tabs`',
  '`core.widget`',
  'cross-component workflows',
  'async data',
  'app-specific launch triggers',
  'source-export-async-data-design.md',
  'pnpm test:source-export',
].forEach((snippet) => requireSnippet('docs/source-export-interaction-matrix.md', sourceExportMatrix, snippet));

[
  'Document status: Accepted design',
  'ThemeLayoutDataSource',
  'ThemeLayoutDataBinding',
  'staticJson',
  'publicJsonEndpoint',
  'src/data/useExportedData.ts',
  'AsyncDataBoundary',
  'Validation Rules',
  'Verification Plan',
  'do not double-cast through',
].forEach((snippet) => requireSnippet('docs/source-export-async-data-design.md', sourceExportAsyncDataDesign, snippet));

[
  'Document status: Live migration audit.',
  'pnpm module-boundaries:audit',
  'Backend ESM Migration Blockers',
  'Shared Physical Split Candidate',
  'Migration Sequence',
  'Acceptance Evidence',
  'shared-agent-runtime',
  'shared-agent-browser',
].forEach((snippet) => requireSnippet('docs/module-boundary-migration-audit.md', moduleBoundaryAudit, snippet));

[
  'Current Rules',
  'Completed Or Substantially Fixed',
  'Partial Or Still Needs Stronger Evidence',
  'Verification Recently Run',
  'Package manager: `pnpm` only.',
  `Avoid \`${doubleAssertionText}\`; use explicit guards/converters at data boundaries.`,
  '| 8.3 Docs/code sync',
  'pnpm agent:live-smoke',
  'source-export-async-data-design.md',
  'module-boundaries:audit',
].forEach((snippet) => requireSnippet('reports/03-code-framework-defects-progress.md', defectProgress, snippet));

[
  'Last updated:',
  'docs/current-implementation-status.md',
  'reports/03-code-framework-defects-progress.md',
  'reports/03-defects-stage-summary.md',
  'Next ESLint core-web-vitals guard',
  'docs/source-export-interaction-matrix.md',
  'docs/source-export-async-data-design.md',
  'pnpm agent:live-smoke',
  'shared physical split',
  'backend ESM',
  'module-boundaries:audit',
].forEach((snippet) => requireSnippet('reports/03-defects-stage-summary.md', stageSummary, snippet));

console.log('Docs current-status check passed.');
