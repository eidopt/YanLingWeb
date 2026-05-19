'use client';

import { getLibrary } from '../../useDependencyLoader';
import { asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import { useEffect, useRef } from 'react';

const WIDGET_RUNTIME_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI_WIDGETS === 'true';

export function WidgetNode({ props, nodeLayoutStyle }: CoreNodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const library = asString(props.library);
  const code = asString(props.code);

  useEffect(() => {
    if (!WIDGET_RUNTIME_ENABLED) { return; }

    const container = containerRef.current;
    if (!container || !library || !code) {return;}
    const lib = getLibrary(library);
    if (!lib) {return;}

    let cleanup: (() => void) | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- intentional: agent-generated widget init code
      const fn = new Function('container', 'lib', 'data', code) as (
        container: HTMLDivElement,
        lib: unknown,
        data: unknown,
      ) => (() => void) | undefined;
      cleanup = fn(container, lib, props.data) ?? undefined;
    } catch (err) {
      console.error('[WidgetNode] init error', err);
    }

    return () => { cleanup?.(); };
  }, [library, code, props.data]);

  return (
    <div
      ref={containerRef}
      style={nodeLayoutStyle}
      data-widget-library={library || undefined}
      data-widget-runtime={WIDGET_RUNTIME_ENABLED ? 'enabled' : 'disabled'}
    />
  );
}
