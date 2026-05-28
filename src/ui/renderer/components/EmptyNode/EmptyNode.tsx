'use client';

import { asString } from '../../valueResolvers';
import type { EmptyProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './EmptyNode.module.css';

export function EmptyNode({ props, nodeLayoutStyle }: CoreNodeProps<EmptyProps>) {
  const text = asString(props.text, '暂无数据');
  const image = asString(props.image);
  const actionLabel = asString(props.actionLabel);

  return (
    <div className={styles.empty} style={nodeLayoutStyle}>
      {image ? (
        <img className={styles.image} src={image} alt="" />
      ) : (
        <div className={styles.placeholder} aria-hidden="true">
          <svg viewBox="0 0 64 64" width="64" height="64" fill="none">
            <rect x="8" y="12" width="48" height="40" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.3" />
            <line x1="16" y1="28" x2="48" y2="28" stroke="currentColor" strokeWidth="2" opacity="0.2" />
            <line x1="16" y1="36" x2="40" y2="36" stroke="currentColor" strokeWidth="2" opacity="0.2" />
          </svg>
        </div>
      )}
      <div className={styles.text}>{text}</div>
      {actionLabel ? (
        <button type="button" className={styles.action}>{actionLabel}</button>
      ) : null}
    </div>
  );
}
