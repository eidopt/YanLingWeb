'use client';

import styles from './EditorPage.module.css';
import { useTemplates } from 'hooks/useTemplates';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ThemeLayoutBuilder } from 'ui/editor/ThemeLayoutBuilder';

function EditorPageInner() {
  const searchParams = useSearchParams();
  const themeId = searchParams.get('themeId') ?? undefined;
  const { templates, loading } = useTemplates();

  if (loading) {
    return <div className={styles.viewport} />;
  }

  return (
    <div className={styles.viewport}>
      <ThemeLayoutBuilder themes={templates} initialThemeId={themeId} />
    </div>
  );
}

export function EditorPage() {
  return (
    <Suspense fallback={<div className={styles.viewport} />}>
      <EditorPageInner />
    </Suspense>
  );
}
