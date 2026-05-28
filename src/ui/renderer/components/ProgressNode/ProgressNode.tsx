'use client';

import { asNumber, asString } from '../../valueResolvers';
import type { ProgressProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './ProgressNode.module.css';
import { cx } from 'base/classname';

const toneClassMap: Record<string, string> = {
  neutral: styles.progressNeutral,
  accent: styles.progressAccent,
  success: styles.progressSuccess,
  warning: styles.progressWarning,
  info: styles.progressInfo,
};

function clampPercent(value: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function ProgressNode({ props, nodeLayoutStyle }: CoreNodeProps<ProgressProps>) {
  const value = asNumber(props.value, 0);
  const max = asNumber(props.max, 100);
  const tone = asString(props.tone, 'accent');
  const percent = clampPercent(value, max);

  return (
    <div
      className={cx(styles.progress, toneClassMap[tone] ?? styles.progressAccent)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      style={nodeLayoutStyle}
    >
      <span className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}
