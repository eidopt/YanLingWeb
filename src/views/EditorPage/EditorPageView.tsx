'use client';

import styles from './EditorPage.module.css';
import type { EditorPageController } from './useEditorPageController';
import { ThemeLayoutBuilder } from 'ui/editor/ThemeLayoutBuilder';
import { Box } from 'ui/system';

export function EditorPageView({
  loading,
  templates,
  libraryTemplates,
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
        libraryThemes={libraryTemplates}
        initialThemeId={initialThemeId}
        onCanvasesChange={handleCanvasesChange}
      />
    </Box>
  );
}
