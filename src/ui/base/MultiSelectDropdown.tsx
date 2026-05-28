'use client';

import styles from './FormControl.module.css';
import type {
  ChoiceOption,
  FieldSize,
  FieldTone,
  FieldVariant,
} from './formShared';
import { resolveTone } from './formShared';
import {
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

export type MultiSelectOption = ChoiceOption;

export type MultiSelectDropdownProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'className' | 'onChange' | 'style' | 'type' | 'value'
> & {
  defaultValue?: string[];
  emptyText?: ReactNode;
  fullWidth?: boolean;
  invalid?: boolean;
  maxVisibleValues?: number;
  name?: string;
  onValueChange?: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: ReactNode;
  required?: boolean;
  size?: FieldSize;
  tone?: FieldTone;
  value?: string[];
  variant?: FieldVariant;
};

function optionLabelToText(option: MultiSelectOption) {
  return typeof option.label === 'string' ? option.label : option.value;
}

export function MultiSelectDropdown({
  defaultValue,
  disabled,
  emptyText = 'No options',
  fullWidth = true,
  id,
  invalid,
  maxVisibleValues = 2,
  name,
  onBlur,
  onClick,
  onKeyDown,
  onValueChange,
  options,
  placeholder = 'Select options',
  required,
  size = 'md',
  tone = 'neutral',
  value,
  variant = 'default',
  ...props
}: MultiSelectDropdownProps) {
  const generatedId = useId();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState<string[]>(
    () => defaultValue ?? [],
  );

  const selectedValues = value ?? uncontrolledValue;
  const selectedSet = useMemo(
    () => new Set(selectedValues),
    [selectedValues],
  );
  const enabledOptions = options.filter((option) => !option.disabled);
  const selectedOptions = options.filter((option) => selectedSet.has(option.value));
  const visibleSelectedOptions = selectedOptions.slice(0, maxVisibleValues);
  const hiddenSelectedCount = Math.max(
    selectedOptions.length - visibleSelectedOptions.length,
    0,
  );
  const listboxId = id ? `${id}-listbox` : `${generatedId}-listbox`;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        rootRef.current
        && event.target instanceof Node
        && !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  function commitValue(nextValue: string[]) {
    if (value === undefined) {
      setUncontrolledValue(nextValue);
    }

    onValueChange?.(nextValue);
  }

  function toggleValue(nextOption: MultiSelectOption) {
    if (nextOption.disabled) {
      return;
    }

    const nextSet = new Set(selectedValues);
    if (nextSet.has(nextOption.value)) {
      nextSet.delete(nextOption.value);
    } else {
      nextSet.add(nextOption.value);
    }

    commitValue(options
      .map((option) => option.value)
      .filter((optionValue) => nextSet.has(optionValue)));
  }

  function focusOption(index: number) {
    const nextOption = optionRefs.current[index];
    nextOption?.focus();
  }

  function openAndFocus(index = 0) {
    setOpen(true);
    window.requestAnimationFrame(() => {
      focusOption(index);
    });
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const selectedIndex = enabledOptions.findIndex((option) => (
        selectedSet.has(option.value)
      ));
      openAndFocus(Math.max(selectedIndex, 0));
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    optionIndex: number,
  ) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (optionIndex + direction + enabledOptions.length)
        % enabledOptions.length;
      focusOption(nextIndex);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusOption(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusOption(enabledOptions.length - 1);
    }
  }

  const summary = selectedOptions.length > 0
    ? selectedOptions.map(optionLabelToText).join(', ')
    : (typeof placeholder === 'string' ? placeholder : 'Select options');

  return (
    <span
      ref={rootRef}
      className={styles.multiRoot}
      data-disabled={disabled ? true : undefined}
      data-full-width={fullWidth ? true : undefined}
      data-open={open ? true : undefined}
      data-size={size}
      data-tone={resolveTone(tone, invalid)}
      data-variant={variant}
    >
      {name && selectedValues.map((selectedValue) => (
        <input
          key={selectedValue}
          type="hidden"
          name={name}
          value={selectedValue}
        />
      ))}
      <button
        {...props}
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
        aria-label={summary}
        aria-required={required ? true : undefined}
        className={styles.multiTrigger}
        onBlur={onBlur}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            setOpen((current) => !current);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.multiValue}>
          {selectedOptions.length === 0 ? (
            <span className={styles.multiPlaceholder}>{placeholder}</span>
          ) : (
            <>
              {visibleSelectedOptions.map((option) => (
                <span key={option.value} className={styles.multiTag}>
                  {option.label}
                </span>
              ))}
              {hiddenSelectedCount > 0 && (
                <span className={styles.multiCount}>
                  +{hiddenSelectedCount}
                </span>
              )}
            </>
          )}
        </span>
        <span aria-hidden="true" className={styles.multiChevron} />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          className={styles.multiPopover}
        >
          {enabledOptions.length === 0 ? (
            <div className={styles.multiEmpty}>{emptyText}</div>
          ) : (
            enabledOptions.map((option, optionIndex) => (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[optionIndex] = element;
                }}
                type="button"
                role="option"
                aria-selected={selectedSet.has(option.value)}
                className={styles.multiOption}
                onClick={() => {
                  toggleValue(option);
                }}
                onKeyDown={(event) => {
                  handleOptionKeyDown(event, optionIndex);
                }}
              >
                <span aria-hidden="true" className={styles.multiOptionCheck} />
                <span className={styles.multiOptionText}>
                  <span className={styles.multiOptionLabel}>{option.label}</span>
                  {option.description && (
                    <span className={styles.multiOptionDescription}>
                      {option.description}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </span>
  );
}
