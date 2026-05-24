'use client';

import type { ThemeLibraryDependency } from '../layout/types';
import { isAllowedWidgetDependency } from '@shared/agent/validation/widgetSafety';
import { useEffect, useMemo, useState } from 'react';

const libraryCache = new Map<string, unknown>();
const WIDGET_RUNTIME_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI_WIDGETS !== 'false';

function hasDefaultExport(value: unknown): value is { default: unknown } {
  return typeof value === 'object' && value !== null && 'default' in value;
}

export async function loadLibrary(dep: ThemeLibraryDependency): Promise<void> {
  if (!WIDGET_RUNTIME_ENABLED) {
    return;
  }

  if (libraryCache.has(dep.name)) {
    return;
  }

  if (!isAllowedWidgetDependency(dep.name, dep.url)) {
    throw new Error(`Blocked theme dependency URL: ${dep.url}`);
  }

  const mod: unknown = await import(
    /* webpackIgnore: true */
    /* @vite-ignore */
    dep.url
  );
  libraryCache.set(dep.name, hasDefaultExport(mod) ? mod.default : mod);
}

export function getLibrary(name: string): unknown {
  return libraryCache.get(name);
}

export function useDependencyLoader(deps: ThemeLibraryDependency[] | undefined): boolean {
  const depsKey = useMemo(
    () => deps?.map((dep) => `${dep.name}:${dep.url}`).join('|') ?? '',
    [deps],
  );
  const [loadedDepsKey, setLoadedDepsKey] = useState<string | null>(null);
  const readyWithoutLoading =
    !WIDGET_RUNTIME_ENABLED
    || !deps?.length
    || deps.every((dep) => libraryCache.has(dep.name));

  useEffect(() => {
    if (!WIDGET_RUNTIME_ENABLED || !deps?.length) {return;}
    const missing = deps.filter((dep) => !libraryCache.has(dep.name));
    if (!missing.length) {return;}
    let cancelled = false;
    void Promise.all(missing.map(loadLibrary))
      .then(() => {
        if (!cancelled) {
          setLoadedDepsKey(depsKey);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error('Failed to load theme dependency', error);
        }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps identity changes on every render; compare by serialized names
  }, [depsKey]);

  return readyWithoutLoading || loadedDepsKey === depsKey;
}
