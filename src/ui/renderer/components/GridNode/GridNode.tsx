'use client';

import { asCssLength, asNumber } from '../../valueResolvers';
import type { GridProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './GridNode.module.css';

export function GridNode({ props, children, nodeLayoutStyle }: CoreNodeProps<GridProps>) {
  return (
    <div
      className={styles.grid}
      style={{
        ...nodeLayoutStyle,
        position: props.__hasAbsoluteChildren ? 'relative' : undefined,
        gap: asCssLength(props.gap, '12px'),
        gridTemplateColumns: `repeat(${asNumber(props.columns, 2)}, minmax(0, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}
