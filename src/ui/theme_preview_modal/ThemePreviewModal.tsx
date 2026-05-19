'use client';

import type { DynamicThemeScreenPreset } from '../renderer';
import { ThemePreview } from '../theme_preview';
import { themePreviewModalContent as c } from './ThemePreviewModal.content';
import styles from './ThemePreviewModal.module.css';
import { cx } from 'base/classname';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ThemeSpec } from 'types/theme.types';

// ── internal modal component ─────────────────────────────────────────────────

interface ThemePreviewModalProps {
  theme: ThemeSpec;
  onEdit: () => void;
  onClose: () => void;
  editLabel?: string;
}

function ThemePreviewModalContent(
  { theme, onEdit, onClose, editLabel }: ThemePreviewModalProps,
) {
  const [screenPreset, setScreenPreset] =
    useState<DynamicThemeScreenPreset>('mobile');

  function handleEdit() {
    onEdit();
    onClose();
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: preview area */}
        <div className={styles.previewSide}>
          <div className={styles.previewTabs}>
            <button
              type="button"
              className={cx(
                styles.previewTab,
                screenPreset === 'mobile' && styles.previewTabActive,
              )}
              onClick={() => setScreenPreset('mobile')}
            >
              {c.mobileTab}
            </button>
            <button
              type="button"
              className={cx(
                styles.previewTab,
                screenPreset === 'desktop' && styles.previewTabActive,
              )}
              onClick={() => setScreenPreset('desktop')}
            >
              {c.desktopTab}
            </button>
          </div>
          <div
            className={styles.previewFrame}
            style={theme.runtime.cssVars as React.CSSProperties}
          >
            <div
              className={styles.previewViewport}
              data-preset={screenPreset}
            >
              <ThemePreview theme={theme} screenPreset={screenPreset} />
            </div>
          </div>
        </div>

        {/* Right: info + actions */}
        <div className={styles.infoSide}>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={c.closeAriaLabel}
          >
            ✕
          </button>

          <div
            className={styles.accentDot}
            style={{ backgroundColor: theme.accent }}
          />

          <h2 className={styles.themeName}>{theme.name}</h2>
          <p className={styles.tagline}>{theme.tagline}</p>
          <p className={styles.description}>{theme.description}</p>

          <div className={styles.traits}>
            {theme.traits.map((trait) => (
              <span key={trait} className={styles.trait}>
                {trait}
              </span>
            ))}
          </div>

          <button
            type="button"
            className={styles.editBtn}
            onClick={handleEdit}
          >
            {editLabel ?? c.editButton}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── imperative API ───────────────────────────────────────────────────────────

export function showThemePreviewModal(
  theme: ThemeSpec,
  onEdit: () => void,
  options: { editLabel?: string } = {},
): void {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  function close() {
    root.unmount();
    container.remove();
  }

  root.render(
    <ThemePreviewModalContent
      theme={theme}
      onEdit={onEdit}
      onClose={close}
      editLabel={options.editLabel}
    />,
  );
}
