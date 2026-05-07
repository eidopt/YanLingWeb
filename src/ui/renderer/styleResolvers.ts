import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  ThemeLayoutNode,
} from '../layout/types';
import type { CSSProperties } from 'react';

function resolveLength(value?: number | string, unit: '%' | 'px' = 'px') {
  if (typeof value === 'number') {
    return `${value}${unit}`;
  }

  return value;
}

export function resolveLayoutStyle(
  layout: LayoutNodeLayout,
  parentAlias?: string | null,
): CSSProperties {
  const baseStyle: CSSProperties = {
    width: resolveLength(layout.width),
    height: resolveLength(layout.height),
    minWidth: resolveLength(layout.minWidth),
    minHeight: resolveLength(layout.minHeight),
    maxWidth: resolveLength(layout.maxWidth),
    maxHeight: resolveLength(layout.maxHeight),
    order: layout.order,
    gridColumn: layout.gridColumn,
    gridRow: layout.gridRow,
    alignSelf: layout.alignSelf,
    justifySelf: layout.justifySelf,
  };

  if (parentAlias === 'core.grid' && layout.mode !== 'absolute') {
    return {
      ...baseStyle,
      width: '100%',
      minWidth: 0,
      maxWidth: '100%',
      justifySelf: 'stretch',
    };
  }

  return baseStyle;
}

export function resolveFrameStyle(frame?: LayoutNodeFrame): CSSProperties {
  if (!frame) {
    return {};
  }

  const unit = frame.unit ?? 'px';

  return {
    position: frame.position,
    left: frame.left ?? resolveLength(frame.x, unit),
    top: frame.top ?? resolveLength(frame.y, unit),
    right: resolveLength(frame.right, unit),
    bottom: resolveLength(frame.bottom, unit),
    width: resolveLength(frame.width, unit),
    height: resolveLength(frame.height, unit),
    minWidth: resolveLength(frame.minWidth, unit),
    minHeight: resolveLength(frame.minHeight, unit),
    maxWidth: resolveLength(frame.maxWidth, unit),
    maxHeight: resolveLength(frame.maxHeight, unit),
    zIndex: frame.zIndex,
  };
}

export function resolveNodeStyle(
  node: ThemeLayoutNode,
  parentAlias?: string | null,
): CSSProperties {
  return {
    ...resolveLayoutStyle(node.layout, parentAlias),
    ...(node.layout.mode === 'absolute' ? resolveFrameStyle(node.frame) : {}),
  };
}
