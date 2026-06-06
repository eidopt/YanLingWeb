const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const componentsDir = path.join(repoRoot, 'src', 'ui', 'renderer', 'components');
const registryPath = path.join(componentsDir, 'registry.tsx');
const indexPath = path.join(componentsDir, 'index.ts');
const fixMode = process.argv.includes('--fix');

const aliasOverrides = new Map([
  ['DatePickerNode', 'datepicker'],
  ['ListItemNode', 'list-item'],
  ['NavBarNode', 'navbar'],
  ['TabBarNode', 'tabbar'],
  ['TimePickerNode', 'timepicker'],
]);

const runtimeComponents = new Set(['ScreenNode', 'WidgetNode']);

function fail(message, details = []) {
  const suffix = details.length ? `\n${details.map((item) => `  - ${item}`).join('\n')}` : '';
  throw new Error(`${message}${suffix}`);
}

function toKebab(value) {
  return value
    .replace(/Node$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function getExpectedComponents() {
  return fs
    .readdirSync(componentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('Node'))
    .map((entry) => {
      const componentName = entry.name;
      const componentFile = path.join(componentsDir, componentName, `${componentName}.tsx`);
      if (!fs.existsSync(componentFile)) {
        fail(`Renderer component directory is missing its component file: ${componentName}`);
      }
      return {
        componentName,
        alias: `core.${aliasOverrides.get(componentName) ?? toKebab(componentName)}`,
      };
    })
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractRegisteredRenderers(registrySource) {
  const entries = [];
  const rendererPattern = /'(?<alias>core\.[^']+)':\s*render(?:Runtime)?Component\((?<component>[A-Za-z0-9_]+)\)/g;
  for (const match of registrySource.matchAll(rendererPattern)) {
    entries.push({
      alias: match.groups.alias,
      componentName: match.groups.component,
    });
  }
  return entries.sort((a, b) => a.alias.localeCompare(b.alias));
}

function extractBarrelExports(indexSource) {
  const exports = new Set();
  const exportPattern = /export\s+\{\s*(?<component>[A-Za-z0-9_]+)\s*\}\s+from\s+'\.\/[^']+';/g;
  for (const match of indexSource.matchAll(exportPattern)) {
    exports.add(match.groups.component);
  }
  return exports;
}

function compareSets(label, expected, actual) {
  const missing = expected.filter((value) => !actual.includes(value));
  const extra = actual.filter((value) => !expected.includes(value));
  if (missing.length || extra.length) {
    fail(`${label} is out of sync.`, [
      ...missing.map((value) => `missing ${value}`),
      ...extra.map((value) => `extra ${value}`),
    ]);
  }
}

function renderRegistrySource(expected) {
  const componentsByName = [...expected].sort((a, b) => a.componentName.localeCompare(b.componentName));
  const componentImports = componentsByName.map(
    ({ componentName }) => `import { ${componentName} } from './${componentName}/${componentName}';`,
  );
  const uploadImportIndex = componentImports.findIndex((line) => line.includes('./UploadNode/'));
  const imports = [
    ...componentImports.slice(0, uploadImportIndex),
    "import type { CoreNodeProps } from './types';",
    ...componentImports.slice(uploadImportIndex),
  ].join('\n');
  const entries = expected
    .map(({ alias, componentName }) => {
      const renderer = runtimeComponents.has(componentName) ? 'renderRuntimeComponent' : 'renderComponent';
      return `  '${alias}': ${renderer}(${componentName}),`;
    })
    .join('\n');

  return `'use client';

import type { ThemeRuntime } from '../types';
${imports}
import type { ReactNode } from 'react';

interface CoreComponentRenderContext extends CoreNodeProps {
  runtime: ThemeRuntime;
}

export type CoreComponentRenderer = (context: CoreComponentRenderContext) => ReactNode;

function renderComponent<T>(
  Component: (props: CoreNodeProps<T>) => ReactNode,
): CoreComponentRenderer {
  function renderRegisteredComponent({
    runtime: _runtime,
    ...nodeProps
  }: CoreComponentRenderContext) {
    return <Component {...(nodeProps as CoreNodeProps<T>)} />;
  }

  return renderRegisteredComponent;
}

function renderRuntimeComponent<T>(
  Component: (props: CoreNodeProps<T> & { runtime: ThemeRuntime }) => ReactNode,
): CoreComponentRenderer {
  function renderRegisteredRuntimeComponent({
    runtime,
    ...nodeProps
  }: CoreComponentRenderContext) {
    return <Component runtime={runtime} {...(nodeProps as CoreNodeProps<T>)} />;
  }

  return renderRegisteredRuntimeComponent;
}

export const CORE_COMPONENT_RENDERERS = {
${entries}
} as const satisfies Record<string, CoreComponentRenderer>;

export type CoreComponentAlias = keyof typeof CORE_COMPONENT_RENDERERS;

export const CORE_COMPONENT_ALIASES = Object.keys(
  CORE_COMPONENT_RENDERERS,
) as CoreComponentAlias[];

export function resolveCoreComponentRenderer(alias: string): CoreComponentRenderer | undefined {
  return CORE_COMPONENT_RENDERERS[alias as CoreComponentAlias];
}
`;
}

