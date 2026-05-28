'use client';

import { asCssLength, asString } from '../../valueResolvers';
import type { SplitterProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './SplitterNode.module.css';
import { cx } from 'base/classname';
import type { CSSProperties } from 'react';

export function SplitterNode({ props, children, nodeLayoutStyle }: CoreNodeProps<SplitterProps>) {
  const direction = asString(props.direction, 'horizontal');
  const isVertical = direction === 'vertical';
  const min = asCssLength(props.min);
  const max = asCssLength(props.max);

  return (
    <div
      className={cx(styles.splitter, isVertical ? styles.splitterVertical : styles.splitterHorizontal)}
      style={{
        ...nodeLayoutStyle,
        '--splitter-min': min || undefined,
        '--splitter-max': max || undefined,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}
