'use client';

import { EditIcon, PreviewIcon } from '../icons/DeviceIcons';
import styles from '../ThemeLayoutBuilder.module.css';
import { interactionModeToggleContent } from './InteractionModeToggle.content';
import { cx } from 'base/classname';

interface InteractionModeToggleProps {
  mode: 'edit' | 'preview';
  onChange: (mode: 'edit' | 'preview') => void;
}

export function InteractionModeToggle({
  mode,
  onChange,
}: InteractionModeToggleProps) {
  return (
    <div
      className={cx(
        styles.segmentedSwitch,
        mode === 'preview' && styles.segmentedSwitchSecondActive,
      )}
      role="tablist"
      aria-label={interactionModeToggleContent.tablistAriaLabel}
    >
      <span className={styles.segmentedSwitchThumb} aria-hidden="true" />
      <button
        type="button"
        role="tab"
        className={cx(
          styles.segmentedSwitchButton,
          mode === 'edit' && styles.segmentedSwitchButtonActive,
        )}
        onClick={() => onChange('edit')}
        aria-selected={mode === 'edit'}
        aria-label={interactionModeToggleContent.editAriaLabel}
      >
        <span className={styles.switchIcon}>
          <EditIcon />
        </span>
      </button>
      <button
        type="button"
        role="tab"
        className={cx(
          styles.segmentedSwitchButton,
          mode === 'preview' && styles.segmentedSwitchButtonActive,
        )}
        onClick={() => onChange('preview')}
        aria-selected={mode === 'preview'}
        aria-label={interactionModeToggleContent.previewAriaLabel}
      >
        <span className={styles.switchIcon}>
          <PreviewIcon />
        </span>
      </button>
    </div>
  );
}
