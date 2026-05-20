'use client';

import styles from './FormControl.module.css';
import type {
  ChoiceOption,
  FieldSize,
  FieldTone,
} from './formShared';
import { resolveTone } from './formShared';
import {
  type ChangeEvent,
  type FieldsetHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useState,
} from 'react';

export type RadioButtonProps = Omit<
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

export const RadioButton = forwardRef<HTMLInputElement, RadioButtonProps>(
  function RadioButton(
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
          type="radio"
          disabled={disabled}
          aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
          className={styles.choiceInput}
          onChange={handleChange}
        />
        <span aria-hidden="true" className={`${styles.choiceMark} ${styles.radioMark}`} />
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

export type RadioGroupOption = ChoiceOption;

export type RadioGroupProps = Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  'className' | 'onChange' | 'style'
> & {
  defaultValue?: string;
  disabled?: boolean;
  invalid?: boolean;
  legend?: ReactNode;
  name: string;
  onValueChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void;
  options: RadioGroupOption[];
  orientation?: 'horizontal' | 'vertical';
  size?: FieldSize;
  tone?: FieldTone;
  value?: string;
};

export function RadioGroup({
  defaultValue,
  disabled,
  invalid,
  legend,
  name,
  onValueChange,
  options,
  orientation = 'vertical',
  size = 'md',
  tone = 'neutral',
  value,
  ...props
}: RadioGroupProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');
  const selectedValue = value ?? uncontrolledValue;

  function handleChange(nextValue: string, event: ChangeEvent<HTMLInputElement>) {
    if (value === undefined) {
      setUncontrolledValue(nextValue);
    }

    onValueChange?.(nextValue, event);
  }

  return (
    <fieldset
      {...props}
      className={styles.radioGroup}
      data-orientation={orientation}
      disabled={disabled}
    >
      {legend && <legend className={styles.radioLegend}>{legend}</legend>}
      {options.map((option) => (
        <RadioButton
          key={option.value}
          name={name}
          value={option.value}
          checked={selectedValue === option.value}
          disabled={disabled === true || option.disabled === true}
          description={option.description}
          invalid={invalid}
          label={option.label}
          size={size}
          tone={tone}
          onCheckedChange={(checked, event) => {
            if (checked) {
              handleChange(option.value, event);
            }
          }}
        />
      ))}
    </fieldset>
  );
}
