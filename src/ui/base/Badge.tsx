import styles from './Atoms.module.css';
import { cx } from 'base/classname';
import { forwardRef, type HTMLAttributes } from 'react';

export type BadgeTone = 'danger' | 'primary' | 'success' | 'warning' | 'neutral';

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'className'> & {
  tone?: BadgeTone;
  /** Render a small dot instead of a count/label */
  dot?: boolean;
  /** Numeric count; values above `max` render as `${max}+` */
  count?: number;
  max?: number;
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'danger', dot = false, count, max = 99, children, ...props },
  ref,
) {
  const content = dot ? null : count !== undefined ? (count > max ? `${max}+` : String(count)) : children;

  return (
    <span {...props} ref={ref} className={cx(styles.badge, dot && styles.badgeDot)} data-tone={tone}>
      {content}
    </span>
  );
});
