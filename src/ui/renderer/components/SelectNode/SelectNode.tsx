'use client';

import { asBoolean, asString, asStringArray } from '../../valueResolvers';
import type { SelectProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './SelectNode.module.css';

export function SelectNode({ props, nodeLayoutStyle }: CoreNodeProps<SelectProps>) {
  const label = asString(props.label);
  const placeholder = asString(props.placeholder);
  const options = asStringArray(props.options);
  const value = asString(props.value);
  const multiple = asBoolean(props.multiple);

  return (
    <label className={styles.field} style={nodeLayoutStyle}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <select
        className={styles.select}
        defaultValue={value || undefined}
        multiple={multiple}
      >
        {placeholder && !multiple ? (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        ) : null}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
