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

export type WidgetCapability = 'chart' | 'animation' | 'diagram';

export interface WidgetRuntimePolicy {
  enabled?: boolean;
  allowedLibraries?: readonly string[];
  allowedRenderers?: readonly string[];
  allowedCapabilities?: readonly WidgetCapability[];
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

export const SUPPORTED_WIDGET_RENDERERS: ReadonlySet<string> = new Set(
  ALLOWED_WIDGET_LIBRARIES.flatMap((library) => library.renderers),
);

export const ALLOWED_WIDGET_PACKAGE_NAMES = new Set(ALLOWED_WIDGET_LIBRARIES.map((library) => library.packageName));

export const SUPPORTED_WIDGET_CAPABILITIES: ReadonlySet<WidgetCapability> = new Set(['chart', 'animation', 'diagram']);

const WIDGET_RENDERER_CAPABILITIES: Readonly<Record<string, WidgetCapability>> = {
  echarts: 'chart',
  chartjs: 'chart',
  lottie: 'animation',
  mermaid: 'diagram',
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePolicyValues(values: readonly string[] | undefined): Set<string> | null {
  if (!values?.length) {
    return null;
  }
  return new Set(values.map(normalizeName).filter(Boolean));
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

export function getAllowedWidgetLibraryByName(name: string): AllowedWidgetLibrary | null {
  const normalizedName = normalizeName(name);
  return (
    ALLOWED_WIDGET_LIBRARIES.find(
      (library) => library.packageName === normalizedName || library.aliases.some((alias) => alias === normalizedName),
    ) ?? null
  );
}

export function isWidgetRuntimePolicyEnabled(policy?: WidgetRuntimePolicy): boolean {
  return policy?.enabled !== false;
}

export function getWidgetLibraryPolicyKeys(library: AllowedWidgetLibrary): string[] {
  return [library.packageName, ...library.aliases].map(normalizeName);
}

export function isWidgetLibraryAllowedByPolicy(name: string, policy?: WidgetRuntimePolicy): boolean {
  if (!isWidgetRuntimePolicyEnabled(policy)) {
    return false;
  }

  const allowedLibraries = normalizePolicyValues(policy?.allowedLibraries);
  if (!allowedLibraries) {
    return true;
  }

  const library = getAllowedWidgetLibraryByName(name);
  if (!library) {
    return false;
  }

  return getWidgetLibraryPolicyKeys(library).some((key) => allowedLibraries.has(key));
}

export function isWidgetRendererAllowedByPolicy(renderer: string, policy?: WidgetRuntimePolicy): boolean {
  if (!isWidgetRuntimePolicyEnabled(policy)) {
    return false;
  }

  const allowedRenderers = normalizePolicyValues(policy?.allowedRenderers);
  return !allowedRenderers || allowedRenderers.has(normalizeName(renderer));
}

export function getWidgetRendererCapability(renderer: string): WidgetCapability | null {
  return WIDGET_RENDERER_CAPABILITIES[normalizeName(renderer)] ?? null;
}

export function isSupportedWidgetCapability(value: string): value is WidgetCapability {
  return SUPPORTED_WIDGET_CAPABILITIES.has(normalizeName(value) as WidgetCapability);
}

export function isWidgetCapabilityAllowedByPolicy(capability: WidgetCapability, policy?: WidgetRuntimePolicy): boolean {
  if (!isWidgetRuntimePolicyEnabled(policy)) {
    return false;
  }

  const allowedCapabilities = normalizePolicyValues(policy?.allowedCapabilities);
  return !allowedCapabilities || allowedCapabilities.has(capability);
}

export function isWidgetRendererCapabilityAllowedByPolicy(renderer: string, policy?: WidgetRuntimePolicy): boolean {
  const capability = getWidgetRendererCapability(renderer);
  return Boolean(capability && isWidgetCapabilityAllowedByPolicy(capability, policy));
}

export function getAllowedWidgetLibraryByUrl(url: string): AllowedWidgetLibrary | null {
  const packageName = extractEsmPackageName(url);
  if (!packageName) {
    return null;
  }
  return ALLOWED_WIDGET_LIBRARIES.find((library) => library.packageName === packageName) ?? null;
}

export function isAllowedWidgetDependency(name: string, url: string, policy?: WidgetRuntimePolicy): boolean {
  const libraryByName = getAllowedWidgetLibraryByName(name);
  const libraryByUrl = getAllowedWidgetLibraryByUrl(url);
  if (!libraryByName || !libraryByUrl) {
    return false;
  }
  return (
    libraryByName.packageName === libraryByUrl.packageName &&
    isWidgetLibraryAllowedByPolicy(libraryByName.packageName, policy)
  );
}

export function formatAllowedWidgetLibraries(): string {
  return ALLOWED_WIDGET_LIBRARIES.map((library) => `${library.aliases[0]} (${library.recommendedUrl})`).join(', ');
}

export function resolveSafeWidgetRenderer(
  library: string,
  renderer?: string,
  policy?: WidgetRuntimePolicy,
): string | null {
  const allowedLibrary = getAllowedWidgetLibraryByName(library);
  if (!allowedLibrary || !isWidgetLibraryAllowedByPolicy(allowedLibrary.packageName, policy)) {
    return null;
  }

  const normalizedRenderer = renderer?.trim().toLowerCase();
  if (
    normalizedRenderer &&
    allowedLibrary.renderers.some((item) => item === normalizedRenderer) &&
    isWidgetRendererAllowedByPolicy(normalizedRenderer, policy) &&
    isWidgetRendererCapabilityAllowedByPolicy(normalizedRenderer, policy)
  ) {
    return normalizedRenderer;
  }

  return (
    allowedLibrary.renderers.find(
      (item) =>
        isWidgetRendererAllowedByPolicy(item, policy) && isWidgetRendererCapabilityAllowedByPolicy(item, policy),
    ) ?? null
  );
}
