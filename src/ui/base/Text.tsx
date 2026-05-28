import type {
  SystemElementProps,
  SystemTextAlign,
} from './shared';
import styles from './Text.module.css';
import { createElement } from 'react';

export type TextElement = 'p' | 'span' | 'strong' | 'em' | 'small' | 'div';

export type TextVariant =
  | 'inherit'
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'faint'
  | 'inverse'
  | 'inverse-muted'
  | 'inverse-faint'
  | 'accent'
  | 'accent-faint'
  | 'brand-gradient'
  | 'gradient-warm'
  | 'gradient-cool'
  | 'glow'
  | 'success'
  | 'warning'
  | 'danger';

export type TextSize =
  | 'xs'
  | 'sm'
  | 'md'
  | 'base'
  | 'lead'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl';
export type TextWeight = 'regular' | 'medium' | 'bold' | 'heavy';
export type TextTracking = 'normal' | 'wide' | 'wider';
export type TextTransform = 'none' | 'uppercase';

export type TextProps<TElement extends TextElement = 'p'> =
  Omit<SystemElementProps<TElement>, 'className' | 'style'> & {
    align?: SystemTextAlign;
    nowrap?: boolean;
    size?: TextSize;
    tracking?: TextTracking;
    truncate?: boolean;
    transform?: TextTransform;
    variant?: TextVariant;
    weight?: TextWeight;
  };

export function Text<TElement extends TextElement = 'p'>({
  align,
  as,
  children,
  nowrap,
  size,
  tracking,
  truncate,
  transform,
  variant,
  weight,
  ...props
}: TextProps<TElement>) {
  return createElement(
    as ?? 'p',
    {
      ...props,
      className: styles.text,
      'data-align': align,
      'data-nowrap': nowrap ? true : undefined,
      'data-size': size,
      'data-tracking': tracking,
      'data-truncate': truncate ? true : undefined,
      'data-transform': transform,
      'data-variant': variant ?? 'inherit',
      'data-weight': weight,
    },
    children,
  );
}
