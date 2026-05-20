import type { SystemElementProps } from './shared';
import styles from './VisuallyHidden.module.css';
import { cx } from 'base/classname';

export type VisuallyHiddenProps = Omit<SystemElementProps<'span'>, 'as'>;

export function VisuallyHidden({
  children,
  className,
  ...props
}: VisuallyHiddenProps) {
  return (
    <span {...props} className={cx(styles.root, className)}>
      {children}
    </span>
  );
}
