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
  type TextareaHTMLAttributes,
} from 'react';

export type TextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'style'
> & {
  fullWidth?: boolean;
  invalid?: boolean;
  size?: FieldSize;
  tone?: FieldTone;
  unstyled?: boolean;
  variant?: FieldVariant;
};

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    {
      className,
      disabled,
      fullWidth = true,
      invalid,
      size = 'md',
      tone = 'neutral',
      unstyled = false,
      variant = 'default',
      ...props
    },
    ref,
  ) {
    if (unstyled) {
      return (
        <textarea
          {...props}
          ref={ref}
          disabled={disabled}
          aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
          className={cx(styles.legacyTextarea, className)}
        />
      );
    }

    return (
      <span
        className={cx(styles.textareaRoot, className)}
        data-disabled={disabled ? true : undefined}
        data-full-width={fullWidth ? true : undefined}
        data-size={size}
        data-tone={resolveTone(tone, invalid)}
        data-variant={variant}
      >
        <textarea
          {...props}
          ref={ref}
          disabled={disabled}
          aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
          className={styles.textareaControl}
        />
      </span>
    );
  },
);
