/* eslint-disable max-len */
import type { ThemeLayoutNode } from '../types';

export type TemplateDevice = 'mobile' | 'miniapp' | 'tablet' | 'desktop';

export type TemplatePageKind = string;

export interface TemplateProfilePage {
  pageKey: string;
  pageId: string;
  pageKind: TemplatePageKind;
  name: string;
  description?: string;
  rootNodeId: string;
  device?: TemplateDevice;
  isDefault?: boolean;
}

export interface TemplateProfileRegion {
  regionKey: string;
  pageKey: string;
  nodeId: string;
  name?: string;
  sectionKind?: string;
  replaceable?: boolean;
  allowedPatternKeys?: string[];
}

export interface TemplateProfileSlot {
  slotKey: string;
  pageKey: string;
  regionKey?: string;
  nodeId: string;
  component: string;
  editableProps: string[];
  aiRole?: string;
  label?: string;
}

export interface TemplateProfilePatternField {
  fieldKey: string;
  slotKey: string;
  prop: string;
  required?: boolean;
}

export interface TemplateProfilePattern {
  patternKey: string;
  pageKey: string;
  regionKey?: string;
  sourceRootNodeId: string;
  parentNodeId?: string;
  itemAlias?: string;
  fields: TemplateProfilePatternField[];
  maxItems?: number;
  minItems?: number;
}

export interface TemplateProfileNavigationItem {
  key: string;
  label: string;
  pageKey?: string;
  pageId?: string;
  icon?: string;
}

export interface TemplateProfileNavigation {
  type: 'bottom_tabs' | 'top_tabs' | 'side_nav' | 'none';
  items: TemplateProfileNavigationItem[];
}

export interface TemplateProfileConstraints {
  devices?: TemplateDevice[];
  maxColumns?: number;
  allowedLayouts?: string[];
  disallowedComponents?: string[];
  requiredComponents?: string[];
}

export interface TemplateStyleProfile {
  colors: string[];
  fontSizes: string[];
  fontWeights: string[];
  spacing: string[];
  radius: string[];
  shadows: string[];
  componentDensity?: 'compact' | 'comfortable' | 'spacious';
  commonLayoutPatterns: string[];
}

export interface TemplateProfile {
  templateId: string;
  templateVersion: string;
  profileVersion: string;
  devices: TemplateDevice[];
  pages: TemplateProfilePage[];
  regions: TemplateProfileRegion[];
  slots: TemplateProfileSlot[];
  patterns: TemplateProfilePattern[];
  navigation?: TemplateProfileNavigation;
  constraints?: TemplateProfileConstraints;
  styleProfile?: TemplateStyleProfile;
}

export interface TemplateProfileBuildOptions {
  templateVersion?: string;
  profileVersion?: string;
  devices?: TemplateDevice[];
  now?: () => number;
}

export interface ThemeLayoutNodeSemanticMeta {
  pageKey?: string;
  regionKey?: string;
  slotKey?: string;
  patternKey?: string;
  aiRole?: string;
}

export type SemanticThemeLayoutNode = ThemeLayoutNode & {
  meta?: ThemeLayoutNodeSemanticMeta;
  children?: SemanticThemeLayoutNode[];
};

export const EDITABLE_PROPS_BY_ALIAS: Record<string, string[]> = {
  'core.screen': ['title', 'statusTime', 'headerActionLabel'],
  'core.text': ['text', 'variant', 'as'],
  'core.button': ['label', 'variant', 'active', 'disabled', 'icon'],
  'core.image': ['src', 'alt', 'title', 'iconColor', 'objectFit'],
  'core.tag': ['label', 'tone'],
  'core.notice': ['text', 'tone'],
  'core.input': ['placeholder', 'label', 'type', 'value', 'disabled'],
  'core.search': ['placeholder', 'value'],
  'core.tabs': ['tabs', 'activeTab'],
  'core.progress': ['value', 'max', 'tone'],
  'core.panel': ['tone', 'gap', 'title'],
  'core.stack': ['gap', 'alignItems'],
  'core.row': ['gap', 'wrap', 'justify', 'align', 'tone'],
  'core.grid': ['gap', 'columns'],
  'core.spacer': ['size'],
  'core.html': ['tag', 'style'],
  'core.widget': ['library', 'renderer', 'data'],
};

export const SLOT_ALIASES = new Set(Object.keys(EDITABLE_PROPS_BY_ALIAS));
export const CONTAINER_ALIASES = new Set(['core.screen', 'core.panel', 'core.stack', 'core.row', 'core.grid', 'core.html']);
