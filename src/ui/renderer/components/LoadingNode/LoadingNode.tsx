'use client';

import { asString } from '../../valueResolvers';
import type { LoadingProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './LoadingNode.module.css';

export function LoadingNode({ props, nodeLayoutStyle }: CoreNodeProps<LoadingProps>) {
  const size = asString(props.size, 'medium');
  const text = asString(props.text);
  const type = asString(props.type, 'spinner');

  return (
    <div
      className={styles.loading}
      data-size={size}
      style={nodeLayoutStyle}
    >
      {type === 'skeleton' ? (
        <div className={styles.skeleton}>
          <div className={styles.bar} />
          <div className={styles.bar} />
          <div className={styles.bar} />
        </div>
      ) : (
        <div className={styles.spinner} />
      )}
      {text ? <span className={styles.text}>{text}</span> : null}
    </div>
  );
}
