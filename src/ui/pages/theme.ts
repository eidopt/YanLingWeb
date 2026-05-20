import type { CSSProperties } from 'react';

export interface PageTheme {
  colors: {
    ink: string;
    accent: string;
    accentAlt: string;
    hot: string;
    warning: string;
    success: string;
    muted: string;
    surface: string;
  };
  radius: {
    card: string;
  };
  motion: {
    quick: string;
    base: string;
    reveal: string;
    spring: string;
    smooth: string;
  };
}

export function createPageThemeVars(theme: PageTheme): CSSProperties {
  return {
    '--page-ink': theme.colors.ink,
    '--page-accent': theme.colors.accent,
    '--page-accent-alt': theme.colors.accentAlt,
    '--page-hot': theme.colors.hot,
    '--page-warning': theme.colors.warning,
    '--page-success': theme.colors.success,
    '--page-muted': theme.colors.muted,
    '--page-surface': theme.colors.surface,
    '--page-card-radius': theme.radius.card,
    '--page-motion-quick': theme.motion.quick,
    '--page-motion-base': theme.motion.base,
    '--page-motion-reveal': theme.motion.reveal,
    '--page-motion-spring': theme.motion.spring,
    '--page-motion-smooth': theme.motion.smooth,

    // Backward-compatible aliases for page styles migrated before the generic tokens.
    '--c-ink': theme.colors.ink,
    '--c-indigo': theme.colors.accent,
    '--c-violet': theme.colors.accentAlt,
    '--c-pink': theme.colors.hot,
    '--c-amber': theme.colors.warning,
    '--c-emerald': theme.colors.success,
    '--c-slate': theme.colors.muted,
    '--r-card': theme.radius.card,
    '--motion-quick': theme.motion.quick,
    '--motion-base': theme.motion.base,
    '--motion-reveal': theme.motion.reveal,
    '--motion-spring': theme.motion.spring,
    '--motion-smooth': theme.motion.smooth,
  } as CSSProperties;
}

export const appgenPageTheme: PageTheme = {
  colors: {
    ink: 'var(--app-color-ink)',
    accent: 'var(--app-color-primary)',
    accentAlt: 'var(--app-color-accent)',
    hot: 'var(--c-pink)',
    warning: 'var(--app-color-warning)',
    success: 'var(--app-color-success)',
    muted: 'var(--app-text-muted)',
    surface: 'var(--app-surface-1)',
  },
  radius: {
    card: 'var(--app-radius-xl)',
  },
  motion: {
    quick: 'var(--app-motion-fast)',
    base: 'var(--app-motion-base)',
    reveal: 'var(--app-motion-slow)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    smooth: 'var(--app-motion-smooth)',
  },
};

export const appgenPageThemeVars = createPageThemeVars(appgenPageTheme);
