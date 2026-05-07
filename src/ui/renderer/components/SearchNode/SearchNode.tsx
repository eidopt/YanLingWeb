'use client';

import { asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './SearchNode.module.css';

export function SearchNode({ props }: CoreNodeProps) {
  return (
    <div className={styles.search}>{asString(props.placeholder)}</div>
  );
}
