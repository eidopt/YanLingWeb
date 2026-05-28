'use client';

import { asString } from '../../valueResolvers';
import type { TimePickerProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './TimePickerNode.module.css';

export function TimePickerNode({ props, nodeLayoutStyle }: CoreNodeProps<TimePickerProps>) {
  const value = asString(props.value);
  const placeholder = asString(props.placeholder, '选择时间');

  return (
    <div className={styles.field} style={nodeLayoutStyle}>
      <input
        type="time"
        className={styles.input}
        defaultValue={value || undefined}
        placeholder={placeholder}
      />
    </div>
  );
}
