'use client';

import { asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './TextNode.module.css';
import { cx } from 'base/classname';
import { createElement } from 'react';

const variantClassMap: Record<string, string> = {
  display: styles.textDisplay,
  heading: styles.textHeading,
  subheading: styles.textSubheading,
  body: styles.textBody,
  caption: styles.textCaption,
  price: styles.textPrice,
  overline: styles.textOverline,
  eyebrow: styles.textOverline,
  title: styles.textHeading,
  subtitle: styles.textSubheading,
};

const tagMap: Record<string, string> = {
  display: 'h1',
  heading: 'h2',
  subheading: 'h3',
  body: 'p',
  caption: 'p',
  price: 'strong',
  overline: 'span',
  eyebrow: 'span',
  title: 'h2',
  subtitle: 'h3',
};

export function TextNode({ props, nodeLayoutStyle }: CoreNodeProps) {
  const variant = asString(props.variant, 'body');
  const text = asString(props.text);
  const tagName = tagMap[variant] ?? 'p';
  const className = cx(styles.text, variantClassMap[variant] ?? styles.textBody);
  return createElement(tagName as 'p', { className, style: nodeLayoutStyle }, text);
}
