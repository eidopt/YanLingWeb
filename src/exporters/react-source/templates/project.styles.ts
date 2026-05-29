import { BASE_STYLES } from './project.styles.base';

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
    .filter(([name, body]) => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name) && typeof body === 'string')
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

${BASE_STYLES}

${runtimeAnimations}
`;
}
