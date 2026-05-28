'use client';

import { asBoolean, asNumber, asString } from '../../valueResolvers';
import type { BadgeProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './BadgeNode.module.css';
import { cx } from 'base/classname';

const toneClassMap: Record<string, string> = {
  neutral: styles.badgeNeutral,
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  info: styles.badgeInfo,
  error: styles.badgeDanger,
  danger: styles.badgeDanger,
};

export function BadgeNode({ props, nodeLayoutStyle }: CoreNodeProps<BadgeProps>) {
  const count = asNumber(props.count, 0);
  const dot = asBoolean(props.dot);
  const max = asNumber(props.max, 99);
  const text = asString(props.text);
  const tone = asString(props.tone, 'danger');
  const placement = asString(props.placement, 'inline');
  const className = cx(
    styles.badge,
    placement === 'corner' && styles.badgeCorner,
    toneClassMap[tone] ?? styles.badgeDanger,
  );

  if (dot) {
    return (
      <span
        className={cx(className, styles.dot)}
        style={nodeLayoutStyle}
        aria-label="New notification"
      />
    );
  }

  if (text) {
    return (
      <span
        className={cx(className, styles.pill)}
        style={nodeLayoutStyle}
      >
        {text}
      </span>
    );
  }

  if (count <= 0) {
    return null;
  }

  const display = count > max ? `${max}+` : String(count);

  return (
    <span
      className={cx(className, styles.pill)}
      style={nodeLayoutStyle}
    >
      {display}
    </span>
  );
}
