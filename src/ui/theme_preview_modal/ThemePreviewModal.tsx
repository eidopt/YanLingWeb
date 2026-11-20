'use client';

import {
  type DynamicThemeScreenPreset,
  getDefaultPreviewScreenPreset,
  getPreviewScreenPresetOptions,
} from '../renderer';
import { ThemePreview } from '../theme_preview';
import { themePreviewModalContent as c } from './ThemePreviewModal.content';
import styles from './ThemePreviewModal.module.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ThemeSpec } from 'types/theme.types';
import { Box, Button, Heading, Inline, Stack, Text } from 'ui/base';
import { CloseIcon } from 'ui/icons';

interface ThemePreviewModalProps {
  theme: ThemeSpec;
  onEdit: () => void;
  onClose: () => void;
  editLabel?: string;
}

function ThemePreviewModalContent({ theme, onEdit, onClose, editLabel }: ThemePreviewModalProps) {
  const screenPresetOptions = getPreviewScreenPresetOptions(theme.platformCategories);
  const [screenPreset, setScreenPreset] = useState<DynamicThemeScreenPreset>(
    getDefaultPreviewScreenPreset(theme.platformCategories),
  );

  function handleEdit() {
    onEdit();
    onClose();
  }

  return (
    <Inline className={styles.backdrop} justify="center" onClick={onClose} wrap={false}>
      <Box
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-preview-title"
        onClick={(e) => e.stopPropagation()}
      >
        <Stack className={styles.previewSide}>
          <Inline className={styles.previewTabs} gap="u0-75">
            {screenPresetOptions
              .filter((option) => option.visible)
              .map((option) => (
                <Button
                  key={option.preset}
                  type="button"
                  onClick={() => setScreenPreset(option.preset)}
                  disabled={option.disabled}
                  size="sm"
                  variant={screenPreset === option.preset ? 'tab-active' : 'tab'}
                >
                  {option.preset === 'desktop'
                    ? c.desktopTab
                    : option.preset === 'tablet'
                      ? c.tabletTab
                      : c.mobileTab}
                </Button>
              ))}
          </Inline>
          <Inline className={styles.previewFrame} style={theme.runtime.cssVars} justify="center">
            <Box className={styles.previewViewport} data-preset={screenPreset}>
              <Box className={styles.previewScaleShell} data-preset={screenPreset}>
                <ThemePreview theme={theme} screenPreset={screenPreset} />
              </Box>
            </Box>
          </Inline>
        </Stack>

        <Stack className={styles.infoSide} gap="u1-5">
          <Box className={styles.closeAction}>
            <Button type="button" onClick={onClose} aria-label={c.closeAriaLabel} size="icon-sm" variant="icon">
              <CloseIcon width={16} height={16} />
            </Button>
          </Box>

          <Box className={styles.accentDot} style={{ backgroundColor: theme.accent }} />

          <Heading id="theme-preview-title" size="md" variant="primary" weight="bold">
            {theme.name}
          </Heading>
          <Text size="md" variant="muted">
            {theme.tagline}
          </Text>
          <Text size="sm" variant="secondary">
            {theme.description}
          </Text>

          <Inline className={styles.traits} gap="u0-875">
            {theme.traits.map((trait) => (
              <Box key={trait} as="span" className={styles.trait}>
                <Text as="span" size="xs" variant="secondary">
                  {trait}
                </Text>
              </Box>
            ))}
          </Inline>

          <Box className={styles.editAction}>
            <Button type="button" fullWidth onClick={handleEdit} size="lg" variant="primary">
              {editLabel ?? c.editButton}
            </Button>
          </Box>
        </Stack>
      </Box>
    </Inline>
  );
}

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
