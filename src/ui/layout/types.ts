export interface LayoutNodeLayout {
  mode: 'flow' | 'grid' | 'absolute';
  flowRow?: number;
  order?: number;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  gridColumn?: string;
  gridRow?: string;
  alignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';
  justifySelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';
}

export interface LayoutNodeFrame {
  position: 'absolute';
  x?: number;
  y?: number;
  left?: number | string;
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  zIndex?: number;
  unit?: 'px' | '%';
}

export interface LayoutPropDescriptor {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
  description?: string;
  enum?: string[];
}

export interface ThemeComponentDescriptor {
  alias: string;
  name: string;
  kind: 'layout' | 'component';
  description: string;
  props: LayoutPropDescriptor[];
}

export interface ThemeLayoutNavigateAction {
  type: 'navigate';
  targetPageId: string;
}

export interface ThemeLayoutSetVisibilityAction {
  type: 'setVisibility';
  targetNodeId: string;
  visible: boolean;
}

export interface ThemeLayoutToggleVisibilityAction {
  type: 'toggleVisibility';
  targetNodeId: string;
}

export type ThemeLayoutNodeAction =
  | ThemeLayoutNavigateAction
  | ThemeLayoutSetVisibilityAction
  | ThemeLayoutToggleVisibilityAction;

export type ThemeLayoutTabInteraction = ThemeLayoutNavigateAction | Record<string, ThemeLayoutNavigateAction>;

export interface ThemeLayoutNodeInteractions {
  onClick?: ThemeLayoutNodeAction;
  onActionClick?: ThemeLayoutNodeAction;
  onStatusClick?: ThemeLayoutNodeAction;
  onTabClick?: ThemeLayoutTabInteraction;
}

export interface ThemeLayoutNode {
  id: string;
  alias: string;
  slot?: 'body' | 'footer';
  layout: LayoutNodeLayout;
  frame?: LayoutNodeFrame;
  props?: Record<string, unknown>;
  interactions?: ThemeLayoutNodeInteractions;
  children?: ThemeLayoutNode[];
}

export interface ThemeLayoutPage {
  id: string;
  name: string;
  description?: string;
  layout: ThemeLayoutNode;
}

export interface ThemeLibraryDependency {
  name: string;
  url: string;
}

export interface ThemeLayoutStyleManifest {
  cssVars?: Record<string, string>;
}

export interface ThemeLayoutWidgetPolicy {
  enabled?: boolean;
  allowedLibraries?: string[];
  allowedRenderers?: string[];
  allowedCapabilities?: ('chart' | 'animation' | 'diagram')[];
}

export interface ThemeLayoutDataSource {
  id: string;
  kind: 'staticJson' | 'publicJsonEndpoint';
  description?: string;
  url?: string;
  data?: unknown;
  select?: string;
  fallback?: unknown;
}

export interface ThemeLayoutDocument {
  version: number;
  schemaVersion?: number;
  themeId: string;
  themeName: string;
  pageName?: string;
  description: string;
  components: ThemeComponentDescriptor[];
  defaultPageId: string;
  pages: ThemeLayoutPage[];
  layout: ThemeLayoutNode;
  dependencies?: ThemeLibraryDependency[];
  widgetPolicy?: ThemeLayoutWidgetPolicy;
  dataSources?: ThemeLayoutDataSource[];
  cssVars?: Record<string, string>;
  cssAnimations?: Record<string, string> | null;
  style?: ThemeLayoutStyleManifest;
}

export interface ThemeLayoutDocumentSource {
  version: number;
  schemaVersion?: number;
  themeId: string;
  themeName: string;
  pageName?: string;
  description: string;
  components: ThemeComponentDescriptor[];
  defaultPageId?: string;
  pages?: ThemeLayoutPage[];
  layout?: ThemeLayoutNode;
  dependencies?: ThemeLibraryDependency[];
  widgetPolicy?: ThemeLayoutWidgetPolicy;
  dataSources?: ThemeLayoutDataSource[];
  cssVars?: Record<string, string>;
  cssAnimations?: Record<string, string> | null;
  style?: ThemeLayoutStyleManifest;
}

function resolvePageName(layout: ThemeLayoutNode, fallback: string) {
  const title = layout.props?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : fallback;
}

export function getThemeLayoutPages(document: ThemeLayoutDocumentSource): ThemeLayoutPage[] {
  if (document.pages?.length) {
    return document.pages.map((page) => ({
      ...page,
      name: page.name.trim() || resolvePageName(page.layout, page.id),
    }));
  }

  if (!document.layout) {
    throw new Error(`Theme layout document "${document.themeId}"` + ' is missing both pages and layout.');
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through
  const fallbackPageId = document.defaultPageId?.trim() || document.layout.id;
  return [
    {
      id: fallbackPageId,
      /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through */
      name: document.pageName?.trim() || resolvePageName(document.layout, fallbackPageId),
      /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
      layout: document.layout,
    },
  ];
}

export function getThemeLayoutPage(document: ThemeLayoutDocumentSource, pageId?: string | null): ThemeLayoutPage {
  const pages = getThemeLayoutPages(document);
  if (!pages.length) {
    throw new Error(`Theme layout document "${document.themeId}"` + ' does not contain any pages.');
  }

  if (pageId) {
    const matchedPage = pages.find((page) => page.id === pageId);
    if (matchedPage) {
      return matchedPage;
    }
  }

  const defaultPageId = document.defaultPageId?.trim();
  return pages.find((page) => page.id === defaultPageId) ?? pages[0];
}

export function normalizeThemeLayoutDocument(document: ThemeLayoutDocumentSource): ThemeLayoutDocument {
  const pages = getThemeLayoutPages(document);
  const activePage = getThemeLayoutPage({ ...document, pages }, document.defaultPageId);

  return {
    version: document.version,
    schemaVersion: document.schemaVersion,
    themeId: document.themeId,
    themeName: document.themeName,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through
    pageName: document.pageName?.trim() || activePage.name,
    description: document.description,
    components: [...document.components],
    defaultPageId: activePage.id,
    pages,
    layout: activePage.layout,
    dependencies: document.dependencies ? [...document.dependencies] : undefined,
    dataSources: document.dataSources ? [...document.dataSources] : undefined,
    cssVars: document.cssVars ? { ...document.cssVars } : undefined,
    cssAnimations: document.cssAnimations ? { ...document.cssAnimations } : undefined,
    style: document.style
      ? {
          ...document.style,
          cssVars: document.style.cssVars ? { ...document.style.cssVars } : undefined,
        }
      : undefined,
  };
}
