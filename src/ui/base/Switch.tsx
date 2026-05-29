import styles from './Atoms.module.css';
import { cx } from 'base/classname';
import { type ChangeEvent, forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export type SwitchSize = 'sm' | 'md';

export type SwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'children' | 'className' | 'onChange' | 'size' | 'style' | 'type'
> & {
  label?: ReactNode;
  size?: SwitchSize;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onCheckedChange?: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, size = 'md', disabled, onChange, onCheckedChange, ...props },
  ref,
) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(event);
    onCheckedChange?.(event.target.checked, event);
  }

  return (
    <label className={styles.switch} data-size={size} data-disabled={disabled ? true : undefined}>
      <input
        {...props}
        ref={ref}
        type="checkbox"
        role="switch"
        disabled={disabled}
        className={styles.switchInput}
        onChange={handleChange}
      />
      <span aria-hidden="true" className={styles.switchTrack}>
        <span className={styles.switchThumb} />
      </span>
      {label != null && <span className={cx(styles.switchLabel)}>{label}</span>}
    </label>
  );
});
