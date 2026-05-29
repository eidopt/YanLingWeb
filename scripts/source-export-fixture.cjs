const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${args.join(' ')}`, result.stdout, result.stderr].filter(Boolean).join('\n'),
    );
  }
  return result;
}

function writeProject(projectDir, files) {
  fs.rmSync(projectDir, { recursive: true, force: true });
  for (const file of files) {
    const filePath = path.join(projectDir, file.relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, 'utf8');
  }
}

function createFixtureDocument() {
  return {
    version: 1,
    schemaVersion: 1,
    themeId: 'source-export-fixture',
    themeName: 'Source Export Fixture',
    description: 'Fixture used by source export smoke tests.',
    components: [
      {
        alias: 'fixture-card',
        name: 'Fixture card',
        kind: 'component',
        description: 'Unsupported custom component fixture.',
        props: [],
      },
    ],
    dataSources: [
      {
        id: 'fixture-table-source',
        kind: 'staticJson',
        description: 'Static table rows for source export smoke coverage.',
        data: {
          items: [
            { name: 'Draft brief', status: 'Draft', owner: 'Design' },
            { name: 'Review schema', status: 'Review', owner: 'Engineering' },
            { name: 'Ship source', status: 'Ready', owner: 'QA' },
          ],
        },
        select: 'items',
      },
      {
        id: 'fixture-widget-source',
        kind: 'publicJsonEndpoint',
        description: 'Remote widget data with a static fallback.',
        url: 'https://example.test/source-export-widget.json',
        fallback: {
          option: {
            xAxis: { data: ['Fallback A', 'Fallback B'] },
            series: [{ data: [4, 7] }],
          },
        },
      },
    ],
    defaultPageId: 'home',
    pages: [
      {
        id: 'home',
        name: 'Home',
        layout: {
          id: 'home-screen',
          alias: 'core.screen',
          layout: { mode: 'flow', width: '100%' },
          props: { title: 'Home', headerActionLabel: 'Details' },
          interactions: {
            onActionClick: { type: 'navigate', targetPageId: 'details' },
            onStatusClick: { type: 'navigate', targetPageId: 'details' },
          },
          children: [
            {
              id: 'hero-panel',
              alias: 'core.panel',
              layout: { mode: 'flow', width: '100%' },
              props: {
                tone: 'accent',
                gap: 12,
                style: { backgroundImage: 'url(javascript:alert(1))' },
              },
              children: [
                {
                  id: 'headline',
                  alias: 'core.text',
                  layout: { mode: 'flow' },
                  props: { text: 'Maintainable source export', variant: 'heading' },
                },
                {
                  id: 'search',
                  alias: 'core.search',
                  layout: { mode: 'flow', width: '100%' },
                  props: { placeholder: 'Search generated source' },
                },
                {
                  id: 'hero-carousel',
                  alias: 'core.carousel',
                  layout: { mode: 'flow', width: '100%' },
                  props: {
                    images: ['https://example.test/slide-one.png', 'https://example.test/slide-two.png'],
                  },
                },
                {
                  id: 'cta',
                  alias: 'core.button',
                  layout: { mode: 'flow' },
                  props: { label: 'Open details' },
                  interactions: { onClick: { type: 'navigate', targetPageId: 'details' } },
                },
                {
                  id: 'open-confirm-dialog',
                  alias: 'core.button',
                  layout: { mode: 'flow' },
                  props: { label: 'Open confirm dialog', variant: 'secondary' },
                  interactions: {
                    onClick: { type: 'setVisibility', targetNodeId: 'confirm-dialog', visible: true },
                  },
                },
                {
                  id: 'toggle-settings-drawer',
                  alias: 'core.button',
                  layout: { mode: 'flow' },
                  props: { label: 'Toggle settings drawer', variant: 'secondary' },
                  interactions: {
                    onClick: { type: 'toggleVisibility', targetNodeId: 'settings-drawer' },
                  },
                },
              ],
            },
            {
              id: 'widget',
              alias: 'core.widget',
              layout: { mode: 'flow', width: '100%' },
              props: {
                library: 'echarts',
                renderer: 'echarts',
                data: {
                  option: {
                    xAxis: { data: ['Draft', 'Review', 'Ship'] },
                    series: [{ data: [12, 19, 8] }],
                  },
                },
              },
            },
            {
              id: 'async-widget',
              alias: 'core.widget',
              layout: { mode: 'flow', width: '100%' },
              props: {
                library: 'echarts',
                renderer: 'echarts',
                dataBinding: {
                  sourceId: 'fixture-widget-source',
                  loadingText: 'Loading fixture widget',
                  errorText: 'Fixture widget failed',
                  emptyText: 'No widget data',
                },
              },
            },
            {
              id: 'empty-action',
              alias: 'core.empty',
              layout: { mode: 'flow', width: '100%' },
              props: {
                text: 'No export tasks are blocked.',
                actionLabel: 'Review details',
              },
              interactions: {
                onActionClick: { type: 'navigate', targetPageId: 'details' },
              },
            },
            {
              id: 'closable-alert',
              alias: 'core.alert',
              layout: { mode: 'flow', width: '100%' },
              props: {
                text: 'Closable export alert',
                type: 'warning',
                closable: true,
              },
            },
            {
              id: 'lead-form',
              alias: 'core.form',
              layout: { mode: 'flow', width: '100%' },
              props: {
                labelAlign: 'top',
                successMessage: 'Fixture form submitted',
              },
              children: [
                {
                  id: 'lead-name',
                  alias: 'core.input',
                  layout: { mode: 'flow', width: '100%' },
                  props: { label: 'Name', placeholder: 'Your name' },
                },
                {
                  id: 'lead-consent',
                  alias: 'core.checkbox',
                  layout: { mode: 'flow' },
                  props: { label: 'Agree to export terms', checked: true },
                },
                {
                  id: 'lead-choice-email',
                  alias: 'core.radio',
                  layout: { mode: 'flow' },
                  props: { label: 'Email updates', group: 'lead-choice', checked: true },
                },
                {
                  id: 'lead-notifications',
                  alias: 'core.switch',
                  layout: { mode: 'flow' },
                  props: { label: 'Enable notifications', checked: false },
                },
                {
                  id: 'lead-rating',
                  alias: 'core.rate',
                  layout: { mode: 'flow' },
                  props: { value: 3, count: 5 },
                },
                {
                  id: 'lead-submit',
                  alias: 'core.button',
                  layout: { mode: 'flow' },
                  props: { label: 'Submit form' },
                },
              ],
            },
            {
              id: 'confirm-dialog',
              alias: 'core.dialog',
              layout: { mode: 'flow', width: '100%' },
              props: {
                title: 'Confirm export',
                visible: false,
                confirmText: 'Continue',
                cancelText: 'Dismiss',
              },
              children: [
                {
                  id: 'confirm-dialog-copy',
                  alias: 'core.text',
                  layout: { mode: 'flow' },
                  props: { text: 'Dialog body survives source export.', variant: 'body' },
                },
              ],
            },
            {
              id: 'settings-drawer',
              alias: 'core.drawer',
              layout: { mode: 'flow', width: '100%' },
              props: {
                title: 'Export settings',
                visible: false,
                placement: 'left',
              },
              children: [
                {
                  id: 'settings-drawer-copy',
                  alias: 'core.text',
                  layout: { mode: 'flow' },
                  props: { text: 'Drawer body survives source export.', variant: 'body' },
                },
              ],
            },
          ],
        },
      },
      {
        id: 'details',
        name: 'Details',
        layout: {
          id: 'details-screen',
          alias: 'core.screen',
          layout: { mode: 'flow', width: '100%' },
          props: { title: 'Details' },
          children: [
            {
              id: 'html-block',
              alias: 'core.html',
              layout: { mode: 'flow' },
              props: {
                tag: 'section',
                style: {
                  padding: '12px',
                  backgroundImage: 'url(https://example.test/image.png)',
                },
              },
              children: [
                {
                  id: 'details-copy',
                  alias: 'core.text',
                  layout: { mode: 'flow' },
                  props: { text: 'Editable generated page source', variant: 'body' },
                },
              ],
            },
            {
              id: 'tabs',
              alias: 'core.tabs',
              layout: { mode: 'flow' },
              props: { tabs: ['Home', 'Details'], activeTab: 'Details' },
              interactions: {
                onTabClick: {
                  Home: { type: 'navigate', targetPageId: 'home' },
                  Details: { type: 'navigate', targetPageId: 'details' },
                },
              },
            },
            {
              id: 'results-pagination',
              alias: 'core.pagination',
              layout: { mode: 'flow', width: '100%' },
              props: {
                current: 2,
                total: 42,
                pageSize: 10,
              },
            },
            {
              id: 'async-table',
              alias: 'core.table',
              layout: { mode: 'flow', width: '100%' },
              props: {
                columns: [
                  { title: 'Task', key: 'name' },
                  { title: 'Status', key: 'status' },
                  { title: 'Owner', key: 'owner' },
                ],
                dataBinding: {
                  sourceId: 'fixture-table-source',
                  loadingText: 'Loading fixture table',
                  errorText: 'Fixture table failed',
                  emptyText: 'No fixture rows',
                },
                bordered: true,
                stripe: true,
              },
            },
            {
              id: 'unsupported',
              alias: 'fixture-card',
              layout: { mode: 'flow' },
              props: {},
            },
          ],
        },
      },
    ],
    layout: {
      id: 'home-screen',
      alias: 'core.screen',
      layout: { mode: 'flow', width: '100%' },
      props: { title: 'Home' },
      children: [],
    },
  };
}

function prepareCompiler(workDir) {
  const cjsDir = path.join(workDir, 'cjs');
  fs.mkdirSync(cjsDir, { recursive: true });
  fs.writeFileSync(path.join(cjsDir, 'package.json'), '{"type":"commonjs"}', 'utf8');

  const smokeTsconfig = path.join(workDir, 'tsconfig.cjs.json');
  fs.writeFileSync(
    smokeTsconfig,
    JSON.stringify(
      {
        compilerOptions: {
          ignoreDeprecations: '6.0',
          module: 'commonjs',
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          jsx: 'react-jsx',
          moduleResolution: 'node',
          esModuleInterop: true,
          skipLibCheck: true,
          baseUrl: '../..',
          paths: {
            '*': ['src/*'],
            '@shared/*': ['shared/*'],
          },
          rootDir: '../..',
          outDir: cjsDir,
        },
        include: ['../../src/exporters/react-source/index.ts', '../../shared/**/*.ts'],
      },
      null,
      2,
    ),
    'utf8',
  );

  run(process.execPath, [path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', smokeTsconfig]);
  fs.cpSync(path.join(cjsDir, 'shared'), path.join(cjsDir, 'node_modules', '@shared'), {
    recursive: true,
  });
  return require(path.join(cjsDir, 'src', 'exporters', 'react-source', 'index.js'));
}

function compileFixtureProject({
  workDir = path.join(repoRoot, '.workbuddy', 'source-export-smoke'),
  projectDir = path.join(workDir, 'project'),
  projectName = 'Source Export Fixture',
  clean = true,
} = {}) {
  if (clean) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  fs.mkdirSync(workDir, { recursive: true });
  const { compileDocumentToReactProject } = prepareCompiler(workDir);
  const document = createFixtureDocument();
  const files = compileDocumentToReactProject(document, { projectName });
  writeProject(projectDir, files);
  return { document, files, projectDir, workDir };
}

module.exports = {
  compileFixtureProject,
  createFixtureDocument,
  repoRoot,
  run,
  writeProject,
};
