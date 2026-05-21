const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const workDir = path.join(repoRoot, '.workbuddy', 'source-export-smoke');
const cjsDir = path.join(workDir, 'cjs');
const projectDir = path.join(workDir, 'project');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        result.stdout,
        result.stderr,
      ].filter(Boolean).join('\n'),
    );
  }
  return result;
}

function writeProject(files) {
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
    defaultPageId: 'home',
    pages: [
      {
        id: 'home',
        name: 'Home',
        layout: {
          id: 'home-screen',
          alias: 'core.screen',
          layout: { mode: 'flow', width: '100%' },
          props: { title: 'Home' },
          children: [
            {
              id: 'hero-panel',
              alias: 'core.panel',
              layout: { mode: 'flow', width: '100%' },
              props: { tone: 'accent', gap: 12 },
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
                  id: 'cta',
                  alias: 'core.button',
                  layout: { mode: 'flow' },
                  props: { label: 'Open details' },
                  interactions: { onClick: { type: 'navigate', targetPageId: 'details' } },
                },
              ],
            },
            {
              id: 'widget',
              alias: 'core.widget',
              layout: { mode: 'flow', width: '100%' },
              props: {},
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
              props: { tag: 'section', style: { padding: '12px' } },
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

fs.rmSync(workDir, { recursive: true, force: true });
fs.mkdirSync(cjsDir, { recursive: true });
fs.writeFileSync(path.join(cjsDir, 'package.json'), '{"type":"commonjs"}', 'utf8');
const smokeTsconfig = path.join(workDir, 'tsconfig.cjs.json');
fs.writeFileSync(smokeTsconfig, JSON.stringify({
  compilerOptions: {
    ignoreDeprecations: '6.0',
    module: 'commonjs',
    target: 'ES2020',
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
  include: [
    '../../src/exporters/react-source/index.ts',
    '../../shared/**/*.ts',
  ],
}, null, 2), 'utf8');

run(process.execPath, [
  path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
  '-p', smokeTsconfig,
]);
fs.cpSync(
  path.join(cjsDir, 'shared'),
  path.join(cjsDir, 'node_modules', '@shared'),
  { recursive: true },
);

const { compileDocumentToReactProject } = require(
  path.join(cjsDir, 'src', 'exporters', 'react-source', 'index.js'),
);
const document = createFixtureDocument();
const files = compileDocumentToReactProject(document, {
  projectName: 'Source Export Fixture',
});
const secondRun = compileDocumentToReactProject(document, {
  projectName: 'Source Export Fixture',
});

assert.deepEqual(files, secondRun, 'source export output must be stable');
assert(files.some((file) => file.relativePath === 'src/pages/home.tsx'));
assert(files.some((file) => file.relativePath === 'src/pages/details.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/HtmlBlock.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/WidgetPlaceholder.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/UnsupportedNode.tsx'));
assert(!files.some((file) => file.relativePath === 'layout.json'));

const appFile = files.find((file) => file.relativePath === 'src/App.tsx');
assert(appFile && !appFile.content.includes('layout.json'));
assert(appFile && appFile.content.includes('"home": HomePage'));
assert(appFile && appFile.content.includes('"details": DetailsPage'));
const homePage = files.find((file) => file.relativePath === 'src/pages/home.tsx');
assert(homePage && homePage.content.includes('Maintainable source export'));
assert(homePage && homePage.content.includes('WidgetPlaceholder'));
assert(homePage && homePage.content.includes('Open details'));
const detailsPage = files.find((file) => file.relativePath === 'src/pages/details.tsx');
assert(detailsPage && detailsPage.content.includes('Home'));
assert(detailsPage && detailsPage.content.includes('Details'));

writeProject(files);
run(process.execPath, [
  path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build',
], { cwd: projectDir });

assert(fs.existsSync(path.join(projectDir, 'dist', 'index.html')));

const homePagePath = path.join(projectDir, 'src', 'pages', 'home.tsx');
const editedSource = fs.readFileSync(homePagePath, 'utf8')
  .replace('Maintainable source export', 'Manually edited export text');
fs.writeFileSync(homePagePath, editedSource, 'utf8');
run(process.execPath, [
  path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build',
], { cwd: projectDir });

const builtAssetText = fs.readdirSync(path.join(projectDir, 'dist', 'assets'))
  .filter((name) => name.endsWith('.js'))
  .map((name) =>
    fs.readFileSync(path.join(projectDir, 'dist', 'assets', name), 'utf8'),
  )
  .join('\n');
assert(builtAssetText.includes('Manually edited export text'));

fs.rmSync(workDir, { recursive: true, force: true });
console.log('Source export smoke test passed.');
