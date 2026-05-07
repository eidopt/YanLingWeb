'use client';

import { asNumber } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './GridNode.module.css';

export function GridNode({ props, children, nodeLayoutStyle }: CoreNodeProps) {
  return (
    <div
      className={styles.grid}
      style={{
        ...nodeLayoutStyle,
        position: props.__hasAbsoluteChildren ? 'relative' : undefined,
        gap: `${asNumber(props.gap, 12)}px`,
        gridTemplateColumns: `repeat(${asNumber(props.columns, 2)}, minmax(0, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}
