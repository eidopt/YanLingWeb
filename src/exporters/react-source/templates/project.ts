export function generateIndexHtml(title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function generateMainTsx(): string {
  return `import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

export function generatePackageJson(projectName: string): string {
  return `${JSON.stringify({
    name: projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      vite: 'latest',
      typescript: 'latest',
      react: 'latest',
      'react-dom': 'latest',
    },
    devDependencies: {
      '@types/react': 'latest',
      '@types/react-dom': 'latest',
    },
  }, null, 2)}
`;
}

export function generateTsConfig(): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      useDefineForClassFields: true,
      lib: ['DOM', 'DOM.Iterable', 'ES2022'],
      allowJs: false,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: true,
      forceConsistentCasingInFileNames: true,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: 'react-jsx',
    },
    include: ['src'],
    references: [],
  }, null, 2)}
`;
}

export function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
`;
}

function serializeCssVars(runtimeCssVars: Record<string, string> = {}): string {
  return Object.entries(runtimeCssVars)
    .filter(([key, value]) => /^--[a-zA-Z0-9-_]+$/.test(key) && typeof value === 'string')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
}

const EXPORT_TOKEN_MAP: Record<string, string[]> = {
  '--export-accent': ['--accent', '--color-accent', '--app-color-accent'],
  '--export-surface': ['--surface', '--surface-bg', '--app-surface'],
  '--export-surface-muted': ['--surface-muted', '--app-surface-muted'],
  '--export-panel-bg': ['--panel-bg', '--card-bg', '--app-panel-bg'],
  '--export-panel-border': ['--panel-border', '--card-border', '--app-panel-border'],
  '--export-panel-accent': ['--panel-accent', '--card-accent'],
  '--export-panel-accent-border': ['--panel-accent-border', '--card-accent-border'],
  '--export-search-bg': ['--search-bg', '--input-bg'],
  '--export-note-bg': ['--note-bg', '--notice-bg'],
  '--export-text-base': ['--text-base', '--color-text', '--app-text-base'],
  '--export-radius-base': ['--radius-base', '--radius', '--app-radius-base'],
};

function serializeExportTokenMap(cssVars: Record<string, string> = {}): string {
  return Object.entries(EXPORT_TOKEN_MAP)
    .map(([token, candidates]) => {
      const source = candidates.find((candidate) => cssVars[candidate]);
      return source ? `  ${token}: var(${source});` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function serializeCssAnimations(cssAnimations: Record<string, string> = {}): string {
  return Object.entries(cssAnimations)
    .filter(([name, body]) =>
      /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name) && typeof body === 'string')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, body]) => `@keyframes ${name} {\n  ${body}\n}`)
    .join('\n\n');
}

export function generateStyles(
  runtimeCssVars: Record<string, string> = {},
  runtimeCssAnimations: Record<string, string> = {},
): string {
  const runtimeVars = serializeCssVars(runtimeCssVars);
  const exportTokens = serializeExportTokenMap(runtimeCssVars);
  const runtimeAnimations = serializeCssAnimations(runtimeCssAnimations);

  return `:root {
${runtimeVars}
${exportTokens}
  color: var(--export-text-base, #101828);
  background: color-mix(in srgb, var(--export-surface-muted, #f3f6fb) 82%, var(--export-text-base, #101828) 18%);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  overflow-x: hidden;
}

button,
input {
  font: inherit;
}

.appShell {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  background: color-mix(in srgb, var(--export-surface-muted, #f3f6fb) 82%, var(--export-text-base, #101828) 18%);
}

.screen {
  width: min(100%, 360px);
  min-height: 640px;
  max-height: 640px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(28, 17, 7, 0.08);
  border-radius: 32px;
  color: var(--export-text-base, #101828);
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--export-accent, #2563eb) 10%, transparent), transparent 36%),
    var(--export-surface, linear-gradient(180deg, #ffffff 0%, #f3f6fb 100%));
  box-shadow:
    0 24px 56px rgba(28, 17, 7, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.screen::before {
  content: '';
  position: absolute;
  top: 8px;
  left: 50%;
  width: 96px;
  height: 20px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--export-text-base, #101828) 16%, transparent);
  pointer-events: none;
}

.screen-web {
  width: 100%;
  min-height: 100vh;
  max-height: none;
  border-radius: 0;
  overflow: visible;
}

.screen-web::before {
  content: none;
}

.screen-web .screenBody {
  overflow: visible;
}

.statusBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
  font-size: 12px;
  font-weight: 700;
}

.headerSpacer {
  width: 64px;
  flex: 0 0 64px;
}

.headerAction {
  width: 64px;
  flex: 0 0 64px;
  overflow: hidden;
  text-align: right;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 700;
}

.screenHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0 16px;
}

.screenHeader h1 {
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 16px;
  font-weight: 700;
}

.statusTime {
  color: var(--export-text-base, #101828);
}

.screenBody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.screenFooter {
  padding-top: 10px;
}

.screenBody,
.core-stack,
.core-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.core-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.core-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.core-panel {
  padding: 14px;
  min-width: 0;
  border: 1px solid var(--export-panel-border, rgba(16, 24, 40, 0.12));
  border-radius: calc(var(--export-radius-base, 8px) * 1.5);
  background: var(--export-panel-bg, rgba(255, 255, 255, 0.96));
  box-shadow: 0 14px 32px rgba(28, 17, 7, 0.06);
}

.core-panel[data-tone="promo"],
.core-panel[data-tone="accent"] {
  border-color: var(--export-panel-accent-border, rgba(37, 99, 235, 0.2));
  background:
    linear-gradient(180deg, var(--export-panel-accent, rgba(37, 99, 235, 0.1)), transparent 70%),
    var(--export-panel-bg, rgba(255, 255, 255, 0.96));
}

.core-text {
  margin: 0;
  min-width: 0;
}

.core-text.heading,
.core-text.display {
  font-size: 24px;
  line-height: 1.2;
}

.core-text.title {
  font-weight: 700;
}

.core-text.body,
.core-text.caption {
  color: color-mix(in srgb, var(--export-text-base, #101828) 70%, white);
}

.core-button,
.core-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  padding: 8px 12px;
  color: #ffffff;
  background: var(--export-accent, #2563eb);
  cursor: pointer;
  font-weight: 700;
}

.core-button:disabled {
  cursor: default;
  opacity: 0.48;
}

.core-button[data-variant="pill"],
.core-tabs button {
  color: color-mix(in srgb, var(--export-accent, #2563eb) 70%, black);
  background: color-mix(in srgb, var(--export-accent, #2563eb) 10%, white);
}

.core-button[data-variant="secondary"] {
  color: var(--export-accent, #2563eb);
  background: #ffffff;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--export-accent, #2563eb) 22%, transparent);
}

.core-button[data-variant="link"] {
  padding: 0;
  color: var(--export-accent, #2563eb);
  background: transparent;
}

.core-button[data-active="true"],
.core-tabs button.active {
  color: color-mix(in srgb, var(--export-accent, #2563eb) 75%, black);
  background: color-mix(in srgb, var(--export-accent, #2563eb) 18%, white);
}

.core-image,
.widgetPlaceholder,
.unsupportedNode {
  min-height: 96px;
  border-radius: calc(var(--export-radius-base, 8px) * 1.1);
  border: 0;
  background: rgba(28, 17, 7, 0.08);
}

img.core-image {
  display: block;
  object-fit: cover;
  width: 100%;
}

img.core-image[data-fit="contain"] {
  object-fit: contain;
}

img.core-image[data-fit="fill"] {
  object-fit: fill;
}

.core-tabs {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 0 6px;
}

.screenFooter .core-tabs {
  padding: 0;
}

.screenFooter .core-tabs button {
  min-width: 68px;
}

.core-search,
.core-input {
  width: 100%;
  border: 0;
  border-radius: 999px;
  padding: 10px 12px;
  background: var(--export-search-bg, rgba(255, 255, 255, 0.9));
  box-shadow: inset 0 0 0 1px rgba(28, 17, 7, 0.06);
}

.core-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.core-input-label {
  font-size: 12px;
  font-weight: 700;
  color: color-mix(in srgb, var(--export-text-base, #101828) 68%, white);
}

.core-search:disabled,
.core-input:disabled {
  opacity: 0.48;
}

.core-tag,
.core-notice {
  display: inline-flex;
  border-radius: 999px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--export-accent, #2563eb) 15%, white);
  color: color-mix(in srgb, var(--export-accent, #2563eb) 70%, black);
}

.core-notice[data-tone="success"] {
  background: color-mix(in srgb, #16a34a 16%, white);
  color: color-mix(in srgb, #166534 82%, black);
}

.core-notice[data-tone="warning"] {
  background: color-mix(in srgb, #f97316 16%, white);
  color: color-mix(in srgb, #9a3412 82%, black);
}

.core-notice[data-tone="error"] {
  background: color-mix(in srgb, #dc2626 14%, white);
  color: color-mix(in srgb, #991b1b 82%, black);
}

.core-progress {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--export-text-base, #101828) 10%, transparent);
}

.core-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--export-accent, #2563eb);
}

.core-progress[data-tone="neutral"] span {
  background: color-mix(in srgb, var(--export-text-base, #101828) 42%, white);
}

.core-progress[data-tone="success"] span {
  background: #16a34a;
}

.core-progress[data-tone="warning"] span {
  background: #f97316;
}

.core-progress[data-tone="info"] span {
  background: #0ea5e9;
}

.core-divider {
  width: 100%;
  border: 0;
  border-top: 1px solid rgba(16, 24, 40, 0.14);
}

.core-spacer {
  min-height: 16px;
}

${runtimeAnimations}
`;
}
