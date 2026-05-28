import type { ReactNode } from 'react';
import {
  Button,
  type ButtonProps,
} from 'ui/base';

export interface PageButtonProps extends Omit<ButtonProps, 'size' | 'trailingIcon' | 'variant'> {
  children: ReactNode;
  showArrow?: boolean;
  variant?: 'primary' | 'ghost' | 'ghostLight' | 'outline';
}

export function PageButton({
  children,
  showArrow = false,
  type = 'button',
  variant = 'primary',
  ...props
}: PageButtonProps) {
  const systemVariant = {
    ghost: 'inverse-ghost',
    ghostLight: 'inverse-ghost',
    outline: 'outline',
    primary: 'primary',
  } as const;

  return (
    <Button
      {...props}
      size="lg"
      type={type}
      trailingIcon={showArrow ? '→' : undefined}
      variant={systemVariant[variant]}
    >
      {children}
    </Button>
  );
}
