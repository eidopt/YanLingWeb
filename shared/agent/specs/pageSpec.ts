export interface PageSpecSection {
  sectionKind: string;
  regionKey?: string;
  patternKey?: string;
  title?: string;
  content?: Record<string, unknown>;
  items?: Record<string, unknown>[];
}

export interface PageSpecNavigation {
  sync?: boolean;
  label?: string;
  icon?: string;
}

export interface PageSpec {
  intent: 'create_page' | 'update_page';
  pageKind?: string;
  pageKey?: string;
  title?: string;
  contentIntent?: string;
  sections?: PageSpecSection[];
  navigation?: PageSpecNavigation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isPageSpec(value: unknown): value is PageSpec {
  if (!isRecord(value)) {return false;}
  if (value.intent !== 'create_page' && value.intent !== 'update_page') {return false;}
  if (value.pageKind !== undefined && typeof value.pageKind !== 'string') {return false;}
  if (value.pageKey !== undefined && typeof value.pageKey !== 'string') {return false;}
  if (value.title !== undefined && typeof value.title !== 'string') {return false;}
  if (value.sections !== undefined && !Array.isArray(value.sections)) {return false;}
  return true;
}
