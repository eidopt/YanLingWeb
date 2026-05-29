import type { ThemeLayoutDocument, ThemeLayoutNode, ThemeLayoutPage, ThemeLayoutWidgetPolicy } from '../layout/types';
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
  widgetPolicy?: ThemeLayoutWidgetPolicy;
  /**
   * 只读/预览渲染（非编辑器）时为 true。开启后渲染器对屏幕主体的各顶层区块
   * 应用 CSS `content-visibility` 容器化，让浏览器跳过视口外子树的布局/绘制，
   * 改善大模板（100+ 节点）长页面的渲染性能。编辑器模式（存在 renderNodeShell）
   * 下为 false，避免影响节点测量/选区。
   */
  staticRender?: boolean;
}

export interface DynamicThemeNodeShellContext {
  node: ThemeLayoutNode;
  parent: ThemeLayoutNode | null;
  index: number;
  isRoot: boolean;
  nodeStyle: CSSProperties;
  rendered: ReactNode;
}

export type DynamicThemeScreenPreset = 'mobile' | 'tablet' | 'desktop';

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
