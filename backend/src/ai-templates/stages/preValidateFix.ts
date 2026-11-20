/**
 * Pre-Validate Fix — automatic pre-repair chain before SchemaGen validation.
 *
 * Runs BEFORE parseAndValidate() to fix common LLM output issues mechanically,
 * reducing unnecessary LLM retries. Each fix is idempotent and logged.
 *
 * Fix chain:
 *  1. dedupeNodeIds — auto-deduplicate cross-page node IDs
 *  2. autoBizComponents — auto-complete biz-* component descriptors
 *  3. removeUnknownProps — strip props not declared in component catalog
 *  4. fixDangerousUrls — replace dangerous / non-allowlisted URL props
 *
 * For biz-* (custom reusable templates) whose descriptor has empty props,
 * `removeUnknownProps` still strips obviously bogus prop names by using a
 * conservative whitelist of common UI prop keys. Real editable prop names
 * from `componentTemplates[alias].propNames` (if present) take precedence.
 *
 * ## Ordering assumption
 *
 * `autoBizComponents` builds its `declaredAliases` set from
 * `document.components` plus the static `CORE_COMPONENTS` catalog. Callers
 * that use `migrateThemeLayoutDocument` to finalize the catalog MUST run
 * `autoBizComponents` BEFORE migration (or otherwise ensure the components
 * list is final at the time `preValidateAndFix` runs). Otherwise LLM
 * output referencing biz-* aliases will be missed by `removeUnknownProps`
 * and validation will flag `missing_component_descriptor` even though the
 * auto-completion is supposed to add them.
 */

import { CORE_COMPONENTS } from '@shared/agent/runtime';

export interface PreValidateFixOptions {
  archetype?: string;
  ensureThemeContract?: boolean;
}

export interface PreValidateFixResult {
  document: Record<string, unknown>;
  fixes: string[];
}

/**
 * Run the full pre-repair chain on a raw LLM output document.
 * Returns the fixed document + a list of applied fixes (for logging).
 */
export function preValidateAndFix(
  rawDoc: Record<string, unknown>,
  componentTemplates?: Record<string, unknown>,
  options: PreValidateFixOptions = {},
): PreValidateFixResult {
  const fixes: string[] = [];

  // 1. Dedupe node IDs
  const dedupeCount = dedupeNodeIds(rawDoc);
  if (dedupeCount > 0) {
    fixes.push(`Auto-deduplicated ${dedupeCount} node IDs`);
  }

  // 2. Auto-complete biz-* component descriptors
  const bizCount = autoBizComponents(rawDoc, componentTemplates);
  if (bizCount > 0) {
    fixes.push(`Auto-added ${bizCount} biz-* component descriptors`);
  }

  // 3. Normalize common core.* prop aliases, enums, and scalar types before stripping unknowns
  const normalizedProps = normalizeCorePropValues(rawDoc);
  if (normalizedProps > 0) {
    fixes.push(`Auto-normalized ${normalizedProps} core prop values`);
  }

  // 4. Remove unknown props
  const removedCount = removeUnknownProps(rawDoc, componentTemplates);
  if (removedCount > 0) {
    fixes.push(`Auto-removed ${removedCount} unknown props`);
  }

  // 5. Fix dangerous / non-allowlisted URL props (src, href, url, poster, background, to)
  const fixedUrls = fixDangerousUrls(rawDoc);
  if (fixedUrls > 0) {
    fixes.push(`Auto-fixed ${fixedUrls} dangerous/non-allowlisted URL props`);
  }

  // 6. Deterministically backfill required theme cssVars contract when opted in
  if (options.ensureThemeContract) {
    const fixedCssVars = ensureThemeCssVarsContract(rawDoc, { archetype: options.archetype });
    if (fixedCssVars > 0) {
      fixes.push(`Auto-derived ${fixedCssVars} required theme cssVars`);
    }
  }

  return { document: rawDoc, fixes };
}