function renderIndexSource(expected) {
  const registryExport = `export {
  CORE_COMPONENT_ALIASES,
  CORE_COMPONENT_RENDERERS,
  type CoreComponentAlias,
  type CoreComponentRenderer,
  resolveCoreComponentRenderer,
} from './registry';`;
  const componentsByName = [...expected].sort((a, b) => a.componentName.localeCompare(b.componentName));
  const exportLines = componentsByName.map(
    ({ componentName }) => `export { ${componentName} } from './${componentName}/${componentName}';`,
  );
  const rowExportIndex = exportLines.findIndex((line) => line.includes('./RowNode/'));
  const orderedExports = [
    ...exportLines.slice(0, rowExportIndex),
    registryExport,
    ...exportLines.slice(rowExportIndex),
  ];

  return `${orderedExports.join('\n')}\n`;
}

function writeIfChanged(filePath, content) {
  const normalizedContent = content.replace(/\r\n/g, '\n');
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n') === normalizedContent) {
    return false;
  }
  fs.writeFileSync(filePath, normalizedContent, 'utf8');
  return true;
}

function main() {
  const expected = getExpectedComponents();
  if (fixMode) {
    const updated = [
      writeIfChanged(registryPath, renderRegistrySource(expected)),
      writeIfChanged(indexPath, renderIndexSource(expected)),
    ].some(Boolean);
    console.log(updated ? 'Renderer registry files regenerated.' : 'Renderer registry files already up to date.');
  }

  const expectedAliases = expected.map((entry) => entry.alias);
  const expectedComponents = expected.map((entry) => entry.componentName).sort();
  const expectedByAlias = new Map(expected.map((entry) => [entry.alias, entry.componentName]));

  const registryEntries = extractRegisteredRenderers(readText(registryPath));
  const registeredAliases = registryEntries.map((entry) => entry.alias);
  const duplicateAliases = registeredAliases.filter((alias, index) => registeredAliases.indexOf(alias) !== index);
  if (duplicateAliases.length) {
    fail('Renderer registry contains duplicate aliases.', duplicateAliases);
  }

  compareSets('Renderer registry aliases', expectedAliases, registeredAliases);

  const componentMismatches = registryEntries
    .filter((entry) => expectedByAlias.get(entry.alias) !== entry.componentName)
    .map((entry) => `${entry.alias} should render ${expectedByAlias.get(entry.alias)}, found ${entry.componentName}`);
  if (componentMismatches.length) {
    fail('Renderer registry alias/component pairs are out of sync.', componentMismatches);
  }

  const barrelExports = Array.from(extractBarrelExports(readText(indexPath))).sort();
  compareSets('Renderer component barrel exports', expectedComponents, barrelExports);

  console.log(`Renderer registry check passed (${expected.length} core components).`);
}

main();
