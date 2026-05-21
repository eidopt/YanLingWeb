const RESERVED_NAMES = new Set([
  'App',
  'HtmlBlock',
  'React',
  'UnsupportedNode',
  'WidgetPlaceholder',
]);

export function slugifyFileName(value: string, fallback = 'page'): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export function toPascalCase(value: string, fallback = 'Generated'): string {
  const words = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const name = words
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('');
  return name || fallback;
}

export function createStableComponentName(
  preferredName: string,
  fallbackId: string,
  usedNames: Set<string>,
): string {
  const baseName = toPascalCase(preferredName, toPascalCase(fallbackId, 'Page'));
  let candidate = `${baseName}Page`;
  if (RESERVED_NAMES.has(candidate)) {
    candidate = `Generated${candidate}`;
  }

  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}Page${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}
