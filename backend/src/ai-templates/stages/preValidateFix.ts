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

  // 3. Remove unknown props
  const removedCount = removeUnknownProps(rawDoc, componentTemplates);
  if (removedCount > 0) {
    fixes.push(`Auto-removed ${removedCount} unknown props`);
  }

  // 4. Fix dangerous / non-allowlisted URL props (src, href, url, poster, background, to)
  const fixedUrls = fixDangerousUrls(rawDoc);
  if (fixedUrls > 0) {
    fixes.push(`Auto-fixed ${fixedUrls} dangerous/non-allowlisted URL props`);
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