/**
 * Deduplicate cross-page node IDs.
 * First occurrence keeps original ID; subsequent duplicates get `-2`, `-3`, etc.
 * Returns the count of renamed nodes.
 */
export function dedupeNodeIds(document: Record<string, unknown>): number {
  const seen = new Set<string>();
  let renameCount = 0;

  const renameDup = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(renameDup);
      return;
    }
    const n = node as { id?: string; children?: unknown[] };
    if (typeof n.id === 'string' && n.id.length > 0) {
      if (seen.has(n.id)) {
        let suffix = 2;
        let candidate = `${n.id}-${suffix}`;
        while (seen.has(candidate)) {
          suffix += 1;
          candidate = `${n.id}-${suffix}`;
        }
        n.id = candidate;
        renameCount++;
      }
      seen.add(n.id);
    }
    (n.children ?? []).forEach(renameDup);
  };

  const pages = Array.isArray(document.pages) ? document.pages : [];
  pages.forEach((page) => {
    const p = page as { layout?: unknown };
    if (p.layout) {
      renameDup(p.layout);
    }
  });

  return renameCount;
}

/**
 * Matches the documented `biz-*` / `biz.*` namespace (e.g. `biz-promo-card`,
 * `biz.promo_card`, `biz.promoCard`). The separator after `biz` may be
 * `.`, `-`, or `_`; the rest of the alias may contain `[a-z0-9_-]`. Anything
 * else is treated as not-a-biz-component and skipped by `autoBizComponents`
 * so that arbitrary LLM-supplied aliases cannot poison the component catalog.
 */
const BIZ_NAMESPACE_PATTERN = /^biz[._-][a-z0-9_-]+$/i;

/**
 * Auto-complete biz-* component descriptors.
 * If componentTemplates defines a biz-* alias that's not in components,
 * generate a minimal descriptor.
 *
 * Only aliases matching `BIZ_NAMESPACE_PATTERN` are eligible. This is a
 * defense-in-depth check so that LLM-controlled keys cannot be added to
 * the component catalog as new top-level components.
 * Returns the count of added descriptors.
 */
export function autoBizComponents(
  document: Record<string, unknown>,
  componentTemplates?: Record<string, unknown>,
): number {
  const resolvedTemplates =
    componentTemplates ??
    (document.componentTemplates as Record<string, unknown> | undefined) ??
    {};

  const existingComponents = Array.isArray(document.components)
    ? (document.components as Record<string, unknown>[])
    : [];

  const coreAliases = new Set(CORE_COMPONENTS.map((c) => c.alias));
  const declaredAliases = new Set<string>([
    ...coreAliases,
    ...existingComponents
      .map((c) => (c as { alias?: unknown }).alias)
      .filter((a): a is string => typeof a === 'string'),
  ]);

  const autoComponents: Record<string, unknown>[] = [];
  for (const [alias, ct] of Object.entries(resolvedTemplates)) {
    if (!BIZ_NAMESPACE_PATTERN.test(alias)) {
      continue;
    }
    if (!declaredAliases.has(alias)) {
      const dn = (ct as { displayName?: unknown } | null)?.displayName;
      const displayName = typeof dn === 'string' ? dn : alias;
      autoComponents.push({
        alias,
        name: displayName,
        kind: 'layout',
        description: displayName,
        props: [],
      });
    }
  }

  if (autoComponents.length > 0) {
    document.components = [...existingComponents, ...autoComponents];
  }

  return autoComponents.length;
}

/**
 * Conservative whitelist of prop names allowed on biz-* (custom reusable
 * template) nodes whose auto-generated descriptor has no declared props.
 * Keeps obviously-bogus LLM output (random camelCase, `foobar`, etc.) from
 * leaking through while preserving common editable UI fields.
 */
