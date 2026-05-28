'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { SwitchProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './SwitchNode.module.css';

export function SwitchNode({ props, nodeLayoutStyle }: CoreNodeProps<SwitchProps>) {
  const checked = asBoolean(props.checked);
  const disabled = asBoolean(props.disabled);
  const label = asString(props.label);

  return (
    <label
      className={styles.field}
      data-disabled={disabled ? 'true' : undefined}
      style={nodeLayoutStyle}
    >
      <span className={styles.track}>
        <input
          type="checkbox"
          className={styles.input}
          defaultChecked={checked}
          disabled={disabled}
        />
        <span className={styles.thumb} />
      </span>
      {label ? <span className={styles.label}>{label}</span> : null}
    </label>
  );
}
