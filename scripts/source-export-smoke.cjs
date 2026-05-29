const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { compileFixtureProject, createFixtureDocument, repoRoot, run } = require('./source-export-fixture.cjs');

const workDir = path.join(repoRoot, '.workbuddy', 'source-export-smoke');
const projectDir = path.join(workDir, 'project');

fs.rmSync(workDir, { recursive: true, force: true });

const { files } = compileFixtureProject({ workDir, projectDir });
const { compileDocumentToReactProject } = require(
  path.join(workDir, 'cjs', 'src', 'exporters', 'react-source', 'index.js'),
);
const secondRun = compileDocumentToReactProject(createFixtureDocument(), {
  projectName: 'Source Export Fixture',
});

assert.deepEqual(files, secondRun, 'source export output must be stable');
assert(files.some((file) => file.relativePath === 'src/pages/home.tsx'));
assert(files.some((file) => file.relativePath === 'src/pages/details.tsx'));
assert(files.some((file) => file.relativePath === 'src/data/dataSources.ts'));
assert(files.some((file) => file.relativePath === 'src/data/useExportedData.ts'));
assert(files.some((file) => file.relativePath === 'src/components/AsyncDataBoundary.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/HtmlBlock.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/InteractiveAlert.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/InteractiveCarousel.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/InteractiveDialog.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/InteractiveDrawer.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/InteractiveForm.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/InteractivePagination.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/InteractiveRate.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/InteractiveSwitch.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/InteractiveTabs.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/StaticWidget.tsx'));
assert(files.some((file) => file.relativePath === 'src/components/UnsupportedNode.tsx'));
assert(!files.some((file) => file.relativePath === 'layout.json'));

