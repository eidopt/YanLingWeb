'use client';

import styles from './EditorPage.module.css';
import { EditorPageView } from './EditorPageView';
import { useEditorPageController } from './useEditorPageController';
import { Suspense } from 'react';
import { Box } from 'ui/system';

function EditorPageInner() {
  const controller = useEditorPageController();
  return <EditorPageView {...controller} />;
}

export function EditorPage() {
  return (
    <Suspense fallback={<Box className={styles.viewport} />}>
      <EditorPageInner />
    </Suspense>
  );
}
