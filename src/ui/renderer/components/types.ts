import type { CSSProperties, ReactNode } from 'react';

export interface CoreNodeProps {
  props: Record<string, unknown>;
  children: ReactNode[];
  nodeLayoutStyle: CSSProperties;
}
