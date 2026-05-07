'use client';

import { asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './NoticeNode.module.css';

export function NoticeNode({ props }: CoreNodeProps) {
  return (
    <div className={styles.notice}>{asString(props.text)}</div>
  );
}
