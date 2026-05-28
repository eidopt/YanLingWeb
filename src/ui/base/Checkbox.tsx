import styles from './FormControl.module.css';
import type {
  FieldSize,
  FieldTone,
} from './formShared';
import { resolveTone } from './formShared';
import {
  type ChangeEvent,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'children' | 'className' | 'onChange' | 'size' | 'style' | 'type'
> & {
  description?: ReactNode;
  invalid?: boolean;
  label: ReactNode;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onCheckedChange?: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  size?: FieldSize;
  tone?: FieldTone;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      description,
      disabled,
      invalid,
      label,
      onChange,
      onCheckedChange,
      size = 'md',
      tone = 'neutral',
      ...props
    },
    ref,
  ) {
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      onChange?.(event);
      onCheckedChange?.(event.target.checked, event);
    }

    return (
      <label
        className={styles.choiceRoot}
        data-disabled={disabled ? true : undefined}
        data-size={size}
        data-tone={resolveTone(tone, invalid)}
      >
        <input
          {...props}
          ref={ref}
          type="checkbox"
          disabled={disabled}
          aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
          className={styles.choiceInput}
          onChange={handleChange}
        />
        <span aria-hidden="true" className={`${styles.choiceMark} ${styles.checkboxMark}`} />
        <span className={styles.choiceText}>
          <span className={styles.choiceLabel}>{label}</span>
          {description && (
            <span className={styles.choiceDescription}>{description}</span>
          )}
        </span>
      </label>
    );
  },
);
