import type {
  ThemeLayoutDocument,
  ThemeLayoutNode,
  ThemeLayoutPage,
} from '../../agent/types';

export const CURRENT_THEME_LAYOUT_SCHEMA_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord(input: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(input);
}

function resolvePageName(layout: ThemeLayoutNode, fallback: string): string {
  const title = layout.props?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : fallback;
}

function normalizePages(document: Record<string, unknown>): ThemeLayoutPage[] {
  if (Array.isArray(document.pages) && document.pages.length > 0) {
    return document.pages.map((page) => {
      const pageRecord = isRecord(page) ? page : {};
      const layout = pageRecord.layout as ThemeLayoutNode;
      const layoutId = isRecord(pageRecord.layout) && typeof pageRecord.layout.id === 'string'
        ? pageRecord.layout.id
        : 'page-1';
      const id = typeof pageRecord.id === 'string' && pageRecord.id.trim()
        ? pageRecord.id.trim()
        : layoutId;
      return {
        ...(pageRecord as unknown as ThemeLayoutPage),
        id,
        name: typeof pageRecord.name === 'string' && pageRecord.name.trim()
          ? pageRecord.name.trim()
          : resolvePageName(layout, id),
        layout,
      };
    });
  }

  const layout = document.layout as ThemeLayoutNode | undefined;
  if (!layout) {
    return [];
  }
  const defaultPageId = typeof document.defaultPageId === 'string'
    && document.defaultPageId.trim()
    ? document.defaultPageId.trim()
    : layout.id;
  const pageName = typeof document.pageName === 'string' && document.pageName.trim()
    ? document.pageName.trim()
    : resolvePageName(layout, defaultPageId);
  return [{ id: defaultPageId, name: pageName, layout }];
}

export function migrateThemeLayoutDocument(input: unknown): ThemeLayoutDocument {
  if (!isRecord(input)) {
    return input as ThemeLayoutDocument;
  }

  const document = cloneRecord(input);
  const pages = normalizePages(document);
  const requestedDefaultPageId = typeof document.defaultPageId === 'string'
    && document.defaultPageId.trim()
    ? document.defaultPageId.trim()
    : undefined;
  const activePage = (
    pages.find((page) => page.id === requestedDefaultPageId)
    ?? pages[0]
  ) as ThemeLayoutPage | undefined;

  return {
    ...(document as unknown as ThemeLayoutDocument),
    version: typeof document.version === 'number'
      ? document.version
      : CURRENT_THEME_LAYOUT_SCHEMA_VERSION,
    schemaVersion: typeof document.schemaVersion === 'number'
      ? document.schemaVersion
      : CURRENT_THEME_LAYOUT_SCHEMA_VERSION,
    pages,
    defaultPageId: activePage?.id ?? requestedDefaultPageId ?? '',
    layout: activePage?.layout ?? (document.layout as ThemeLayoutNode),
  };
}
