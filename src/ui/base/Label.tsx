import type { FieldTone } from './formShared';
import styles from './Label.module.css';
import { cx } from 'base/classname';
import type {
  LabelHTMLAttributes,
  ReactNode,
} from 'react';

export type LabelProps = Omit<
  LabelHTMLAttributes<HTMLLabelElement>,
  'style'
> & {
  hint?: ReactNode;
  requiredIndicator?: boolean;
  size?: 'xs' | 'sm' | 'md';
  tone?: Extract<FieldTone, 'neutral' | 'danger'>;
};

export function Label({
  children,
  className,
  hint,
  requiredIndicator = false,
  size = 'sm',
  tone = 'neutral',
  ...props
}: LabelProps) {
  return (
    <label
      {...props}
      className={cx(styles.label, className)}
      data-size={size}
      data-tone={tone}
    >
      {children}
      {requiredIndicator && (
        <span aria-hidden="true" className={styles.required}> *</span>
      )}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}
