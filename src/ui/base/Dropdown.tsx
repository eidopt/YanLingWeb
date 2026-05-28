import styles from './FormControl.module.css';
import type {
  FieldSize,
  FieldTone,
  FieldVariant,
  SelectOption,
} from './formShared';
import { resolveTone } from './formShared';
import { cx } from 'base/classname';
import {
  type ChangeEvent,
  forwardRef,
  type SelectHTMLAttributes,
} from 'react';

export type DropdownOption = SelectOption;

export type DropdownProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children' | 'className' | 'onChange' | 'size' | 'style'
> & {
  fullWidth?: boolean;
  invalid?: boolean;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (value: string, event: ChangeEvent<HTMLSelectElement>) => void;
  options: DropdownOption[];
  placeholder?: string;
  size?: FieldSize;
  tone?: FieldTone;
  variant?: FieldVariant;
};

export const Dropdown = forwardRef<HTMLSelectElement, DropdownProps>(
  function Dropdown(
    {
      disabled,
      fullWidth = true,
      invalid,
      onChange,
      onValueChange,
      options,
      placeholder,
      size = 'md',
      tone = 'neutral',
      variant = 'default',
      ...props
    },
    ref,
  ) {
    function handleChange(event: ChangeEvent<HTMLSelectElement>) {
      onChange?.(event);
      onValueChange?.(event.target.value, event);
    }

    return (
      <span
        className={styles.selectRoot}
        data-disabled={disabled ? true : undefined}
        data-full-width={fullWidth ? true : undefined}
        data-size={size}
        data-tone={resolveTone(tone, invalid)}
        data-variant={variant}
      >
        <select
          {...props}
          ref={ref}
          disabled={disabled}
          aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
          className={cx(styles.controlReset, styles.selectControl)}
          onChange={handleChange}
        >
          {placeholder && (
            <option value="" disabled={props.required}>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className={styles.selectChevron} />
      </span>
    );
  },
);
