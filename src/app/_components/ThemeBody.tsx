'use client';

import { ThemeProvider } from 'hooks/useTheme';
import type { ReactNode } from 'react';

export function ThemeBody({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
