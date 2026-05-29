import { resolveThemeLayoutCssVars, type ThemeLayoutStyleDocument } from './styleManifest';

export type TemplateComponentDensity = 'compact' | 'comfortable' | 'spacious';

export interface TemplateStyleProfile {
  colors: string[];
  fontSizes: string[];
  fontWeights: string[];
  spacing: string[];
  radius: string[];
  shadows: string[];
  componentDensity?: TemplateComponentDensity;
  commonLayoutPatterns: string[];
}

export interface TemplateStyleProfileBuildOptions {
  fallbackCssVars?: Record<string, string>;
  commonLayoutPatterns?: string[];
  componentDensity?: TemplateComponentDensity;
}

type StyleTokenBucket = 'colors' | 'fontSizes' | 'fontWeights' | 'spacing' | 'radius' | 'shadows';

type StyleTokenBuckets = Record<StyleTokenBucket, string[]>;

const DEFAULT_STYLE_TOKENS: StyleTokenBuckets = {
  colors: [
    'var(--color-primary)',
    'var(--color-accent)',
    'var(--color-surface)',
    'var(--color-text)',
    'var(--color-border)',
  ],
  fontSizes: [
    'var(--app-font-size-xs)',
    'var(--app-font-size-sm)',
    'var(--app-font-size-md)',
    'var(--app-font-size-lg)',
    'var(--app-font-size-xl)',
  ],
  fontWeights: ['var(--app-font-weight-regular)', 'var(--app-font-weight-medium)', 'var(--app-font-weight-bold)'],
  spacing: [
    'var(--app-space-1)',
    'var(--app-space-2)',
    'var(--app-space-3)',
    'var(--app-space-4)',
    'var(--app-space-6)',
    'var(--app-space-8)',
    'var(--app-space-12)',
  ],
  radius: [
    'var(--app-radius-sm)',
    'var(--app-radius-md)',
    'var(--app-radius-lg)',
    'var(--app-radius-xl)',
    'var(--app-radius-2xl)',
    'var(--app-radius-pill)',
  ],
  shadows: [
    'var(--app-shadow-xs)',
    'var(--app-shadow-sm)',
    'var(--app-shadow-md)',
    'var(--app-shadow-lg)',
    'var(--app-shadow-brand-md)',
  ],
};

const COLOR_NAME_PATTERN = /(color|accent|brand|surface|background|bg|foreground|text|ink|border|muted)/i;
const FONT_SIZE_NAME_PATTERN = /(font-size|text-size|type-scale|heading|caption|display|body-size)/i;
const FONT_WEIGHT_NAME_PATTERN = /(font-weight|type-weight|weight)/i;
const SPACING_NAME_PATTERN = /(space|spacing|gap|gutter|margin|padding|inset|offset|unit)/i;
const RADIUS_NAME_PATTERN = /(radius|radii|rounded|corner|^--r-)/i;
const SHADOW_NAME_PATTERN = /(shadow|elevation|glow)/i;

const COLOR_VALUE_PATTERN = /^(#|rgb\(|rgba\(|hsl\(|hsla\(|color-mix\(|var\(--.*(color|accent|surface|text|border))/i;
const FONT_SIZE_VALUE_PATTERN = /^((clamp|min|max)\(|var\(--.*font-size|-?\d*\.?\d+(px|rem|em))$/i;
const FONT_WEIGHT_VALUE_PATTERN = /^(normal|bold|[1-9]00|[1-9]50)$/i;
const LENGTH_VALUE_PATTERN = /^(0|-?\d*\.?\d+(px|rem|em|vh|vw|%)|calc\(|clamp\(|var\(--)/i;
const SHADOW_VALUE_PATTERN = /^(none|inset\s|0\s|-?\d*\.?\d+(px|rem|em)\s)/i;

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function withDefaults(values: string[], fallback: string[]): string[] {
  return values.length ? uniqueSorted(values) : fallback;
}

function pushToken(buckets: StyleTokenBuckets, bucket: StyleTokenBucket, value: string): void {
  buckets[bucket].push(value);
}

function collectStyleToken(buckets: StyleTokenBuckets, name: string, value: string): void {
  if (COLOR_NAME_PATTERN.test(name) || COLOR_VALUE_PATTERN.test(value)) {
    pushToken(buckets, 'colors', value);
  }
  if (FONT_SIZE_NAME_PATTERN.test(name) || FONT_SIZE_VALUE_PATTERN.test(value)) {
    pushToken(buckets, 'fontSizes', value);
  }
  if (FONT_WEIGHT_NAME_PATTERN.test(name) || FONT_WEIGHT_VALUE_PATTERN.test(value)) {
    pushToken(buckets, 'fontWeights', value);
  }
  if (SPACING_NAME_PATTERN.test(name) && LENGTH_VALUE_PATTERN.test(value)) {
    pushToken(buckets, 'spacing', value);
  }
  if (RADIUS_NAME_PATTERN.test(name) && LENGTH_VALUE_PATTERN.test(value)) {
    pushToken(buckets, 'radius', value);
  }
  if (SHADOW_NAME_PATTERN.test(name) || SHADOW_VALUE_PATTERN.test(value)) {
    pushToken(buckets, 'shadows', value);
  }
}

export function buildTemplateStyleProfileFromCssVars(
  cssVars: Record<string, string>,
  options: Omit<TemplateStyleProfileBuildOptions, 'fallbackCssVars'> = {},
): TemplateStyleProfile {
  const buckets: StyleTokenBuckets = {
    colors: [],
    fontSizes: [],
    fontWeights: [],
    spacing: [],
    radius: [],
    shadows: [],
  };

  Object.entries(cssVars).forEach(([name, value]) => {
    collectStyleToken(buckets, name, value);
  });

  return {
    colors: withDefaults(buckets.colors, DEFAULT_STYLE_TOKENS.colors),
    fontSizes: withDefaults(buckets.fontSizes, DEFAULT_STYLE_TOKENS.fontSizes),
    fontWeights: withDefaults(buckets.fontWeights, DEFAULT_STYLE_TOKENS.fontWeights),
    spacing: withDefaults(buckets.spacing, DEFAULT_STYLE_TOKENS.spacing),
    radius: withDefaults(buckets.radius, DEFAULT_STYLE_TOKENS.radius),
    shadows: withDefaults(buckets.shadows, DEFAULT_STYLE_TOKENS.shadows),
    componentDensity: options.componentDensity,
    commonLayoutPatterns: uniqueSorted(options.commonLayoutPatterns ?? []),
  };
}

export function buildTemplateStyleProfile(
  document: ThemeLayoutStyleDocument,
  options: TemplateStyleProfileBuildOptions = {},
): TemplateStyleProfile {
  return buildTemplateStyleProfileFromCssVars(resolveThemeLayoutCssVars(document, options.fallbackCssVars), {
    commonLayoutPatterns: options.commonLayoutPatterns,
    componentDensity: options.componentDensity,
  });
}
