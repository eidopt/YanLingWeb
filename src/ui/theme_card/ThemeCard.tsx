'use client';

import styles from './ThemeCard.module.css';
import { cx } from 'base/classname';
import type { ThemeSpec } from 'types/theme.types';
import {
  Box,
  Text,
} from 'ui/system';
import { ThemePreview } from 'ui/theme_preview';

interface ThemeCardProps {
  theme: ThemeSpec;
  onClick: () => void;
  hoverLabel?: string;
  className?: string;
}

export function ThemeCard({
  theme,
  onClick,
  hoverLabel,
  className,
}: ThemeCardProps) {
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={theme.name}
      className={cx(styles.card, className)}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
    >
      <Box className={styles.cardPreview}>
        <Box
          className={styles.cardThumb}
          style={theme.runtime.cssVars}
        >
          <Box className={styles.cardThumbInner}>
            <ThemePreview theme={theme} screenPreset="mobile" />
          </Box>
          {hoverLabel && (
            <Box className={styles.cardOverlay}>
              <Box as="span" className={styles.cardHoverLabel}>{hoverLabel}</Box>
            </Box>
          )}
        </Box>
      </Box>
      <Box className={styles.cardMeta}>
        <Box
          className={styles.cardAccent}
          style={{ backgroundColor: theme.accent }}
        />
        <Box className={styles.cardText}>
          <Box className={styles.cardName}>
            <Text as="span" size="sm" truncate weight="bold">
              {theme.name}
            </Text>
          </Box>
          <Box className={styles.cardTagline}>
            <Text as="span" size="xs" truncate>
              {theme.tagline}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
