import styles from './Atoms.module.css';
import { cx } from 'base/classname';
import { forwardRef, type HTMLAttributes } from 'react';

export type AvatarSize = 'sm' | 'md' | 'lg';
export type AvatarShape = 'circle' | 'square';

export type AvatarProps = Omit<HTMLAttributes<HTMLSpanElement>, 'className'> & {
  src?: string;
  /** Name used for the alt text and initials fallback */
  name?: string;
  size?: AvatarSize;
  shape?: AvatarShape;
};

function initials(name?: string): string {
  if (!name) {
    return '?';
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }
  // CJK: first character; Latin: up to two initials from words.
  if (/[一-龥]/.test(trimmed)) {
    return trimmed.slice(-2);
  }
  const parts = trimmed.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { src, name, size = 'md', shape = 'circle', ...props },
  ref,
) {
  return (
    <span
      {...props}
      ref={ref}
      className={cx(styles.avatar, shape === 'square' && styles.avatarSquare)}
      data-size={size}
    >
      {src ? <img className={styles.avatarImg} src={src} alt={name ?? ''} /> : initials(name)}
    </span>
  );
});
