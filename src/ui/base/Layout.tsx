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
import {
  createElement,
  type CSSProperties,
  type FormEventHandler,
} from 'react';

type LayoutElement =
  | 'article'
  | 'aside'
  | 'div'
  | 'footer'
  | 'form'
  | 'header'
  | 'main'
  | 'nav'
  | 'section'
  | 'span';

type LayoutDirection = 'column' | 'column-reverse' | 'row' | 'row-reverse';

interface LayoutOwnProps {
  align?: CSSProperties['alignItems'];
  direction?: LayoutDirection;
  gap?: SystemGap;
  justify?: CSSProperties['justifyContent'];
  wrap?: CSSProperties['flexWrap'] | boolean;
}

export type LayoutProps<TElement extends LayoutElement = 'div'> =
  SystemElementProps<TElement> &
  LayoutOwnProps & {
    onSubmit?: FormEventHandler<HTMLFormElement>;
  };

export function Layout<TElement extends LayoutElement = 'div'>({
  align,
  as,
  children,
  className,
  direction = 'column',
  gap = 'md',
  justify,
  style,
  wrap = false,
  ...props
}: LayoutProps<TElement>) {
  return createElement(
    as ?? 'div',
    {
      ...props,
      className: cx(styles.box, styles.layout, className),
      style: mergeStyle(style, {
        '--ui-gap': resolveToken(gap, GAP_TOKENS),
        '--ui-layout-align': align,
        '--ui-layout-direction': direction,
        '--ui-layout-justify': justify,
        '--ui-layout-wrap': typeof wrap === 'boolean'
          ? (wrap ? 'wrap' : 'nowrap')
          : wrap,
      }),
    },
    children,
  );
}

export type StackProps<TElement extends LayoutElement = 'div'> =
  Omit<LayoutProps<TElement>, 'direction'>;

export function Stack<TElement extends LayoutElement = 'div'>(
  props: StackProps<TElement>,
) {
  return <Layout {...props} direction="column" />;
}

export type InlineProps<TElement extends LayoutElement = 'div'> =
  Omit<LayoutProps<TElement>, 'direction'>;

export function Inline<TElement extends LayoutElement = 'div'>({
  align = 'center',
  wrap = true,
  ...props
}: InlineProps<TElement>) {
  return (
    <Layout
      {...props}
      align={align}
      direction="row"
      wrap={wrap}
    />
  );
}
