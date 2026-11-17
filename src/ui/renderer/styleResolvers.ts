import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  ThemeLayoutNode,
} from '../layout/types';
import { normalizeRpxUnits } from '@shared/theme-layout/lengthUnits';
import type { CSSProperties } from 'react';

function resolveLength(value?: number | string, unit: '%' | 'px' = 'px') {
  if (typeof value === 'number') {
    return `${value}${unit}`;
  }

  return normalizeRpxUnits(value);
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

  // In a flex row, children with explicit width or height should not shrink.
  // Also set minWidth: 0 on flex children so they can shrink below content size.
  if (parentAlias === 'core.row' && layout.mode !== 'absolute') {
    const hasExplicitWidth = layout.width != null;
    const hasExplicitHeight = layout.height != null;
    const isFullWidthChild = layout.width === '100%' || layout.width === 100;

    if (isFullWidthChild) {
      return {
        ...baseStyle,
        width: undefined,
        flex: '1 1 0',
        minWidth: baseStyle.minWidth ?? 0,
        maxWidth: baseStyle.maxWidth ?? '100%',
      };
    }

    return {
      ...baseStyle,
      ...(hasExplicitWidth || hasExplicitHeight ? { flexShrink: 0 } : {}),
      minWidth: baseStyle.minWidth ?? 0,
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
