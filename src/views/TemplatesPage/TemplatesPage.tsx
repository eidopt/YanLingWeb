'use client';

import { TemplatesPageView } from './TemplatesPageView';
import { useTemplatesPageController } from './useTemplatesPageController';

export function TemplatesPage() {
  const controller = useTemplatesPageController();
  return <TemplatesPageView {...controller} />;
}
