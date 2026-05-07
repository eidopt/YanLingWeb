'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './ButtonNode.module.css';
import { cx } from 'base/classname';

export function ButtonNode({ props, nodeLayoutStyle }: CoreNodeProps) {
  const variant = asString(props.variant, 'primary');
  const label = asString(props.label);
  const active = asBoolean(props.active);
  const disabled = asBoolean(props.disabled);
  const variantClass =
    variant === 'secondary'
      ? styles.btnSecondary
      : variant === 'link'
        ? styles.btnLink
        : variant === 'pill'
          ? cx(styles.btnPill, active && styles.btnPillActive)
          : styles.btnPrimary;

  return (
    <button
      type="button"
      className={cx(styles.btn, variantClass, disabled && styles.btnDisabled)}
      onClick={typeof props.onClick === 'function' ? (props.onClick as () => void) : undefined}
      disabled={disabled}
      style={nodeLayoutStyle}
    >
      {label}
    </button>
  );
}