const FALLBACK_BIZ_PROP_WHITELIST: ReadonlySet<string> = new Set([
  'text',
  'label',
  'title',
  'subtitle',
  'description',
  'content',
  'src',
  'alt',
  'href',
  'value',
  'placeholder',
  'tone',
  'variant',
  'icon',
  'iconName',
  'color',
  'size',
  'align',
  'gap',
  'disabled',
  'loading',
  'badge',
  'max',
  'min',
  'onClick',
  'onActionClick',
  'onTabClick',
]);

/**
 * Remove props that are not declared in the component catalog.
 *
 * For core.* nodes: only declared prop names are kept.
 * For biz-* nodes: declared prop names are kept; if the descriptor declares
 *   none, a conservative whitelist of common UI prop names is used.
 * For nodes whose alias is not in the catalog at all: props are left alone
 *   (we don't know what's safe to strip).
 *
 * Returns the count of removed props.
 */
const UNIVERSAL_ALLOWED_PROPS: ReadonlySet<string> = new Set(['style', 'dataBinding']);
const EXTRA_ALLOWED_PROPS_BY_ALIAS: Partial<Record<string, ReadonlySet<string>>> = {
  'core.image': new Set(['assetId']),
  'core.screen': new Set(['surface', 'chrome']),
};

export function removeUnknownProps(
  document: Record<string, unknown>,
  componentTemplates?: Record<string, unknown>,
): number {
  const components = Array.isArray(document.components)
    ? (document.components as Record<string, unknown>[])
    : [];

  // Build a map of alias → Set of declared prop names
  const propTypesByAlias = new Map<string, Set<string>>();
  for (const comp of components) {
    const alias = (comp as { alias?: unknown }).alias;
    const props = (comp as { props?: unknown[] }).props;
    if (typeof alias === 'string' && Array.isArray(props)) {
      const propNames = new Set<string>(
        props
          .map((p) => (p as { name?: unknown }).name)
          .filter((n): n is string => typeof n === 'string'),
      );
      propTypesByAlias.set(alias, propNames);
    }
  }

  let removedCount = 0;

  const cleanNode = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(cleanNode);
      return;
    }

    const n = node as { alias?: string; props?: Record<string, unknown>; children?: unknown[] };
    if (typeof n.alias === 'string' && n.props && typeof n.props === 'object') {
      const allowed = propTypesByAlias.get(n.alias);
      const extraAllowed = EXTRA_ALLOWED_PROPS_BY_ALIAS[n.alias];

      if (allowed === undefined) {
        // Alias not in catalog — leave props alone; downstream validator decides.
      } else if (allowed.size > 0) {
        // Strict: only declared names (plus validator-allowlisted universal/alias props) survive
        for (const key of Object.keys(n.props)) {
          if (!allowed.has(key) && !UNIVERSAL_ALLOWED_PROPS.has(key) && !extraAllowed?.has(key)) {
            delete n.props[key];
            removedCount++;
          }
        }
      } else if (componentTemplates && n.alias in componentTemplates) {
        // biz-* with no declared props: use declared `propNames` from the
        // template if present, otherwise fall back to the conservative whitelist.
        const declared = (componentTemplates[n.alias] as { propNames?: unknown } | null)?.propNames;
        const allowedNames =
          Array.isArray(declared) && declared.length > 0
            ? new Set(declared.filter((n): n is string => typeof n === 'string'))
            : FALLBACK_BIZ_PROP_WHITELIST;
        for (const key of Object.keys(n.props)) {
          if (!allowedNames.has(key)) {
            delete n.props[key];
            removedCount++;
          }
        }
      } else {
        // Empty declared-props alias not in componentTemplates — apply fallback.
        for (const key of Object.keys(n.props)) {
          if (!FALLBACK_BIZ_PROP_WHITELIST.has(key)) {
            delete n.props[key];
            removedCount++;
          }
        }
      }
    }

    if (Array.isArray(n.children)) {
      n.children.forEach(cleanNode);
    }
  };

  const pages = Array.isArray(document.pages) ? document.pages : [];
  pages.forEach((page) => {
    const p = page as { layout?: unknown };
    if (p.layout) {
      cleanNode(p.layout);
    }
  });

  return removedCount;
}

