'use client';

import { asBoolean,asNumber } from '../../valueResolvers';
import type { SkeletonProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './SkeletonNode.module.css';
import { cx } from 'base/classname';

const widthVariants = ['100%', '92%', '78%', '85%', '65%'];

export function SkeletonNode({ props, nodeLayoutStyle }: CoreNodeProps<SkeletonProps>) {
  const rows = asNumber(props.rows, 3);
  const animated = asBoolean(props.animated, true);
  const count = Math.max(1, Math.round(rows));

  return (
    <div className={styles.skeleton} style={nodeLayoutStyle}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={cx(styles.line, animated && styles.animated)}
          style={{ width: widthVariants[index % widthVariants.length] }}
        />
      ))}
    </div>
  );
}
