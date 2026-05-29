'use client';

import { TemplatesPageView } from './TemplatesPageView';
import { useTemplatesPageController } from './useTemplatesPageController';
import { useAuthUser } from 'state/authState';
import { Box } from 'ui/base';
import { HomeWorkspace } from 'views/HomePage/HomeWorkspace';

export function TemplatesPage() {
  const user = useAuthUser();
  const controller = useTemplatesPageController();

  if (user === undefined) {
    return <Box aria-hidden="true" />;
  }

  if (user) {
    return <HomeWorkspace user={user} mode="templates" />;
  }

  return <TemplatesPageView {...controller} />;
}
