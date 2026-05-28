'use client';

import { asBoolean, asNumber, asString } from '../../valueResolvers';
import type { RateProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './RateNode.module.css';

export function RateNode({ props, nodeLayoutStyle }: CoreNodeProps<RateProps>) {
  const value = asNumber(props.value, 0);
  const count = asNumber(props.count, 5);
  const size = asString(props.size);
  const disabled = asBoolean(props.disabled);
  const stars = Array.from({ length: count }, (_, index) => ({
    filled: index < value,
    key: `star-${index + 1}`,
  }));

  return (
    <span
      className={styles.rate}
      data-disabled={disabled ? 'true' : undefined}
      style={{
        ...nodeLayoutStyle,
        fontSize: size || undefined,
      }}
    >
      {stars.map((star) => (
        <span key={star.key} className={star.filled ? styles.starFilled : styles.starEmpty}>
          {star.filled ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}
