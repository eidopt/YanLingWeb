'use client';

import { TemplatesPageView } from './TemplatesPageView';
import { useTemplatesPageController } from './useTemplatesPageController';
import { useAppServices } from 'hooks/useAppServices';
import { useEffect, useState } from 'react';
import type { AuthUser } from 'services/AuthService';
import { AUTH_CHANGED_EVENT } from 'services/AuthService';
import { Box } from 'ui/system';
import { HomeWorkspace } from 'views/HomePage/HomeWorkspace';

export function TemplatesPage() {
  const { authService } = useAppServices();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const controller = useTemplatesPageController();

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

  if (user === undefined) {
    return <Box aria-hidden="true" />;
  }

  if (user) {
    return <HomeWorkspace user={user} mode="templates" />;
  }

  return <TemplatesPageView {...controller} />;
}
