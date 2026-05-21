'use client';

import type { CoreNodeProps } from '../types';
import styles from './DividerNode.module.css';

export function DividerNode({ nodeLayoutStyle }: CoreNodeProps) {
  return <hr className={styles.divider} style={nodeLayoutStyle} />;
}

