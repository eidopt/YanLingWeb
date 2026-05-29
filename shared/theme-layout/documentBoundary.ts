import type {
  LayoutNodeLayout,
  LayoutPropDescriptor,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
  ThemeLayoutPage,
} from '../agent/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isLayoutNodeLayout(value: unknown): value is LayoutNodeLayout {
  return isRecord(value) && (value.mode === 'flow' || value.mode === 'grid' || value.mode === 'absolute');
}

function isLayoutPropDescriptor(value: unknown): value is LayoutPropDescriptor {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.type) &&
    (value.label === undefined || isString(value.label)) &&
    (value.description === undefined || isString(value.description)) &&
    (value.required === undefined || typeof value.required === 'boolean') &&
    (value.enum === undefined || (Array.isArray(value.enum) && value.enum.every(isString)))
  );
}

export function isThemeComponentDescriptor(value: unknown): value is ThemeComponentDescriptor {
  return (
    isRecord(value) &&
    isString(value.alias) &&
    isString(value.name) &&
    (value.kind === 'layout' || value.kind === 'component') &&
    isString(value.description) &&
    Array.isArray(value.props) &&
    value.props.every(isLayoutPropDescriptor)
  );
}

export function isThemeLayoutNode(value: unknown): value is ThemeLayoutNode {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.alias) &&
    isLayoutNodeLayout(value.layout) &&
    (value.props === undefined || isRecord(value.props)) &&
    (value.children === undefined || (Array.isArray(value.children) && value.children.every(isThemeLayoutNode)))
  );
}

export function isThemeLayoutPage(value: unknown): value is ThemeLayoutPage {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    (value.description === undefined || isString(value.description)) &&
    isThemeLayoutNode(value.layout)
  );
}

export function isThemeLayoutDocument(value: unknown): value is ThemeLayoutDocument {
  return (
    isRecord(value) &&
    typeof value.version === 'number' &&
    (value.schemaVersion === undefined || typeof value.schemaVersion === 'number') &&
    isString(value.themeId) &&
    isString(value.themeName) &&
    (value.pageName === undefined || isString(value.pageName)) &&
    isString(value.description) &&
    Array.isArray(value.components) &&
    value.components.every(isThemeComponentDescriptor) &&
    isString(value.defaultPageId) &&
    Array.isArray(value.pages) &&
    value.pages.every(isThemeLayoutPage) &&
    isThemeLayoutNode(value.layout) &&
    (value.componentTemplates === undefined || isRecord(value.componentTemplates)) &&
    (value.cssVars === undefined || (isRecord(value.cssVars) && Object.values(value.cssVars).every(isString))) &&
    (value.cssAnimations === undefined ||
      value.cssAnimations === null ||
      (isRecord(value.cssAnimations) && Object.values(value.cssAnimations).every(isString)))
  );
}

export function objectToRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value));
}

export function themeLayoutDocumentToRecord(document: ThemeLayoutDocument): Record<string, unknown> {
  return objectToRecord(document);
}
