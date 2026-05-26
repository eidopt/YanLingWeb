import type { DynamicThemeScreenPreset } from './types';

export interface PreviewScreenPresetOption {
  preset: DynamicThemeScreenPreset;
  disabled: boolean;
  visible: boolean;
}

export function getPreviewScreenPresetOptions(
  platformCategories?: readonly string[],
): PreviewScreenPresetOption[] {
  const platforms = new Set(
    (platformCategories ?? [])
      .map((category) => category.trim().toLowerCase())
      .filter(Boolean),
  );
  const hasExplicitPlatform = platforms.size > 0;
  const isTabletTemplate = platforms.has('tablet-app');
  const isWebTemplate = platforms.has('web');
  const isNativeOnlyTemplate = hasExplicitPlatform && !isWebTemplate;

  return [
    { preset: 'mobile', disabled: false, visible: true },
    {
      preset: 'tablet',
      disabled: !isTabletTemplate,
      visible: true,
    },
    {
      preset: 'desktop',
      disabled: isNativeOnlyTemplate || isTabletTemplate,
      visible: true,
    },
  ];
}

export function getDefaultPreviewScreenPreset(
  platformCategories?: readonly string[],
): DynamicThemeScreenPreset {
  if (
    (platformCategories ?? []).some(
      (category) => category.trim().toLowerCase() === 'tablet-app',
    )
  ) {
    return 'tablet';
  }
  return getPreviewScreenPresetOptions(platformCategories).find(
    (option) => option.visible && !option.disabled,
  )?.preset ?? 'mobile';
}

export function isPreviewScreenPresetAllowed(
  preset: DynamicThemeScreenPreset,
  platformCategories?: readonly string[],
): boolean {
  const option = getPreviewScreenPresetOptions(platformCategories).find(
    (candidate) => candidate.preset === preset,
  );
  return Boolean(option?.visible && !option.disabled);
}
