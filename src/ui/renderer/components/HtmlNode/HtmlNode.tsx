'use client';

import { asString } from '../../valueResolvers';
import type { HtmlProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import { createElement, type CSSProperties } from 'react';

const ALLOWED_TAGS = new Set([
  'div', 'span', 'section', 'article', 'aside', 'header', 'footer',
  'main', 'nav', 'ul', 'ol', 'li', 'figure', 'figcaption', 'p',
  'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'label',
]);

export function HtmlNode({ props, children, nodeLayoutStyle }: CoreNodeProps<HtmlProps>) {
  const tag = asString(props.tag, 'div');
  const safeTag = (ALLOWED_TAGS.has(tag) ? tag : 'div') as 'div';
  const inlineStyle = (props.style as CSSProperties | undefined) ?? {};
  return createElement(
    safeTag,
    { style: { ...nodeLayoutStyle, ...inlineStyle } },
    ...children,
  );
}