/**
 * Prop names treated as URL-shaped values that need scheme/format validation.
 * Applied to every node regardless of alias — defense in depth so a custom
 * `biz-*` template or an `core.html` link slot can't smuggle a `javascript:`
 * URL past the `core.image`-only check.
 */
const URL_PROP_NAMES: ReadonlySet<string> = new Set([
  'src',
  'href',
  'url',
  'poster',
  'background',
  'to',
]);

/**
 * Dangerous URI schemes that must never be forwarded to the renderer.
 * Comparison is case-insensitive (e.g. `JavaScript:`, `DATA:` are blocked).
 */
const DANGEROUS_SCHEMES: readonly string[] = ['javascript:', 'vbscript:', 'data:'];

/**
 * Allowlist of leading characters / patterns for safe URL values:
 *  - `http://` and `https://` (case-insensitive)
 *  - `/` (single leading slash = same-origin path) — protocol-relative `//`
 *    is explicitly rejected to prevent same-protocol SSRF hand-offs.
 *  - mailto:, tel:, sms: are also allowed as common safe schemes.
 */
const SAFE_URL_PATTERN = /^(https?:\/\/|\/(?!\/)|mailto:|tel:|sms:)/i;

/**
 * Replace dangerous / non-allowlisted URL-shaped props with a safe placeholder.
 * Scans every node (regardless of alias) and every prop name in
 * {@link URL_PROP_NAMES}. Lower-cases the value before scheme comparison so
 * `JavaScript:` / `DATA:` / mixed-case variants cannot bypass the check.
 * Returns the count of fixed URLs.
 */
export function fixDangerousUrls(document: Record<string, unknown>): number {
  const PLACEHOLDER = 'https://placehold.co/400x300/e2e8f0/64748b?text=Image';
  let fixedCount = 0;

  const fixNode = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(fixNode);
      return;
    }

    const n = node as { props?: Record<string, unknown>; children?: unknown[] };
    if (n.props && typeof n.props === 'object') {
      for (const key of Object.keys(n.props)) {
        if (!URL_PROP_NAMES.has(key)) {
          continue;
        }
        const value = n.props[key];
        if (typeof value !== 'string' || value.length === 0) {
          continue;
        }
        if (isDangerousOrUnallowlistedUrl(value)) {
          n.props[key] = PLACEHOLDER;
          fixedCount++;
        }
      }
    }

    if (Array.isArray(n.children)) {
      n.children.forEach(fixNode);
    }
  };

  const pages = Array.isArray(document.pages) ? document.pages : [];
  pages.forEach((page) => {
    const p = page as { layout?: unknown };
    if (p.layout) {
      fixNode(p.layout);
    }
  });

  return fixedCount;
}

/**
 * Test if a URL value is dangerous (dangerous scheme) or unallowlisted
 * (does not start with http(s)://, a single `/`, mailto:, tel:, or sms:).
 */
function isDangerousOrUnallowlistedUrl(value: string): boolean {
  // Case-insensitive scheme check. Trim leading whitespace first so
  // `\tjavascript:` or ` javascript:` doesn't slip past the check.
  const lower = value.trimStart().toLowerCase();
  if (DANGEROUS_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    return true;
  }
  // Allowlist of safe prefixes
  return !SAFE_URL_PATTERN.test(value);
}

interface ComponentPropSchema {
  name?: string;
  type?: string;
  enum?: string[];
}

const CORE_PROP_ALIAS_REMAP: Partial<Record<string, Record<string, string>>> = {
  'core.button': { text: 'label' },
  'core.notice': { variant: 'tone' },
};

const TEXT_VARIANT_SYNONYMS: Record<string, string> = {
  h1: 'display',
  h2: 'heading',
  h3: 'subheading',
  header: 'heading',
  desc: 'body',
  description: 'body',
  paragraph: 'body',
  content: 'body',
  small: 'caption',
  sub: 'caption',
  footnote: 'caption',
  meta: 'caption',
  subhead: 'subheading',
};

