import styles from './Divider.module.css';
import type {
  DataAttributeProps,
  SystemGap,
  SystemStyle,
} from './shared';
import {
  GAP_TOKENS,
  resolveToken,
} from './shared';
import type {
  AriaAttributes,
  AriaRole,
  ReactNode,
  Ref,
} from 'react';
import { createElement } from 'react';

export type DividerInset = SystemGap;
export type DividerLabelPosition = 'start' | 'center' | 'end';
export type DividerOrientation = 'horizontal' | 'vertical';
export type DividerSpacing = SystemGap;
export type DividerThickness = 'thin' | 'medium' | 'thick';
export type DividerVariant = 'subtle' | 'soft' | 'strong' | 'inverse' | 'accent' | 'gradient' | 'dot';

const THICKNESS_TOKENS: Record<DividerThickness, string> = {
  thin: 'var(--app-line-hair)',
  medium: 'var(--app-line-thin)',
  thick: 'var(--app-unit-0-5)',
};

export type DividerProps = AriaAttributes &
  DataAttributeProps & {
    decorative?: boolean;
    id?: string;
    inset?: DividerInset;
    label?: ReactNode;
    labelPosition?: DividerLabelPosition;
    orientation?: DividerOrientation;
    ref?: Ref<HTMLDivElement | HTMLHRElement>;
    role?: AriaRole;
    spacing?: DividerSpacing;
    thickness?: DividerThickness;
    variant?: DividerVariant;
  };

export function Divider({
  'aria-hidden': ariaHidden,
  'aria-label': ariaLabel,
  'aria-orientation': ariaOrientation,
  decorative,
  inset = '0',
  label,
  labelPosition = 'center',
  orientation = 'horizontal',
  role,
  spacing = 'md',
  thickness = 'thin',
  variant = 'subtle',
  ...props
}: DividerProps) {
  const hasLabel = Boolean(label) && orientation === 'horizontal';
  const isDecorative = decorative ?? !hasLabel;
  const element = hasLabel || orientation === 'vertical' ? 'div' : 'hr';

  return createElement(
    element,
    {
      ...props,
      'aria-hidden': isDecorative ? true : ariaHidden,
      'aria-label': !isDecorative && !ariaLabel && typeof label === 'string'
        ? label
        : ariaLabel,
      'aria-orientation': isDecorative ? undefined : (ariaOrientation ?? orientation),
      className: styles.divider,
      'data-has-label': hasLabel ? true : undefined,
      'data-label-position': hasLabel ? labelPosition : undefined,
      'data-orientation': orientation,
      'data-variant': variant,
      role: isDecorative ? 'presentation' : (role ?? 'separator'),
      style: {
        '--ui-divider-inset': resolveToken(inset, GAP_TOKENS),
        '--ui-divider-spacing': resolveToken(spacing, GAP_TOKENS),
        '--ui-divider-thickness': THICKNESS_TOKENS[thickness],
      } satisfies SystemStyle,
    },
    hasLabel
      ? <span className={styles.label}>{label}</span>
      : undefined,
  );
}
