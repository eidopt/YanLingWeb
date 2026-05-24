export const ALLOWED_WIDGET_DEPENDENCY_ORIGINS = new Set(['https://esm.sh']);

export const DISALLOWED_WIDGET_PROP_NAMES = new Set([
  'code',
  'script',
  'scriptUrl',
  'src',
  'srcdoc',
  'srcDoc',
  'inlineScript',
  'module',
]);

export interface AllowedWidgetLibrary {
  packageName: string;
  aliases: readonly string[];
  renderers: readonly string[];
  recommendedUrl: string;
}

export const ALLOWED_WIDGET_LIBRARIES = [
  {
    packageName: 'echarts',
    aliases: ['echarts'],
    renderers: ['echarts'],
    recommendedUrl: 'https://esm.sh/echarts',
  },
  {
    packageName: 'chart.js',
    aliases: ['chart.js', 'chartjs'],
    renderers: ['chartjs'],
    recommendedUrl: 'https://esm.sh/chart.js/auto',
  },
  {
    packageName: 'lottie-web',
    aliases: ['lottie-web', 'lottie'],
    renderers: ['lottie'],
    recommendedUrl: 'https://esm.sh/lottie-web',
  },
  {
    packageName: 'mermaid',
    aliases: ['mermaid'],
    renderers: ['mermaid'],
    recommendedUrl: 'https://esm.sh/mermaid',
  },
] as const satisfies readonly AllowedWidgetLibrary[];

export const SUPPORTED_WIDGET_RENDERERS = new Set(
  ALLOWED_WIDGET_LIBRARIES.flatMap((library) => library.renderers),
);

export const ALLOWED_WIDGET_PACKAGE_NAMES = new Set(
  ALLOWED_WIDGET_LIBRARIES.map((library) => library.packageName),
);

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

export function isAllowedEsmDependencyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_WIDGET_DEPENDENCY_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

export function extractEsmPackageName(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !ALLOWED_WIDGET_DEPENDENCY_ORIGINS.has(parsed.origin)) {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (!parts.length) {
      return null;
    }

    const packageStart = /^v\d+$/i.test(parts[0]) ? 1 : 0;
    const first = parts[packageStart];
    if (!first) {
      return null;
    }

    if (first.startsWith('@')) {
      const second = parts[packageStart + 1];
      return second ? `${first}/${second}`.replace(/@[^/]+$/, '').toLowerCase() : null;
    }

    return first.replace(/@[^/]+$/, '').toLowerCase();
  } catch {
    return null;
  }
}

export function getAllowedWidgetLibraryByName(
  name: string,
): AllowedWidgetLibrary | null {
  const normalizedName = normalizeName(name);
  return ALLOWED_WIDGET_LIBRARIES.find((library) => (
    library.packageName === normalizedName
    || library.aliases.some((alias) => alias === normalizedName)
  )) ?? null;
}

export function getAllowedWidgetLibraryByUrl(
  url: string,
): AllowedWidgetLibrary | null {
  const packageName = extractEsmPackageName(url);
  if (!packageName) {
    return null;
  }
  return ALLOWED_WIDGET_LIBRARIES.find((library) => library.packageName === packageName) ?? null;
}

export function isAllowedWidgetDependency(name: string, url: string): boolean {
  const libraryByName = getAllowedWidgetLibraryByName(name);
  const libraryByUrl = getAllowedWidgetLibraryByUrl(url);
  return libraryByName?.packageName === libraryByUrl?.packageName;
}

export function formatAllowedWidgetLibraries(): string {
  return ALLOWED_WIDGET_LIBRARIES
    .map((library) => `${library.aliases[0]} (${library.recommendedUrl})`)
    .join(', ');
}

export function resolveSafeWidgetRenderer(
  library: string,
  renderer?: string,
): string | null {
  const allowedLibrary = getAllowedWidgetLibraryByName(library);
  if (!allowedLibrary) {
    return null;
  }

  const normalizedRenderer = renderer?.trim().toLowerCase();
  if (normalizedRenderer && allowedLibrary.renderers.some((item) => item === normalizedRenderer)) {
    return normalizedRenderer;
  }

  return allowedLibrary.renderers[0] ?? null;
}
