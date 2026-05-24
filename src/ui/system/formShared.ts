import type { ReactNode } from 'react';

export type FieldSize = 'sm' | 'md' | 'lg';
export type FieldTone = 'neutral' | 'success' | 'warning' | 'danger';
export type FieldVariant = 'default' | 'filled' | 'quiet' | 'glass';

export interface ChoiceOption {
  description?: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: string;
}

export interface SelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export function resolveTone(
  tone: FieldTone = 'neutral',
  invalid?: boolean,
): FieldTone {
  return invalid ? 'danger' : tone;
}
