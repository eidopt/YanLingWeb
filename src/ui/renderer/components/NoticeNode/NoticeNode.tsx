'use client';

import { asString } from '../../valueResolvers';
import type { NoticeProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './NoticeNode.module.css';

const toneClassMap: Record<string, string> = {
  neutral: styles.noticeNeutral,
  info: styles.noticeInfo,
  warning: styles.noticeWarning,
  error: styles.noticeError,
  success: styles.noticeSuccess,
};

export function NoticeNode({ props, nodeLayoutStyle }: CoreNodeProps<NoticeProps>) {
  const tone = asString(props.tone ?? props.variant, 'info');
  return (
    <div
      className={`${styles.notice} ${toneClassMap[tone] ?? styles.noticeInfo}`}
      style={nodeLayoutStyle}
    >
      {asString(props.text)}
    </div>
  );
}
