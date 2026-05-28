import type {
  SystemElementProps,
  SystemGap,
  SystemStyle,
} from './shared';
import {
  GAP_TOKENS,
  resolveToken,
} from './shared';
import styles from './Spacer.module.css';
import { createElement } from 'react';

export type SpacerAxis = 'block' | 'inline';
export type SpacerElement = 'div' | 'span';

export type SpacerProps<TElement extends SpacerElement = 'div'> =
  Omit<SystemElementProps<TElement>, 'children' | 'className' | 'style'> & {
    axis?: SpacerAxis;
    grow?: boolean;
    shrink?: boolean;
    size?: SystemGap;
  };

export function Spacer<TElement extends SpacerElement = 'div'>({
  as,
  axis = 'block',
  grow = false,
  shrink = false,
  size = 'md',
  ...props
}: SpacerProps<TElement>) {
  return createElement(
    as ?? (axis === 'inline' ? 'span' : 'div'),
    {
      ...props,
      'aria-hidden': true,
      className: styles.spacer,
      'data-axis': axis,
      'data-grow': grow ? true : undefined,
      'data-shrink': shrink ? true : undefined,
      role: 'presentation',
      style: {
        '--ui-spacer-size': resolveToken(size, GAP_TOKENS),
      } satisfies SystemStyle,
    },
  );
}
