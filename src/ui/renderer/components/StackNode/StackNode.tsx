'use client';

import { asCssLength, asString } from '../../valueResolvers';
import type { StackProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './StackNode.module.css';

export function StackNode({ props, children, nodeLayoutStyle }: CoreNodeProps<StackProps>) {
  return (
    <div
      className={styles.stack}
      style={{
        ...nodeLayoutStyle,
        position: props.__hasAbsoluteChildren ? 'relative' : undefined,
        gap: asCssLength(props.gap, '12px'),
        alignItems: asString(props.alignItems) || undefined,
      }}
    >
      {children}
    </div>
  );
}
