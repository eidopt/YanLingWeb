'use client';

import { AppErrorBoundary } from './AppErrorBoundary';
import styles from './AppShell.module.css';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppServicesProvider } from 'services/AppServicesContext';
import { useAuthUser } from 'state/authState';
import { Box } from 'ui/base';
import { FakeGlobalNav } from 'ui/global_nav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppServicesProvider>
      <AppErrorBoundary>
        <AppShellContent>{children}</AppShellContent>
      </AppErrorBoundary>
    </AppServicesProvider>
  );
}

function AppShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useAuthUser();
  const isHome = pathname === '/' || pathname === '/builder';
  const isPublicSite = pathname.startsWith('/sites/');
  const isWorkspaceRoute = pathname === '/' || pathname === '/templates';
  const isAuthCheckingWorkspace = isWorkspaceRoute && user === undefined;
  const isLoggedInWorkspace = isWorkspaceRoute && Boolean(user);
  const showGlobalNav = !isPublicSite && !isLoggedInWorkspace && !isAuthCheckingWorkspace;
  const useOverlayViewport = isHome && !isLoggedInWorkspace && !isAuthCheckingWorkspace;

  return (
    <Box className={styles.appShell}>
      {showGlobalNav && <FakeGlobalNav variant={isHome ? 'overlay' : 'default'} />}
      <Box className={useOverlayViewport ? styles.routeViewportOverlay : styles.routeViewport}>{children}</Box>
    </Box>
  );
}
