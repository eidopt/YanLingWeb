'use client';

import styles from './ThemeCard.module.css';
import { cx } from 'base/classname';
import type { ThemeSpec } from 'types/theme.types';
import {
  Box,
  Text,
} from 'ui/base';
import { ThemePreview } from 'ui/theme_preview';

interface ThemeCardProps {
  theme: ThemeSpec;
  onClick: () => void;
  hoverLabel?: string;
  className?: string;
}

const DISPLAY_TITLE_MAX_LENGTH = 12;

function truncateTitle(title: string) {
  return title.length > DISPLAY_TITLE_MAX_LENGTH
    ? `${title.slice(0, DISPLAY_TITLE_MAX_LENGTH)}…`
    : title;
}

export function ThemeCard({
  theme,
  onClick,
  hoverLabel,
  className,
}: ThemeCardProps) {
  const displayName = truncateTitle(theme.categoryLabel ?? theme.name);

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={theme.name}
      title={theme.name}
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
              {displayName}
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
