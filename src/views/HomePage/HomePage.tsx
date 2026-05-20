'use client';

import { HomeLandingPage } from './HomeLandingPage';
import styles from './HomePage.module.css';
import { HomeWorkspace } from './HomeWorkspace';
import { useAppServices } from 'hooks/useAppServices';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AuthUser } from 'services/AuthService';
import { AUTH_CHANGED_EVENT } from 'services/AuthService';
import { showDialog } from 'ui/authenticating';
import { Box } from 'ui/system';

export function HomePage() {
  const router = useRouter();
  const { authService } = useAppServices();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

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

  const openAuth = (tab?: 'login' | 'register') => {
    showDialog((redirect) => {
      if (redirect) { router.push(redirect); }
    }, { initialTab: tab, successRedirect: '/' });
  };

  if (user === undefined) {
    return <Box className={styles.authGate} aria-hidden="true" />;
  }

  if (user) {
    return <HomeWorkspace user={user} />;
  }

  return (
    <HomeLandingPage
      onAuthIntent={openAuth}
      onBrowseTemplates={() => router.push('/templates')}
      onTemplateSelect={() => openAuth()}
    />
  );
}
