'use client';

import type { ThemeLibraryDependency } from '../layout/types';
import {
  isAllowedWidgetDependency,
  isWidgetRuntimePolicyEnabled,
  type WidgetRuntimePolicy,
} from '@shared/agent/contracts/widgetSafety';
import { useEffect, useMemo, useState } from 'react';

const libraryCache = new Map<string, unknown>();
const WIDGET_RUNTIME_ENABLED = process.env.NEXT_PUBLIC_ENABLE_AI_WIDGETS !== 'false';

function hasDefaultExport(value: unknown): value is { default: unknown } {
  return typeof value === 'object' && value !== null && 'default' in value;
}

export async function loadLibrary(dep: ThemeLibraryDependency, widgetPolicy?: WidgetRuntimePolicy): Promise<void> {
  if (!WIDGET_RUNTIME_ENABLED || !isWidgetRuntimePolicyEnabled(widgetPolicy)) {
    return;
  }

  if (libraryCache.has(dep.name)) {
    return;
  }

  if (!isAllowedWidgetDependency(dep.name, dep.url, widgetPolicy)) {
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

export function useDependencyLoader(
  deps: ThemeLibraryDependency[] | undefined,
  widgetPolicy?: WidgetRuntimePolicy,
): boolean {
  const policyKey = useMemo(() => JSON.stringify(widgetPolicy ?? {}), [widgetPolicy]);
  const depsKey = useMemo(() => deps?.map((dep) => `${dep.name}:${dep.url}`).join('|') ?? '', [deps]);
  const loadKey = `${depsKey}::${policyKey}`;
  const loadableDeps = useMemo(
    () => deps?.filter((dep) => isAllowedWidgetDependency(dep.name, dep.url, widgetPolicy)) ?? [],
    [deps, widgetPolicy],
  );
  const [loadedDepsKey, setLoadedDepsKey] = useState<string | null>(null);
  const readyWithoutLoading =
    !WIDGET_RUNTIME_ENABLED ||
    !isWidgetRuntimePolicyEnabled(widgetPolicy) ||
    !loadableDeps.length ||
    loadableDeps.every((dep) => libraryCache.has(dep.name));

  useEffect(() => {
    if (!WIDGET_RUNTIME_ENABLED || !isWidgetRuntimePolicyEnabled(widgetPolicy) || !loadableDeps.length) {
      return;
    }
    const missing = loadableDeps.filter((dep) => !libraryCache.has(dep.name));
    if (!missing.length) {
      return;
    }
    let cancelled = false;
    void Promise.all(missing.map((dep) => loadLibrary(dep, widgetPolicy)))
      .then(() => {
        if (!cancelled) {
          setLoadedDepsKey(loadKey);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error('Failed to load theme dependency', error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadKey, loadableDeps, widgetPolicy]);

  return readyWithoutLoading || loadedDepsKey === loadKey;
}
