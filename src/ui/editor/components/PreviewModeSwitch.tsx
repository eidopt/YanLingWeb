'use client';

import type {
  DynamicThemeScreenPreset,
  PreviewScreenPresetOption,
} from '../../renderer';
import { DesktopIcon, MobileIcon, TabletIcon } from '../icons/DeviceIcons';
import styles from '../ThemeLayoutBuilder.module.css';
import { previewModeSwitchContent } from './PreviewModeSwitch.content';
import { cx } from 'base/classname';
import type { CSSProperties } from 'react';
import { Box } from 'ui/system';

interface PreviewModeSwitchProps {
  screenPreset: DynamicThemeScreenPreset;
  options: PreviewScreenPresetOption[];
  onChange: (preset: DynamicThemeScreenPreset) => void;
}

const PRESET_CONTENT = {
  desktop: {
    ariaLabel: previewModeSwitchContent.desktopAriaLabel,
    icon: <DesktopIcon />,
  },
  tablet: {
    ariaLabel: previewModeSwitchContent.tabletAriaLabel,
    icon: <TabletIcon />,
  },
  mobile: {
    ariaLabel: previewModeSwitchContent.mobileAriaLabel,
    icon: <MobileIcon />,
  },
} as const;

export function PreviewModeSwitch(
  { screenPreset, options, onChange }: PreviewModeSwitchProps,
) {
  const visibleOptions = options.filter((option) => option.visible);
  const activeIndex = Math.max(
    0,
    visibleOptions.findIndex((option) => option.preset === screenPreset),
  );

  return (
    <Box
      className={styles.segmentedSwitch}
      style={{
        '--segmented-switch-active-index': activeIndex,
      } as CSSProperties}
      role="tablist"
      aria-label={previewModeSwitchContent.tablistAriaLabel}
    >
      <Box as="span" className={styles.segmentedSwitchThumb} aria-hidden="true" />
      {visibleOptions.map((option) => {
        const content = PRESET_CONTENT[option.preset];
        return (
          <button
            key={option.preset}
            type="button"
            role="tab"
            className={cx(
              styles.segmentedSwitchButton,
              screenPreset === option.preset && styles.segmentedSwitchButtonActive,
            )}
            onClick={() => {
              if (!option.disabled) {
                onChange(option.preset);
              }
            }}
            disabled={option.disabled}
            aria-selected={screenPreset === option.preset}
            aria-label={content.ariaLabel}
          >
            <Box as="span" className={styles.switchIcon}>
              {content.icon}
            </Box>
          </button>
        );
      })}
    </Box>
  );
}