const BUTTON_VARIANT_SYNONYMS: Record<string, string> = {
  outline: 'secondary',
  ghost: 'secondary',
  default: 'secondary',
  text: 'link',
  solid: 'primary',
  filled: 'primary',
};

const TONE_SYNONYMS: Record<string, string[]> = {
  primary: ['accent', 'info', 'highlight', 'default'],
  brand: ['accent', 'info', 'highlight', 'default'],
  danger: ['error', 'warning', 'hot', 'neutral'],
  red: ['error', 'warning', 'hot', 'neutral'],
  warn: ['warning'],
  default: ['neutral', 'default'],
  gray: ['neutral', 'default'],
  grey: ['neutral', 'default'],
  promo: ['promo', 'deal', 'hot', 'accent'],
};

function coerceEnumValue(alias: string, propName: string, raw: unknown, allowed: string[]): string {
  const normalized = String(raw).trim();
  const exact = allowed.find((item) => item === normalized);
  if (exact) {
    return exact;
  }
  const lower = normalized.toLowerCase();
  const caseFold = allowed.find((item) => item.toLowerCase() === lower);
  if (caseFold) {
    return caseFold;
  }

  if (alias === 'core.text' && propName === 'variant') {
    const mapped = TEXT_VARIANT_SYNONYMS[lower];
    if (mapped && allowed.includes(mapped)) {
      return mapped;
    }
    if (allowed.includes('body')) {
      return 'body';
    }
  }

  if (alias === 'core.button' && propName === 'variant') {
    const mapped = BUTTON_VARIANT_SYNONYMS[lower];
    if (mapped && allowed.includes(mapped)) {
      return mapped;
    }
  }

  if (propName === 'tone' || propName === 'type') {
    const candidates = TONE_SYNONYMS[lower] ?? [];
    const hit = candidates.find((c) => allowed.includes(c));
    if (hit) {
      return hit;
    }
    if (lower === 'danger') {
      if (allowed.includes('error')) {
        return 'error';
      }
      if (allowed.includes('warning')) {
        return 'warning';
      }
    }
  }

  if (alias === 'core.image' && propName === 'objectFit') {
    if (lower === 'fit' && allowed.includes('contain')) {
      return 'contain';
    }
    if (lower === 'crop' && allowed.includes('cover')) {
      return 'cover';
    }
  }

  return allowed[0];
}

function coercePropBySchema(
  alias: string,
  prop: ComponentPropSchema,
  value: unknown,
): { action: 'keep' | 'replace' | 'delete'; value?: unknown } {
  if (value === undefined || value === null) {
    return { action: 'delete' };
  }
  if (prop.enum && prop.enum.length > 0) {
    const coerced = coerceEnumValue(alias, prop.name ?? '', value, prop.enum);
    return coerced === value ? { action: 'keep' } : { action: 'replace', value: coerced };
  }
  if (prop.type === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { action: 'keep' };
    }
    if (typeof value === 'string') {
      const cleaned = value.trim().replace(/%$/, '');
      if (cleaned.length > 0) {
        const parsed = Number(cleaned);
        if (Number.isFinite(parsed)) {
          return { action: 'replace', value: parsed };
        }
      }
    }
    return { action: 'delete' };
  }
  if (prop.type === 'boolean') {
    if (typeof value === 'boolean') {
      return { action: 'keep' };
    }
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (lower === 'true' || lower === '1') {
        return { action: 'replace', value: true };
      }
      if (lower === 'false' || lower === '0') {
        return { action: 'replace', value: false };
      }
    } else if (value === 1 || value === 0) {
      return { action: 'replace', value: value === 1 };
    }
    return { action: 'delete' };
  }
  if (prop.type === 'string[]') {
    if (Array.isArray(value)) {
      if (value.every((item) => typeof item === 'string')) {
        return { action: 'keep' };
      }
      const mapped = value
        .map((item) => {
          if (typeof item === 'string') {
            return item.trim();
          }
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const rec = item as Record<string, unknown>;
            const str = rec.label ?? rec.text ?? rec.title ?? rec.name;
            return typeof str === 'string' ? str.trim() : '';
          }
          return String(item ?? '').trim();
        })
        .filter((item) => item.length > 0);
      return { action: 'replace', value: mapped };
    }
    if (typeof value === 'string') {
      const parts = value
        .split(/[,，|/]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return { action: 'replace', value: parts };
    }
    return { action: 'delete' };
  }
  if (prop.type === 'object') {
    return typeof value === 'object' && !Array.isArray(value)
      ? { action: 'keep' }
      : { action: 'delete' };
  }
  if (prop.type === 'array') {
    return Array.isArray(value) ? { action: 'keep' } : { action: 'delete' };
  }
  return { action: 'keep' };
}

