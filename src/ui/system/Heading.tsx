import styles from './Heading.module.css';
import type {
  SystemElementProps,
  SystemTextAlign,
} from './shared';
import { createElement } from 'react';

export type HeadingElement = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
export type HeadingFlow = 'normal' | 'stack';
export type HeadingLineHeight =
  | 'inherit'
  | 'title'
  | 'tight'
  | 'compact'
  | 'display'
  | 'body';
export type HeadingSize =
  | 'label'
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'hero'
  | 'display'
  | 'showcase'
  | 'banner';
export type HeadingSpacing = 'none' | 'hero' | 'cta';
export type HeadingDecoration = 'none' | 'underline';
export type HeadingVariant =
  | 'inherit'
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'inverse-soft'
  | 'inverse-muted'
  | 'inverse-gradient'
  | 'accent'
  | 'gradient-duo';
export type HeadingWeight = 'medium' | 'bold' | 'heavy';

export type HeadingProps<TElement extends HeadingElement = 'h2'> =
  Omit<SystemElementProps<TElement>, 'className' | 'style'> & {
    align?: SystemTextAlign;
    decoration?: HeadingDecoration;
    flow?: HeadingFlow;
    lineHeight?: HeadingLineHeight;
    size?: HeadingSize;
    spacing?: HeadingSpacing;
    truncate?: boolean;
    variant?: HeadingVariant;
    weight?: HeadingWeight;
  };

export function Heading<TElement extends HeadingElement = 'h2'>({
  align,
  as,
  children,
  decoration,
  flow,
  lineHeight,
  size,
  spacing,
  truncate,
  variant = 'inherit',
  weight,
  ...props
}: HeadingProps<TElement>) {
  return createElement(
    as ?? 'h2',
    {
      ...props,
      className: styles.heading,
      'data-align': align,
      'data-decoration': decoration,
      'data-flow': flow,
      'data-line-height': lineHeight,
      'data-size': size,
      'data-spacing': spacing,
      'data-truncate': truncate ? true : undefined,
      'data-variant': variant,
      'data-weight': weight,
    },
    children,
  );
}
