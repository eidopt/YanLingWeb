'use client';

import { renderThemeNodeTree } from './renderTree';
import type { DynamicThemeRendererController } from './types';
import { useDependencyLoader } from './useDependencyLoader';
import { useInjectAnimations } from './useInjectAnimations';

interface DynamicThemeRendererProps {
  controller: DynamicThemeRendererController;
}

export function DynamicThemeRenderer({ controller }: DynamicThemeRendererProps) {
  useInjectAnimations(controller.runtime);
  const ready = useDependencyLoader(controller.state.layoutDocument.dependencies);

  if (!ready) {return null;}

  return renderThemeNodeTree(
    controller.runtime,
    controller.state,
    controller.renderNodeShell,
  );
}
