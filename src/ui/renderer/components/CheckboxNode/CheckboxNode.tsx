'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { CheckboxProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './CheckboxNode.module.css';

export function CheckboxNode({ props, nodeLayoutStyle }: CoreNodeProps<CheckboxProps>) {
  const label = asString(props.label);
  const checked = asBoolean(props.checked);
  const disabled = asBoolean(props.disabled);

  return (
    <label
      className={styles.field}
      data-disabled={disabled ? 'true' : undefined}
      style={nodeLayoutStyle}
    >
      <span className={styles.box}>
        <input
          type="checkbox"
          className={styles.input}
          defaultChecked={checked}
          disabled={disabled}
        />
        <span className={styles.checkmark} />
      </span>
      {label ? <span className={styles.label}>{label}</span> : null}
    </label>
  );
}
