'use client';

import styles from './AppShell.module.css';
import { usePathname } from 'next/navigation';
import { AppServicesProvider } from 'services/AppServicesContext';
import { FakeGlobalNav } from 'ui/global_nav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === '/' || pathname === '/builder';
  return (
    <AppServicesProvider>
      <div className={styles.appShell}>
        <FakeGlobalNav variant={isHome ? 'overlay' : 'default'} />
        <div className={isHome ? styles.routeViewportOverlay : styles.routeViewport}>
          {children}
        </div>
      </div>
    </AppServicesProvider>
  );
}
