import type { SystemElementProps } from './shared';
import styles from './System.module.css';
import { cx } from 'base/classname';
import {
  createElement,
  type FormEventHandler,
} from 'react';

type BoxElement =
  | 'article'
  | 'aside'
  | 'dd'
  | 'div'
  | 'dl'
  | 'dt'
  | 'footer'
  | 'form'
  | 'header'
  | 'main'
  | 'nav'
  | 'section'
  | 'span';

export type BoxProps<TElement extends BoxElement = 'div'> =
  SystemElementProps<TElement> & {
    onSubmit?: FormEventHandler<HTMLFormElement>;
  };

export function Box<TElement extends BoxElement = 'div'>({
  as,
  children,
  className,
  ...props
}: BoxProps<TElement>) {
  return createElement(
    as ?? 'div',
    {
      ...props,
      className: cx(styles.box, className),
    },
    children,
  );
}
