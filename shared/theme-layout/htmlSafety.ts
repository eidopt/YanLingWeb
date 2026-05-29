/**
 * Canonical HTML-safety allowlists and inline-style sanitizer for `core.html` nodes.
 *
 * This is the single source of truth shared by:
 *   - the renderer runtime (`src/ui/renderer/components/HtmlNode/HtmlNode.tsx`)
 *   - the React source exporter (`src/exporters/react-source/compileNode.ts`)
 *
 * Reconciliation notes (the two consumers previously diverged):
 *   - Tag allowlist: only the renderer enforced one; the exporter passed the raw
 *     `tag` prop through. The renderer's 22-tag allowlist is adopted as canonical.
 *   - Style-prop allowlist: only the renderer filtered by property name. The
 *     exporter previously filtered only by value type + unsafe value. We adopt the
 *     STRICTER renderer behavior (property-name allowlist) for both paths.
 *   - Unsafe-value detection: identical in both files; kept verbatim.
 *
 * Kept ESM-only (no CommonJS interop) to satisfy
 * `scripts/check-shared-module-format.cjs`, and placed under `shared/theme-layout`
 * (not `@shared/agent/*`) so both `src/ui/...` and `src/exporters/...` can import
 * it without tripping `scripts/check-shared-boundaries.cjs`.
 */

export const ALLOWED_HTML_TAGS: ReadonlySet<string> = new Set([
  'div',
  'span',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'main',
  'nav',
  'ul',
  'ol',
  'li',
  'figure',
  'figcaption',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'label',
]);

export const ALLOWED_HTML_STYLE_PROPS: ReadonlySet<string> = new Set([
  'alignItems',
  'background',
  'backgroundColor',
  'border',
  'borderColor',
  'borderRadius',
  'borderStyle',
  'borderWidth',
  'color',
  'display',
  'flexDirection',
  'fontSize',
  'fontWeight',
  'gap',
  'height',
  'justifyContent',
  'lineHeight',
  'margin',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginTop',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'opacity',
  'overflow',
  'padding',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'textAlign',
  'width',
]);

/**
 * Resolve a tag against the allowlist, falling back to `div` for anything unknown.
 * Mirrors the renderer's previous local behavior.
 */
export function resolveHtmlTag(tag: unknown): string {
  return typeof tag === 'string' && ALLOWED_HTML_TAGS.has(tag) ? tag : 'div';
}

/**
 * Detect inline-style values that could smuggle in script/URL-based payloads.
 */
export function isUnsafeStyleValue(value: unknown): boolean {
  return typeof value === 'string' && /(?:javascript:|data:text\/html|expression\s*\(|url\s*\()/i.test(value);
}

/**
 * Filter an arbitrary value into a safe inline-style record:
 *   - keeps only allowlisted property names
 *   - keeps only string/number values
 *   - drops values flagged by {@link isUnsafeStyleValue}
 */
export function sanitizeInlineStyle(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string | number] =>
        ALLOWED_HTML_STYLE_PROPS.has(entry[0]) &&
        (typeof entry[1] === 'string' || typeof entry[1] === 'number') &&
        !isUnsafeStyleValue(entry[1]),
    ),
  );
}