/**
 * Normalize common LLM prop mistakes on core.* nodes (aliases, enum synonyms, scalar coercion).
 */
export function normalizeCorePropValues(document: Record<string, unknown>): number {
  const components = Array.isArray(document.components)
    ? (document.components as { alias?: unknown; props?: ComponentPropSchema[] }[])
    : [];

  const schemaByAlias = new Map<string, Map<string, ComponentPropSchema>>();
  for (const comp of CORE_COMPONENTS) {
    const map = new Map<string, ComponentPropSchema>();
    for (const p of comp.props) {
      map.set(p.name, p);
    }
    schemaByAlias.set(comp.alias, map);
  }
  for (const comp of components) {
    if (
      typeof comp.alias === 'string' &&
      comp.alias.startsWith('core.') &&
      Array.isArray(comp.props)
    ) {
      const map = new Map<string, ComponentPropSchema>();
      for (const p of comp.props) {
        if (typeof p.name === 'string') {
          map.set(p.name, p);
        }
      }
      schemaByAlias.set(comp.alias, map);
    }
  }

  let fixedCount = 0;

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    const n = node as { alias?: unknown; props?: Record<string, unknown>; children?: unknown[] };
    if (
      typeof n.alias === 'string' &&
      n.alias.startsWith('core.') &&
      n.props &&
      typeof n.props === 'object'
    ) {
      const remap = CORE_PROP_ALIAS_REMAP[n.alias];
      if (remap) {
        for (const [oldKey, newKey] of Object.entries(remap)) {
          if (oldKey in n.props) {
            if (!(newKey in n.props) || n.props[newKey] === undefined) {
              n.props[newKey] = n.props[oldKey];
            }
            delete n.props[oldKey];
            fixedCount += 1;
          }
        }
      }

      const propSchemas = schemaByAlias.get(n.alias);
      if (propSchemas) {
        for (const [key, val] of Object.entries(n.props)) {
          const schema = propSchemas.get(key);
          if (!schema) {
            continue;
          }
          const outcome = coercePropBySchema(n.alias, schema, val);
          if (outcome.action === 'replace') {
            n.props[key] = outcome.value;
            fixedCount += 1;
          } else if (outcome.action === 'delete') {
            delete n.props[key];
            fixedCount += 1;
          }
        }
      }
    }

    if (Array.isArray(n.children)) {
      n.children.forEach(visit);
    }
  };

  const pages = Array.isArray(document.pages) ? document.pages : [];
  pages.forEach((page) => {
    const p = page as { layout?: unknown };
    if (p.layout) {
      visit(p.layout);
    }
  });

  return fixedCount;
}

const CSS_COLOR_PATTERN =
  /^(#([0-9a-f]{3,8})|rgba?\([^)]*\)|hsla?\([^)]*\)|var\(--[\w-]+(,[^)]*)?\)|transparent|currentcolor|[a-z]+)$/i;

function validCssColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && CSS_COLOR_PATTERN.test(trimmed) ? trimmed : undefined;
}

