'use client';

import { asNumber, asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './StackNode.module.css';

export function StackNode({ props, children, nodeLayoutStyle }: CoreNodeProps) {
  return (
    <div
      className={styles.stack}
      style={{
        ...nodeLayoutStyle,
        position: props.__hasAbsoluteChildren ? 'relative' : undefined,
        gap: `${asNumber(props.gap, 12)}px`,
        alignItems: asString(props.alignItems) || undefined,
      }}
    >
      {children}
    </div>
  );
}
