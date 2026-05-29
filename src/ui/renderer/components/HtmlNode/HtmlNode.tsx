'use client';

import { asString } from '../../valueResolvers';
import type { HtmlProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import { createElement, type CSSProperties } from 'react';

const ALLOWED_TAGS = new Set([
  'div',
  'span',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'main',
  'nav',
  'ul',
  'ol',
  'li',
  'figure',
  'figcaption',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'label',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'alignItems',
  'background',
  'backgroundColor',
  'border',
  'borderColor',
  'borderRadius',
  'borderStyle',
  'borderWidth',
  'color',
  'display',
  'flexDirection',
  'fontSize',
  'fontWeight',
  'gap',
  'height',
  'justifyContent',
  'lineHeight',
  'margin',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginTop',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'opacity',
  'overflow',
  'padding',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'textAlign',
  'width',
]);

function isUnsafeStyleValue(value: unknown): boolean {
  return typeof value === 'string' && /(?:javascript:|data:text\/html|expression\s*\(|url\s*\()/i.test(value);
}

function sanitizeInlineStyle(value: unknown): CSSProperties {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key, styleValue]) =>
        ALLOWED_STYLE_PROPS.has(key) &&
        (typeof styleValue === 'string' || typeof styleValue === 'number') &&
        !isUnsafeStyleValue(styleValue),
    ),
  );
}

export function HtmlNode({ props, children, nodeLayoutStyle }: CoreNodeProps<HtmlProps>) {
  const tag = asString(props.tag, 'div');
  const safeTag = ALLOWED_TAGS.has(tag) ? tag : 'div';
  const inlineStyle = sanitizeInlineStyle(props.style);
  return createElement(safeTag, { style: { ...nodeLayoutStyle, ...inlineStyle } }, ...children);
}
