'use client';

import { asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './ImageNode.module.css';

export function ImageNode({ props, nodeLayoutStyle }: CoreNodeProps) {
  const iconColor = asString(props.iconColor) || undefined;
  return (
    <div
      className={styles.imagePlaceholder}
      style={{
        ...nodeLayoutStyle,
        ...(iconColor ? { background: iconColor } : {}),
      }}
    />
  );
}
