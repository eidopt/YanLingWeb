'use client';

import type { ThemeLibraryDependency } from '../layout/types';
import { useEffect, useState } from 'react';

const libraryCache = new Map<string, unknown>();

function hasDefaultExport(value: unknown): value is { default: unknown } {
  return typeof value === 'object' && value !== null && 'default' in value;
}

export async function loadLibrary(dep: ThemeLibraryDependency): Promise<void> {
  if (libraryCache.has(dep.name)) {
    return;
  }

  const mod: unknown = await import(/* @vite-ignore */ dep.url);
  libraryCache.set(dep.name, hasDefaultExport(mod) ? mod.default : mod);
}

export function getLibrary(name: string): unknown {
  return libraryCache.get(name);
}

export function useDependencyLoader(deps: ThemeLibraryDependency[] | undefined): boolean {
  const [ready, setReady] = useState(() => {
    if (!deps?.length) {return true;}
    return deps.every((dep) => libraryCache.has(dep.name));
  });

  useEffect(() => {
    if (!deps?.length) {
      setReady(true);
      return;
    }
    const missing = deps.filter((dep) => !libraryCache.has(dep.name));
    if (!missing.length) {
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void Promise.all(missing.map(loadLibrary))
      .then(() => {
        if (!cancelled) {
          setReady(true);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error('Failed to load theme dependency', error);
        }
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps identity changes on every render; compare by serialized names
  }, [deps?.map((d) => d.name).join(',')]);

  return ready;
}
