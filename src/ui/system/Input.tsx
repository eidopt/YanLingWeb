import styles from './FormControl.module.css';
import type {
  FieldSize,
  FieldTone,
  FieldVariant,
} from './formShared';
import { resolveTone } from './formShared';
import { cx } from 'base/classname';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'style'
> & {
  fullWidth?: boolean;
  invalid?: boolean;
  leadingIcon?: ReactNode;
  size?: FieldSize;
  tone?: FieldTone;
  trailingIcon?: ReactNode;
  unstyled?: boolean;
  variant?: FieldVariant;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    disabled,
    fullWidth = true,
    invalid,
    leadingIcon,
    size = 'md',
    tone = 'neutral',
    trailingIcon,
    unstyled = false,
    variant = 'default',
    ...props
  },
  ref,
) {
  if (unstyled) {
    return (
      <input
        {...props}
        ref={ref}
        disabled={disabled}
        aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
        className={cx(styles.legacyInput, className)}
      />
    );
  }

  return (
    <span
      className={cx(styles.inputRoot, className)}
      data-disabled={disabled ? true : undefined}
      data-full-width={fullWidth ? true : undefined}
      data-size={size}
      data-tone={resolveTone(tone, invalid)}
      data-variant={variant}
    >
      <span className={styles.inputFrame}>
        {leadingIcon && <span className={styles.adornment}>{leadingIcon}</span>}
        <input
          {...props}
          ref={ref}
          disabled={disabled}
          aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
          className={styles.inputControl}
        />
        {trailingIcon && <span className={styles.adornment}>{trailingIcon}</span>}
      </span>
    </span>
  );
});
