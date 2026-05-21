'use client';

import styles from './AppShell.module.css';
import { useAppServices } from 'hooks/useAppServices';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppServicesProvider } from 'services/AppServicesContext';
import type { AuthUser } from 'services/AuthService';
import { AUTH_CHANGED_EVENT } from 'services/AuthService';
import { FakeGlobalNav } from 'ui/global_nav';
import { Box } from 'ui/system';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppServicesProvider>
      <AppShellContent>{children}</AppShellContent>
    </AppServicesProvider>
  );
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { authService } = useAppServices();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const isHome = pathname === '/' || pathname === '/builder';
  const isPublicSite = pathname.startsWith('/sites/');
  const isAuthCheckingHome = pathname === '/' && user === undefined;
  const isLoggedInHome = pathname === '/' && Boolean(user);
  const showGlobalNav = !isPublicSite && !isLoggedInHome && !isAuthCheckingHome;
  const useOverlayViewport = isHome && !isLoggedInHome && !isAuthCheckingHome;

  useEffect(() => {
    const syncUser = () => {
      setUser(authService.getUser());
    };
    syncUser();
    window.addEventListener(AUTH_CHANGED_EVENT, syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, [authService]);

  return (
    <Box className={styles.appShell}>
      {showGlobalNav && <FakeGlobalNav variant={isHome ? 'overlay' : 'default'} />}
      <Box className={useOverlayViewport ? styles.routeViewportOverlay : styles.routeViewport}>
        {children}
      </Box>
    </Box>
  );
}
