'use client';

import { asString } from '../../valueResolvers';
import type { HtmlProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import { resolveHtmlTag, sanitizeInlineStyle } from '@shared/theme-layout/htmlSafety';
import { normalizeStyleRecordUnits } from '@shared/theme-layout/lengthUnits';
import { createElement, type CSSProperties } from 'react';

export function HtmlNode({ props, children, nodeLayoutStyle }: CoreNodeProps<HtmlProps>) {
  const safeTag = resolveHtmlTag(asString(props.tag, 'div'));
  const inlineStyle = normalizeStyleRecordUnits(sanitizeInlineStyle(props.style)) as CSSProperties;
  return createElement(safeTag, { style: { ...nodeLayoutStyle, ...inlineStyle } }, ...children);
}