const appFile = files.find((file) => file.relativePath === 'src/App.tsx');
assert(appFile && !appFile.content.includes('layout.json'));
assert(appFile && appFile.content.includes('"home": HomePage'));
assert(appFile && appFile.content.includes('"details": DetailsPage'));
const homePage = files.find((file) => file.relativePath === 'src/pages/home.tsx');
assert(homePage && homePage.content.includes('Maintainable source export'));
assert(homePage && homePage.content.includes('StaticWidget'));
assert(homePage && homePage.content.includes('AsyncDataBoundary'));
assert(homePage && homePage.content.includes('InteractiveCarousel'));
assert(homePage && homePage.content.includes('InteractiveAlert'));
assert(homePage && homePage.content.includes('InteractiveDialog'));
assert(homePage && homePage.content.includes('InteractiveDrawer'));
assert(homePage && homePage.content.includes('InteractiveForm'));
assert(homePage && homePage.content.includes('InteractiveRate'));
assert(homePage && homePage.content.includes('InteractiveSwitch'));
assert(homePage && homePage.content.includes('"echarts"'));
assert(homePage && homePage.content.includes('"Draft"'));
assert(homePage && homePage.content.includes('sourceId="fixture-widget-source"'));
assert(homePage && homePage.content.includes('data={data}'));
assert(homePage && homePage.content.includes('Open details'));
assert(homePage && homePage.content.includes('Open confirm dialog'));
assert(homePage && homePage.content.includes('Toggle settings drawer'));
assert(homePage && homePage.content.includes('useState<Record<string, boolean>>(initialVisibleNodes)'));
assert(homePage && homePage.content.includes('setNodeVisibility("confirm-dialog", true)'));
assert(homePage && homePage.content.includes('toggleNodeVisibility("settings-drawer")'));
assert(homePage && homePage.content.includes('visible={visibleNodes["confirm-dialog"] ?? false}'));
assert(homePage && homePage.content.includes('visible={visibleNodes["settings-drawer"] ?? false}'));
assert(homePage && homePage.content.includes('className="statusBar" type="button" onClick'));
assert(homePage && homePage.content.includes('className="headerAction" type="button" onClick'));
assert(homePage && homePage.content.includes('No export tasks are blocked.'));
assert(homePage && homePage.content.includes('className="empty-action" onClick'));
assert(homePage && homePage.content.includes('Closable export alert'));
const detailsPage = files.find((file) => file.relativePath === 'src/pages/details.tsx');
assert(detailsPage && detailsPage.content.includes('Home'));
assert(detailsPage && detailsPage.content.includes('Details'));
assert(detailsPage && detailsPage.content.includes('InteractivePagination'));
assert(detailsPage && detailsPage.content.includes('InteractiveTabs'));
assert(detailsPage && detailsPage.content.includes('sourceId="fixture-table-source"'));
assert(detailsPage && detailsPage.content.includes('asRecordArray(data).map'));
assert(detailsPage && detailsPage.content.includes('readDisplayValue(row, "name")'));
assert(detailsPage && detailsPage.content.includes('Loading fixture table'));
const dataSources = files.find((file) => file.relativePath === 'src/data/dataSources.ts');
assert(dataSources && dataSources.content.includes('fixture-table-source'));
assert(dataSources && dataSources.content.includes('staticJson'));
assert(dataSources && dataSources.content.includes('publicJsonEndpoint'));
assert(dataSources && dataSources.content.includes('https://example.test/source-export-widget.json'));
assert(dataSources && dataSources.content.includes('Fallback A'));
assert(dataSources && !dataSources.content.includes('javascript:'));
const asyncDataBoundary = files.find((file) => file.relativePath === 'src/components/AsyncDataBoundary.tsx');
assert(asyncDataBoundary && asyncDataBoundary.content.includes('role="status"'));
assert(asyncDataBoundary && asyncDataBoundary.content.includes('role="alert"'));
const interactiveTabs = files.find((file) => file.relativePath === 'src/components/InteractiveTabs.tsx');
assert(interactiveTabs && interactiveTabs.content.includes('useState'));
assert(interactiveTabs && interactiveTabs.content.includes('setActiveTab(tab)'));
const interactiveCarousel = files.find((file) => file.relativePath === 'src/components/InteractiveCarousel.tsx');
assert(interactiveCarousel && interactiveCarousel.content.includes('setActiveIndex'));
assert(interactiveCarousel && interactiveCarousel.content.includes('Next slide'));
const interactivePagination = files.find((file) => file.relativePath === 'src/components/InteractivePagination.tsx');
assert(interactivePagination && interactivePagination.content.includes('setCurrentPage'));
assert(interactivePagination && interactivePagination.content.includes('aria-current'));
const interactiveAlert = files.find((file) => file.relativePath === 'src/components/InteractiveAlert.tsx');
assert(interactiveAlert && interactiveAlert.content.includes('role="alert"'));
assert(interactiveAlert && interactiveAlert.content.includes('setVisible(false)'));
const interactiveForm = files.find((file) => file.relativePath === 'src/components/InteractiveForm.tsx');
assert(interactiveForm && interactiveForm.content.includes('event.preventDefault()'));
assert(interactiveForm && interactiveForm.content.includes('setSubmitted(true)'));
assert(homePage && homePage.content.includes('type="checkbox" defaultChecked'));
assert(homePage && homePage.content.includes('type="radio" name="lead-choice" defaultChecked'));
const interactiveSwitch = files.find((file) => file.relativePath === 'src/components/InteractiveSwitch.tsx');
assert(interactiveSwitch && interactiveSwitch.content.includes('role="switch"'));
assert(interactiveSwitch && interactiveSwitch.content.includes('setChecked((current) => !current)'));
assert(interactiveSwitch && interactiveSwitch.content.includes('aria-checked={checked}'));
const interactiveRate = files.find((file) => file.relativePath === 'src/components/InteractiveRate.tsx');
assert(interactiveRate && interactiveRate.content.includes('role="radiogroup"'));
assert(interactiveRate && interactiveRate.content.includes('setCurrentValue(nextValue)'));
assert(interactiveRate && interactiveRate.content.includes('aria-checked={Object.is(nextValue, currentValue)}'));
const interactiveDialog = files.find((file) => file.relativePath === 'src/components/InteractiveDialog.tsx');
assert(interactiveDialog && interactiveDialog.content.includes('role="dialog"'));
assert(interactiveDialog && interactiveDialog.content.includes('setCurrentVisible(false)'));
assert(interactiveDialog && interactiveDialog.content.includes('onVisibleChange?.(nextVisible)'));
const interactiveDrawer = files.find((file) => file.relativePath === 'src/components/InteractiveDrawer.tsx');
assert(interactiveDrawer && interactiveDrawer.content.includes('Close drawer'));
assert(interactiveDrawer && interactiveDrawer.content.includes('setCurrentVisible(false)'));
assert(interactiveDrawer && interactiveDrawer.content.includes('onVisibleChange?.(nextVisible)'));
assert(!homePage.content.includes('javascript:alert'));
assert(!detailsPage.content.includes('example.test/image.png'));
assert(!detailsPage.content.includes('backgroundImage'));

run(process.execPath, [path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
  cwd: projectDir,
});

assert(fs.existsSync(path.join(projectDir, 'dist', 'index.html')));

const homePagePath = path.join(projectDir, 'src', 'pages', 'home.tsx');
const editedSource = fs
  .readFileSync(homePagePath, 'utf8')
  .replace('Maintainable source export', 'Manually edited export text');
fs.writeFileSync(homePagePath, editedSource, 'utf8');
run(process.execPath, [path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
  cwd: projectDir,
});

const builtAssetText = fs
  .readdirSync(path.join(projectDir, 'dist', 'assets'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(projectDir, 'dist', 'assets', name), 'utf8'))
  .join('\n');
assert(builtAssetText.includes('Manually edited export text'));
assert(builtAssetText.includes('Fallback A'));

fs.rmSync(workDir, { recursive: true, force: true });
console.log('Source export smoke test passed.');
