import type {
  ThemeLayoutDocument,
  ThemeLayoutNode,
  ThemeLayoutPage,
} from '../layout/types';
import type { ComponentTemplateMap } from './templateTypes';
import type { CSSProperties, ReactNode } from 'react';

export interface ThemeRuntime {
  id: string;
  cssVars: Record<string, string>;
  componentTemplates: ComponentTemplateMap;
  /**
   * Custom @keyframes definitions injected at runtime.
   * Key: animation name, Value: keyframes body (the content inside @keyframes).
   * e.g. { "shimmer": "0% { opacity:0 } 100% { opacity:1 }" }
   */
  cssAnimations?: Record<string, string>;
}

export interface DynamicThemeNodeShellContext {
  node: ThemeLayoutNode;
  parent: ThemeLayoutNode | null;
  index: number;
  isRoot: boolean;
  nodeStyle: CSSProperties;
  rendered: ReactNode;
}

export type DynamicThemeScreenPreset = 'mobile' | 'desktop';

export interface DynamicThemeRendererState {
  layoutDocument: ThemeLayoutDocument;
  pages: ThemeLayoutPage[];
  activePageId: string;
  activePage: ThemeLayoutPage;
  rootNode: ThemeLayoutNode;
  screenPreset: DynamicThemeScreenPreset;
  navigateToPage: (pageId: string) => void;
}

export interface DynamicThemeRendererController {
  runtime: ThemeRuntime;
  state: DynamicThemeRendererState;
  renderNodeShell?: (context: DynamicThemeNodeShellContext) => ReactNode;
}

export interface DynamicThemeRendererControllerOptions {
  layoutDocument: ThemeLayoutDocument;
  runtime: ThemeRuntime;
  renderNodeShell?: (context: DynamicThemeNodeShellContext) => ReactNode;
  screenPreset?: DynamicThemeScreenPreset;
  initialPageId?: string;
  onNavigateToPage?: (pageId: string) => boolean | void;
}
