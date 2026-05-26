'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './InputNode.module.css';

export function InputNode({ props, nodeLayoutStyle }: CoreNodeProps) {
  const label = asString(props.label);
  const placeholder = asString(props.placeholder);
  const value = asString(props.value);
  const disabled = asBoolean(props.disabled);

  return (
    <label className={styles.field} style={nodeLayoutStyle}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <span className={styles.input} data-disabled={disabled ? 'true' : undefined}>
        {value || placeholder}
      </span>
    </label>
  );
}
