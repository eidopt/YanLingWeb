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

const preloadedDependencyUrls = new Set<string>();

/**
 * 预加载：为待加载的 ESM 依赖注入 `<link rel="modulepreload">`，让浏览器在
 * 实际 `import()` 之前就以更高优先级开始抓取模块，缩短首个 widget 的就绪时间。
 * 仅在浏览器环境执行，按 URL 去重，纯增量（不改变加载语义）。
 */
function preloadDependency(dep: ThemeLibraryDependency): void {
  if (typeof document === 'undefined' || preloadedDependencyUrls.has(dep.url)) {
    return;
  }
  preloadedDependencyUrls.add(dep.url);
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = dep.url;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
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
    missing.forEach(preloadDependency);
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
