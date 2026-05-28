'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { RadioProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './RadioNode.module.css';

export function RadioNode({ props, nodeLayoutStyle }: CoreNodeProps<RadioProps>) {
  const label = asString(props.label);
  const checked = asBoolean(props.checked);
  const disabled = asBoolean(props.disabled);
  const group = asString(props.group);

  return (
    <label
      className={styles.field}
      data-disabled={disabled ? 'true' : undefined}
      style={nodeLayoutStyle}
    >
      <span className={styles.circle}>
        <input
          type="radio"
          className={styles.input}
          name={group || undefined}
          defaultChecked={checked}
          disabled={disabled}
        />
        <span className={styles.dot} />
      </span>
      {label ? <span className={styles.label}>{label}</span> : null}
    </label>
  );
}
