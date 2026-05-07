'use client';

import { HomeLandingPage } from './HomeLandingPage';
import { useRouter } from 'next/navigation';
import { showDialog } from 'ui/authenticating';

export function HomePage() {
  const router = useRouter();

  const openAuth = (tab?: 'login' | 'register') => {
    showDialog((redirect) => {
      if (redirect) { router.push(redirect); }
    }, { initialTab: tab });
  };

  return (
    <HomeLandingPage
      onAuthIntent={openAuth}
      onBrowseTemplates={() => router.push('/templates')}
      onTemplateSelect={() => openAuth()}
    />
  );
}
