'use client';

import { asString } from '../../valueResolvers';
import type { TagProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './TagNode.module.css';
import { cx } from 'base/classname';

const toneClassMap: Record<string, string> = {
  neutral: styles.tagNeutral,
  success: styles.tagSuccess,
  warning: styles.tagWarning,
  info: styles.tagInfo,
  hot: styles.tagHot,
  new: styles.tagNew,
  deal: styles.tagDeal,
  member: styles.tagMember,
};

export function TagNode({ props, nodeLayoutStyle }: CoreNodeProps<TagProps>) {
  const tone = asString(props.tone, 'neutral');
  const label = asString(props.label);
  return (
    <span
      className={cx(styles.tag, toneClassMap[tone] ?? styles.tagNeutral)}
      style={nodeLayoutStyle}
    >
      {label}
    </span>
  );
}
