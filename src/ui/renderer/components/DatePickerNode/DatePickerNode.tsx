'use client';

import { asString } from '../../valueResolvers';
import type { DatePickerProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './DatePickerNode.module.css';

export function DatePickerNode({ props, nodeLayoutStyle }: CoreNodeProps<DatePickerProps>) {
  const value = asString(props.value);
  const placeholder = asString(props.placeholder, '选择日期');

  return (
    <div className={styles.field} style={nodeLayoutStyle}>
      <input
        type="date"
        className={styles.input}
        defaultValue={value || undefined}
        placeholder={placeholder}
      />
    </div>
  );
}
