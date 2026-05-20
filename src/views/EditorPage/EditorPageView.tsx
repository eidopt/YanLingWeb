'use client';

import styles from './EditorPage.module.css';
import type { EditorPageController } from './useEditorPageController';
import { ThemeLayoutBuilder } from 'ui/editor/ThemeLayoutBuilder';
import { Box } from 'ui/system';

export function EditorPageView({
  loading,
  templates,
  initialThemeId,
  handleCanvasesChange,
}: EditorPageController) {
  if (loading || templates.length === 0) {
    return <Box className={styles.viewport} />;
  }

  return (
    <Box className={styles.viewport}>
      <ThemeLayoutBuilder
        themes={templates}
        initialThemeId={initialThemeId}
        onCanvasesChange={handleCanvasesChange}
      />
    </Box>
  );
}
