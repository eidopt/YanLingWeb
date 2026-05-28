import type {
  SystemElementProps,
  SystemGap,
} from './shared';
import {
  GAP_TOKENS,
  mergeStyle,
  resolveToken,
} from './shared';
import styles from './System.module.css';
import { cx } from 'base/classname';
import { createElement } from 'react';

type GridElement = 'div' | 'section';

export type GridProps<TElement extends GridElement = 'div'> =
  SystemElementProps<TElement> & {
    columns?: number | string;
    gap?: SystemGap;
    template?: string;
  };

export function Grid<TElement extends GridElement = 'div'>({
  as,
  children,
  className,
  columns = 1,
  gap = 'md',
  style,
  template,
  ...props
}: GridProps<TElement>) {
  return createElement(
    as ?? 'div',
    {
      ...props,
      className: cx(styles.box, styles.grid, className),
      style: mergeStyle(style, {
        '--ui-gap': resolveToken(gap, GAP_TOKENS),
        '--ui-grid-columns': typeof columns === 'number' ? columns : undefined,
        '--ui-grid-template': template
          ?? (typeof columns === 'string' ? columns : undefined),
      }),
    },
    children,
  );
}
