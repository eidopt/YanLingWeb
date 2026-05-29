'use client';

import { HomeLandingPage } from './HomeLandingPage';
import styles from './HomePage.module.css';
import { HomeWorkspace } from './HomeWorkspace';
import { useRouter } from 'next/navigation';
import { useAuthUser } from 'state/authState';
import { showDialog } from 'ui/authenticating';
import { Box } from 'ui/base';

export function HomePage() {
  const router = useRouter();
  const user = useAuthUser();

  const openAuth = (tab?: 'login' | 'register') => {
    showDialog(
      (redirect) => {
        if (redirect) {
          router.push(redirect);
        }
      },
      { initialTab: tab, successRedirect: '/' },
    );
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