function isDarkHexColor(color: string | undefined): boolean {
  if (!color?.startsWith('#')) {
    return false;
  }
  const hex = color.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    return false;
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/**
 * Deterministically derive any missing or invalid required theme contract cssVars
 * from existing tokens (e.g. `--color-primary`, `--color-bg`, `--color-card`)
 * or archetype light/dark defaults, writing back to both `cssVars` and `style.cssVars`.
 */
export function ensureThemeCssVarsContract(
  document: Record<string, unknown>,
  options: { archetype?: string } = {},
): number {
  const rawTop =
    document.cssVars && typeof document.cssVars === 'object' && !Array.isArray(document.cssVars)
      ? (document.cssVars as Record<string, unknown>)
      : {};
  const rawStyle =
    document.style && typeof document.style === 'object' && !Array.isArray(document.style)
      ? (document.style as Record<string, unknown>)
      : {};
  const rawStyleVars =
    rawStyle.cssVars && typeof rawStyle.cssVars === 'object' && !Array.isArray(rawStyle.cssVars)
      ? (rawStyle.cssVars as Record<string, unknown>)
      : {};

  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawStyleVars)) {
    if (typeof v === 'string' && v.trim()) {
      merged[k] = v.trim();
    }
  }
  for (const [k, v] of Object.entries(rawTop)) {
    if (typeof v === 'string' && v.trim()) {
      merged[k] = v.trim();
    }
  }

  const isDark =
    options.archetype === 'dark-pro' ||
    isDarkHexColor(validCssColor(merged['--surface']) ?? validCssColor(merged['--color-bg']));

  const derived: Record<string, string> = {
    '--accent':
      validCssColor(merged['--accent']) ??
      validCssColor(merged['--color-primary']) ??
      validCssColor(merged['--primary']) ??
      validCssColor(merged['--brand']) ??
      (isDark ? '#38BDF8' : '#2563EB'),
    '--surface':
      validCssColor(merged['--surface']) ??
      validCssColor(merged['--color-bg']) ??
      validCssColor(merged['--bg']) ??
      (isDark ? '#0F172A' : '#F8FAFC'),
    '--surface-muted':
      validCssColor(merged['--surface-muted']) ??
      validCssColor(merged['--color-bg-muted']) ??
      (isDark ? '#1E293B' : '#F1F5F9'),
    '--panel-bg':
      validCssColor(merged['--panel-bg']) ??
      validCssColor(merged['--color-card']) ??
      validCssColor(merged['--card-bg']) ??
      (isDark ? '#1E293B' : '#FFFFFF'),
    '--panel-border':
      validCssColor(merged['--panel-border']) ??
      validCssColor(merged['--border-color']) ??
      (isDark ? '#334155' : '#E2E8F0'),
    '--border-color':
      validCssColor(merged['--border-color']) ??
      validCssColor(merged['--panel-border']) ??
      (isDark ? '#334155' : '#E2E8F0'),
    '--text-heading-color':
      validCssColor(merged['--text-heading-color']) ??
      validCssColor(merged['--color-text']) ??
      (isDark ? '#F8FAFC' : '#0F172A'),
    '--text-body-color':
      validCssColor(merged['--text-body-color']) ??
      validCssColor(merged['--color-text']) ??
      (isDark ? '#CBD5E1' : '#334155'),
    '--text-muted-color':
      validCssColor(merged['--text-muted-color']) ??
      validCssColor(merged['--color-text-weak']) ??
      (isDark ? '#94A3B8' : '#64748B'),
  };

  let changed = 0;
  for (const [key, fallbackVal] of Object.entries(derived)) {
    if (validCssColor(merged[key]) !== fallbackVal) {
      merged[key] = fallbackVal;
      changed += 1;
    }
  }

  if (changed > 0 || !document.cssVars) {
    document.cssVars = merged;
    document.style = { ...rawStyle, cssVars: { ...merged } };
  }

  return changed;
}
