'use client';

import { asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';

const sizeMap: Record<string, string> = {
  xs: 'var(--app-unit-1)',
  sm: 'var(--app-unit-2)',
  md: 'var(--app-unit-3)',
  lg: 'var(--app-unit-4)',
  xl: 'var(--app-unit-6)',
};

export function SpacerNode({ props, nodeLayoutStyle }: CoreNodeProps) {
  const size = asString(props.size, 'md');
  const height = sizeMap[size] ?? size;

  return (
    <div
      aria-hidden="true"
      style={{
        ...nodeLayoutStyle,
        minHeight: height,
      }}
    />
  );
}

