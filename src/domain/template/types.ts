import type {
  LayoutNodeLayout,
  ThemeComponentDescriptor,
  ThemeLayoutNode,
} from 'ui/layout/types';

export type DraftLayoutMode = LayoutNodeLayout['mode'];
export type DropIndicatorPosition = 'before' | 'after';
export type DropIndicatorAxis = 'horizontal' | 'vertical';

export interface NodeDraft {
  nodeId?: string;
  alias: string;
  parentId: string;
  slot: 'body' | 'footer';
  layoutMode: DraftLayoutMode;
  flowRow: number;
  order: string;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  gridColumn: string;
  gridRow: string;
  alignSelf: string;
  justifySelf: string;
  frameX: string;
  frameY: string;
  frameLeft: string;
  frameTop: string;
  frameRight: string;
  frameBottom: string;
  frameWidth: string;
  frameHeight: string;
  frameZIndex: string;
  frameUnit: 'px' | '%';
  props: Record<string, string | boolean>;
}

export interface DialogState {
  descriptor: ThemeComponentDescriptor;
  draft: NodeDraft;
}

export interface FlatNode {
  node: ThemeLayoutNode;
  depth: number;
  parentId?: string;
}

export interface DropIndicator {
  nodeId: string;
  position: DropIndicatorPosition;
  axis: DropIndicatorAxis;
}

export type PointerInteraction =
  | {
      type: 'move-absolute';
      nodeId: string;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    }
  | {
      type: 'resize';
      nodeId: string;
      axis: 'x' | 'y' | 'xy';
      mode: DraftLayoutMode;
      startX: number;
      startY: number;
      originWidth: number;
      originHeight: number;
    };

export const CONTAINER_ALIASES = new Set([
  'core.screen',
  'core.panel',
  'core.stack',
  'core.row',
  'core.grid',
  'core.html',
  'core.navbar',
  'core.list',
  'core.list-item',
  'core.dialog',
  'core.drawer',
  'core.collapse',
  'core.sidebar',
  'core.form',
  'core.toolbar',
  'core.splitter',
  'core.timeline',
  'core.tree',
]);
export const FOOTER_ALIASES = new Set([
  'svc-bottom-bar',
  'com-bottom-tabs',
]);
export const ALIGN_OPTIONS = ['auto', 'start', 'center', 'end', 'stretch'];

export const HEIGHT_LOCKED_ALIASES = new Set([
  'core.notice',
  'core.search',
  'svc-text',
  'com-text',
  'svc-button',
  'com-button',
  'svc-tag',
  'com-tag',
  'com-pill',
  'svc-section-header',
  'svc-order-cell',
  'svc-bottom-bar',
  'com-bottom-tabs',
]);

export const WIDTH_LOCKED_ALIASES = new Set(['svc-bottom-bar', 'com-bottom-tabs']);
