import { normalizeRpxUnits } from '@shared/theme-layout/lengthUnits';
import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
} from 'ui/layout/types';

function stringifyStyleValue(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : normalizeRpxUnits(value);
}

function addStyleValue(
  target: Record<string, string | number>,
  key: string,
  value: number | string | undefined,
): void {
  if (value === undefined) {
    return;
  }
  target[key] = stringifyStyleValue(value);
}

export function compileLayoutStyle(
  layout: LayoutNodeLayout,
  frame?: LayoutNodeFrame,
): Record<string, string | number> {
  const style: Record<string, string | number> = {};

  addStyleValue(style, 'width', layout.width);
  addStyleValue(style, 'height', layout.height);
  addStyleValue(style, 'minWidth', layout.minWidth);
  addStyleValue(style, 'minHeight', layout.minHeight);
  addStyleValue(style, 'maxWidth', layout.maxWidth);
  addStyleValue(style, 'maxHeight', layout.maxHeight);
  if (layout.gridColumn) {
    style.gridColumn = layout.gridColumn;
  }
  if (layout.gridRow) {
    style.gridRow = layout.gridRow;
  }
  if (layout.alignSelf) {
    style.alignSelf = layout.alignSelf;
  }
  if (layout.justifySelf) {
    style.justifySelf = layout.justifySelf;
  }

  if (layout.mode === 'absolute' || frame) {
    style.position = 'absolute';
    addStyleValue(style, 'left', frame?.left ?? frame?.x);
    addStyleValue(style, 'top', frame?.top ?? frame?.y);
    addStyleValue(style, 'right', frame?.right);
    addStyleValue(style, 'bottom', frame?.bottom);
    addStyleValue(style, 'width', frame?.width ?? layout.width);
    addStyleValue(style, 'height', frame?.height ?? layout.height);
    addStyleValue(style, 'minWidth', frame?.minWidth ?? layout.minWidth);
    addStyleValue(style, 'minHeight', frame?.minHeight ?? layout.minHeight);
    addStyleValue(style, 'maxWidth', frame?.maxWidth ?? layout.maxWidth);
    addStyleValue(style, 'maxHeight', frame?.maxHeight ?? layout.maxHeight);
    if (typeof frame?.zIndex === 'number') {
      style.zIndex = frame.zIndex;
    }
  }

  return style;
}

export function toObjectLiteral(value: Record<string, unknown>): string {
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}: ${JSON.stringify(item)}`);
  return `{ ${entries.join(', ')} }`;
}
