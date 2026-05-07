'use client';

import type { DynamicThemeScreenPreset } from '../../renderer';
import { DesktopIcon, MobileIcon } from '../icons/DeviceIcons';
import styles from '../ThemeLayoutBuilder.module.css';
import { previewModeSwitchContent } from './PreviewModeSwitch.content';
import { cx } from 'base/classname';

interface PreviewModeSwitchProps {
  screenPreset: DynamicThemeScreenPreset;
  onChange: (preset: DynamicThemeScreenPreset) => void;
}

export function PreviewModeSwitch(
  { screenPreset, onChange }: PreviewModeSwitchProps,
) {
  return (
    <div
      className={cx(
        styles.segmentedSwitch,
        screenPreset === 'mobile' && styles.segmentedSwitchSecondActive,
      )}
      role="tablist"
      aria-label={previewModeSwitchContent.tablistAriaLabel}
    >
      <span className={styles.segmentedSwitchThumb} aria-hidden="true" />
      <button
        type="button"
        role="tab"
        className={cx(
          styles.segmentedSwitchButton,
          screenPreset === 'desktop' && styles.segmentedSwitchButtonActive,
        )}
        onClick={() => onChange('desktop')}
        aria-selected={screenPreset === 'desktop'}
        aria-label={previewModeSwitchContent.desktopAriaLabel}
      >
        <span className={styles.switchIcon}>
          <DesktopIcon />
        </span>
      </button>
      <button
        type="button"
        role="tab"
        className={cx(
          styles.segmentedSwitchButton,
          screenPreset === 'mobile' && styles.segmentedSwitchButtonActive,
        )}
        onClick={() => onChange('mobile')}
        aria-selected={screenPreset === 'mobile'}
        aria-label={previewModeSwitchContent.mobileAriaLabel}
      >
        <span className={styles.switchIcon}>
          <MobileIcon />
        </span>
      </button>
    </div>
  );
}
