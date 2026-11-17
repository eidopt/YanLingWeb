'use client';

import type { LayoutNodeFrame, LayoutNodeLayout } from '../layout/types';
import { resolveCoreComponentRenderer } from './components/registry';
import { resolveFrameStyle, resolveLayoutStyle } from './styleResolvers';
import type { ThemeRuntime } from './types';
import { normalizeRpxUnits } from '@shared/theme-layout/lengthUnits';
import type { CSSProperties, ReactNode } from 'react';

function resolveTemplateStyle(value: unknown): CSSProperties {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const style: CSSProperties = {};

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number' || item === null || item === undefined) {
      style[key as keyof CSSProperties] = (typeof item === 'string'
        ? normalizeRpxUnits(item)
        : item) as never;
    }
  }

  return style;
}

export function renderCoreAlias(
  runtime: ThemeRuntime,
  alias: string,
  props: Record<string, unknown>,
  children: ReactNode[],
) {
  const applyNodeLayoutStyle = props.__applyNodeLayoutStyle !== false;
  const templateStyle = resolveTemplateStyle(props.style);
  const nodeLayoutStyle: CSSProperties = applyNodeLayoutStyle
    ? {
        ...resolveLayoutStyle(
          props.__layout as LayoutNodeLayout,
          typeof props.__parentAlias === 'string' ? props.__parentAlias : undefined,
        ),
        ...(props.__layoutMode === 'absolute' ? resolveFrameStyle(props.__frame as LayoutNodeFrame | undefined) : {}),
        ...templateStyle,
      }
    : {
        ...((props.__templateStyle as CSSProperties | undefined) ?? {}),
        ...templateStyle,
      };

  const nodeProps = { props, children, nodeLayoutStyle };
  return resolveCoreComponentRenderer(alias)?.({ runtime, ...nodeProps }) ?? null;
}
