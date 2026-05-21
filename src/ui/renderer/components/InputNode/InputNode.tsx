'use client';

import { asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './InputNode.module.css';

export function InputNode({ props, nodeLayoutStyle }: CoreNodeProps) {
  const label = asString(props.label);
  const placeholder = asString(props.placeholder);

  return (
    <label className={styles.field} style={nodeLayoutStyle}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <span className={styles.input}>{placeholder}</span>
    </label>
  );
}

