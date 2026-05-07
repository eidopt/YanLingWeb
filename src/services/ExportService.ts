import type { ExportBuildPayload } from 'types/export.types';
import type { BuilderCanvas } from 'ui/editor/types';
import type { ThemeLayoutDocumentSource } from 'ui/layout/types';

// ── Theme runtime registry ────────────────────────────────────────────
// Maps each themeId to the import path and exported variable name of
// its runtime. When a new theme pack is added, register it here.
const THEME_RUNTIME_REGISTRY: Record<
  string,
  { importPath: string; importVar: string }
> = {
  'service-center': {
    importPath: '@/theme-packs/service/runtime',
    importVar: 'serviceThemeRuntime',
  },
  'commerce-market': {
    importPath: '@/theme-packs/commerce/runtime',
    importVar: 'commerceThemeRuntime',
  },
};

// ── Serialization ─────────────────────────────────────────────────────

/**
 * Merges all canvases (pages) of the current editor session into a
 * single multi-page ThemeLayoutDocument and returns it as a JSON string.
 */
export function serializeCanvases(
  canvases: BuilderCanvas[],
  projectName: string,
): string {
  const first = canvases[0];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard; array may be empty at runtime
  if (!first) {throw new Error('No canvases to export.');}

  const pages = canvases.map((canvas) => ({
    id: canvas.document.defaultPageId,
    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through */
    name: (
      canvas.name ||
      canvas.document.pageName ||
      canvas.document.defaultPageId
    ),
    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
    layout: canvas.document.layout,
  }));

  const merged: ThemeLayoutDocumentSource = {
    ...first.document,
    pageName: projectName,
    pages,
    defaultPageId: pages[0].id,
    layout: pages[0].layout,
  };

  return JSON.stringify(merged, null, 2);
}

/**
 * Builds the IPC payload for the Electron "build project" handler.
 * Returns null when the themeId is not registered (should not happen
 * in practice).
 */
export function buildExportPayload(
  canvases: BuilderCanvas[],
  themeId: string,
  projectName: string,
): ExportBuildPayload | null {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- themeId may not be registered at runtime
  if (!THEME_RUNTIME_REGISTRY[themeId]) {return null;}

  return {
    projectName: slugify(projectName),
    layoutJson: serializeCanvases(canvases, projectName),
    themeId,
  };
}

// ── Web fallback: browser download ───────────────────────────────────

/** Triggers a file download in the browser (web build, no Electron). */
export function downloadFile(
  filename: string,
  content: string,
  mimeType = 'application/json',
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Scaffold template generation (used by Electron main process) ─────
//
// The generated project reuses the main project's src/ via the @/ path
// alias, so it can be built by running `vite build` inside
// output/<name>/ without duplicating any source files.

export function generateScaffoldFiles(
  layoutJson: string,
  themeId: string,
  projectName: string,
): { relativePath: string; content: string }[] {
  const registry = THEME_RUNTIME_REGISTRY[themeId];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- themeId may not be registered at runtime
  if (!registry) {throw new Error(`Unknown themeId: ${themeId}`);}

  const { importPath, importVar } = registry;

  return [
    {
      relativePath: 'layout.json',
      content: layoutJson,
    },
    {
      relativePath: 'index.html',
      content: generateIndexHtml(projectName),
    },
    {
      relativePath: 'src/main.tsx',
      content: generateMainTsx(),
    },
    {
      relativePath: 'src/App.tsx',
      content: generateAppTsx(importPath, importVar),
    },
    {
      relativePath: 'vite.config.ts',
      // __SRC_DIR__ is replaced by the Electron main process with the
      // absolute path to the main project's src/ directory.
      content: generateViteConfig(),
    },
    {
      relativePath: 'tsconfig.json',
      content: generateTsConfig(),
    },
  ];
}

// ── Template strings ──────────────────────────────────────────────────

function generateIndexHtml(title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
`;
}

function generateMainTsx(): string {
  return `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/global.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;
}

function generateAppTsx(importPath: string, importVar: string): string {
  return `import {
  DynamicThemeRenderer,
  useDynamicThemeRendererController,
} from 'ui/renderer';
import {
  normalizeThemeLayoutDocument,
  type ThemeLayoutDocumentSource,
} from 'ui/layout/types';
import { ${importVar} } from '${importPath}';
import layoutSource from '../layout.json';

const layoutDocument = normalizeThemeLayoutDocument(
  layoutSource as ThemeLayoutDocumentSource,
);

export function App() {
  const controller = useDynamicThemeRendererController({
    layoutDocument,
    runtime: ${importVar},
  });

  return <DynamicThemeRenderer controller={controller} />;
}
`;
}

function generateViteConfig(): string {
  // __SRC_DIR__ placeholder — replaced by Electron main process at
  // write time
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// __SRC_DIR__ is substituted by the exporter with the absolute path to
// the AI App project's src/ directory so @/ imports resolve correctly.
const SRC_DIR = '__SRC_DIR__';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': SRC_DIR },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
`;
}

function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'es2023',
        lib: ['ES2023', 'DOM', 'DOM.Iterable'],
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        allowImportingTsExtensions: true,
        verbatimModuleSyntax: true,
        jsx: 'react-jsx',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        baseUrl: '.',
        // @/ maps to the main project src/ (set by vite.config.ts at
        // build time)
        paths: { '@/*': ['../../src/*'] },
      },
      include: ['src'],
    },
    null,
    2,
  );
}

// ── Utilities ─────────────────────────────────────────────────────────

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[\u4e00-\u9fa5\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'export'
  );
}
