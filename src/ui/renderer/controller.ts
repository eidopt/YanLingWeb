import { createDynamicThemeRendererState, useDynamicThemeRendererState } from './state';
import type { DynamicThemeRendererController, DynamicThemeRendererControllerOptions } from './types';
import { useMemo } from 'react';

export function createDynamicThemeRendererController({
  layoutDocument,
  runtime,
  renderNodeShell,
  screenPreset = 'mobile',
  initialPageId,
  onNavigateToPage,
}: DynamicThemeRendererControllerOptions): DynamicThemeRendererController {
  const resolvedRuntime = {
    ...runtime,
    widgetPolicy: layoutDocument.widgetPolicy ?? runtime.widgetPolicy,
    staticRender: renderNodeShell == null,
  };

  return {
    runtime: resolvedRuntime,
    state: createDynamicThemeRendererState({
      layoutDocument,
      screenPreset,
      initialPageId,
      onNavigateToPage,
    }),
    renderNodeShell,
  };
}

export function useDynamicThemeRendererController(
  options: DynamicThemeRendererControllerOptions,
): DynamicThemeRendererController {
  const {
    layoutDocument,
    runtime,
    renderNodeShell,
    screenPreset = 'mobile',
    initialPageId,
    onNavigateToPage,
  } = options;
  const state = useDynamicThemeRendererState({
    layoutDocument,
    screenPreset,
    initialPageId,
    onNavigateToPage,
  });
  const resolvedRuntime = useMemo(
    () => ({
      ...runtime,
      widgetPolicy: layoutDocument.widgetPolicy ?? runtime.widgetPolicy,
      staticRender: renderNodeShell == null,
    }),
    [layoutDocument.widgetPolicy, runtime, renderNodeShell],
  );

  return useMemo(
    () => ({
      runtime: resolvedRuntime,
      state,
      renderNodeShell,
    }),
    [renderNodeShell, resolvedRuntime, state],
  );
}
