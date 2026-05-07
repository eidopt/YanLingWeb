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
    ink: '#07090f',
    accent: '#6366f1',
    accentAlt: '#8b5cf6',
    hot: '#f43f5e',
    warning: '#f59e0b',
    success: '#10b981',
    muted: '#64748b',
    surface: '#ffffff',
  },
  radius: {
    card: '1.25rem',
  },
  motion: {
    quick: '160ms',
    base: '220ms',
    reveal: '420ms',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
};

export const appgenPageThemeVars = createPageThemeVars(appgenPageTheme);
