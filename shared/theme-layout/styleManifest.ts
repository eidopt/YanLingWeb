export interface ThemeLayoutStyleManifest {
  cssVars?: Record<string, string>;
}

export interface ThemeLayoutStyleDocument {
  cssVars?: Record<string, string>;
  style?: ThemeLayoutStyleManifest;
}

function isCssVarName(value: string): boolean {
  return /^--[a-zA-Z0-9-_]+$/.test(value);
}

function sanitizeCssVars(
  cssVars: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!cssVars) {
    return undefined;
  }
  const entries = Object.entries(cssVars)
    .filter(([key, value]) => isCssVarName(key) && typeof value === 'string');
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function resolveThemeLayoutCssVars(
  document: ThemeLayoutStyleDocument,
  fallbackCssVars?: Record<string, string>,
): Record<string, string> {
  return {
    ...(sanitizeCssVars(fallbackCssVars) ?? {}),
    ...(sanitizeCssVars(document.cssVars) ?? {}),
    ...(sanitizeCssVars(document.style?.cssVars) ?? {}),
  };
}

export function withThemeLayoutStyleManifest<
  T extends object,
>(
  document: T,
  cssVars?: Record<string, string>,
): T & ThemeLayoutStyleDocument {
  const currentDocument = document as ThemeLayoutStyleDocument;
  const resolvedCssVars = resolveThemeLayoutCssVars(
    currentDocument,
    cssVars,
  );
  if (!Object.keys(resolvedCssVars).length) {
    return document as T & ThemeLayoutStyleDocument;
  }

  const style = (
    currentDocument.style &&
    typeof currentDocument.style === 'object' &&
    !Array.isArray(currentDocument.style)
  )
    ? currentDocument.style as Record<string, unknown>
    : {};

  return {
    ...document,
    cssVars: resolvedCssVars,
    style: {
      ...style,
      cssVars: resolvedCssVars,
    },
  };
}
