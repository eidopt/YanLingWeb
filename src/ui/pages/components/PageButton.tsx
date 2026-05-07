import styles from './PageComponents.module.css';
import { cx } from 'base/classname';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface PageButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  showArrow?: boolean;
  variant?: 'primary' | 'ghost' | 'ghostLight' | 'outline';
}

export function PageButton({
  children,
  className,
  showArrow = false,
  type = 'button',
  variant = 'primary',
  ...props
}: PageButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'ghostLight' && styles.buttonGhostLight,
        variant === 'outline' && styles.buttonOutline,
        className,
      )}
    >
      {children}
      {showArrow && <span className={styles.buttonArrow}>→</span>}
    </button>
  );
}
