import styles from './Atoms.module.css';
import { cx } from 'base/classname';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export type TagTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
export type TagSize = 'sm' | 'md';

export type TagProps = Omit<HTMLAttributes<HTMLSpanElement>, 'className'> & {
  tone?: TagTone;
  size?: TagSize;
  icon?: ReactNode;
  children: ReactNode;
};

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { tone = 'neutral', size = 'md', icon, children, ...props },
  ref,
) {
  return (
    <span {...props} ref={ref} className={cx(styles.tag)} data-tone={tone} data-size={size}>
      {icon}
      {children}
    </span>
  );
});
