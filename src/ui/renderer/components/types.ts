import type { CSSProperties, ReactNode } from 'react';

/**
 * CoreNodeProps is generic over T, the component's typed props interface.
 * The default is Record<string, unknown> for backward compatibility.
 *
 * At runtime, the renderer injects additional props (prefixed with __)
 * alongside the template-defined props. Components access both through
 * the same props object, using valueResolvers for safe extraction.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CoreNodeProps<T = Record<string, any>> {
  props: T;
  children: ReactNode[];
  nodeLayoutStyle: CSSProperties;
}
