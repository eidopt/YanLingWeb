import type { SystemElementProps } from './shared';
import {
  CONTAINER_MAX,
  mergeStyle,
  resolveToken,
} from './shared';
import styles from './System.module.css';
import { cx } from 'base/classname';
import { createElement } from 'react';

type ContainerElement = 'article' | 'div' | 'main' | 'section';

export type ContainerProps<TElement extends ContainerElement = 'div'> =
  SystemElementProps<TElement> & {
    gutters?: boolean;
    max?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | (string & {});
  };

export function Container<TElement extends ContainerElement = 'div'>({
  as,
  children,
  className,
  gutters = true,
  max = 'lg',
  style,
  ...props
}: ContainerProps<TElement>) {
  return createElement(
    as ?? 'div',
    {
      ...props,
      className: cx(
        styles.box,
        styles.container,
        !gutters && styles.containerNoGutters,
        className,
      ),
      style: mergeStyle(style, {
        '--ui-container-max': resolveToken(max, CONTAINER_MAX),
      }),
    },
    children,
  );
}
