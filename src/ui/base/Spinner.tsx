import styles from './Atoms.module.css';
import { cx } from 'base/classname';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export type SpinnerProps = Omit<HTMLAttributes<HTMLSpanElement>, 'className'> & {
  size?: SpinnerSize;
  label?: ReactNode;
};

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 'md', label, ...props },
  ref,
) {
  return (
    <span {...props} ref={ref} className={cx(styles.spinnerWrap)} role="status" aria-live="polite">
      <span aria-hidden="true" className={styles.spinner} data-size={size} />
      {label != null && <span className={styles.spinnerLabel}>{label}</span>}
    </span>
  );
});
