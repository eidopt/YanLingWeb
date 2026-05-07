'use client';

import styles from './ThemeCard.module.css';
import type { ThemeSpec } from 'types/theme.types';
import { ThemePreview } from 'ui/theme_preview';

interface ThemeCardProps {
  theme: ThemeSpec;
  onClick: () => void;
  hoverLabel?: string;
}

export function ThemeCard({ theme, onClick, hoverLabel }: ThemeCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.card}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
    >
      <div
        className={styles.cardThumb}
        style={theme.runtime.cssVars as React.CSSProperties}
      >
        <div className={styles.cardThumbInner}>
          <ThemePreview theme={theme} screenPreset="mobile" />
        </div>
        {hoverLabel && (
          <div className={styles.cardOverlay}>
            <span className={styles.cardHoverLabel}>{hoverLabel}</span>
          </div>
        )}
      </div>
      <div className={styles.cardMeta}>
        <div
          className={styles.cardAccent}
          style={{ backgroundColor: theme.accent }}
        />
        <div className={styles.cardText}>
          <span className={styles.cardName}>{theme.name}</span>
          <span className={styles.cardTagline}>{theme.tagline}</span>
        </div>
      </div>
    </div>
  );
}
