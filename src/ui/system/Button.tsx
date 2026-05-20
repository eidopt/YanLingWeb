import styles from './Button.module.css';
import type {
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'danger-soft'
  | 'inverse-ghost'
  | 'inverse-primary'
  | 'neutral'
  | 'tab'
  | 'tab-active'
  | 'icon'
  | 'icon-inverse'
  | 'floating'
  | 'link'
  | 'user';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon-md' | 'fab';

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style' | 'color'
> & {
  children?: ReactNode;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  size?: ButtonSize;
  trailingIcon?: ReactNode;
  variant?: ButtonVariant;
};

export function Button({
  children,
  fullWidth = false,
  leadingIcon,
  size = 'md',
  trailingIcon,
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      data-full-width={fullWidth ? true : undefined}
      data-size={size}
      data-variant={variant}
      className={styles.button}
    >
      {leadingIcon && <span className={styles.buttonIcon}>{leadingIcon}</span>}
      {children}
      {trailingIcon && <span className={styles.buttonIcon}>{trailingIcon}</span>}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'aria-label' | 'children'> {
  icon: ReactNode;
  label: string;
}

export function IconButton({
  icon,
  label,
  size = 'icon-md',
  variant = 'icon',
  ...props
}: IconButtonProps) {
  return (
    <Button {...props} aria-label={label} size={size} variant={variant}>
      {icon}
    </Button>
  );
}
