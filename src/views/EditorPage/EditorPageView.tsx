'use client';

import { editorPageContent as c } from './EditorPage.content';
import styles from './EditorPage.module.css';
import type { EditorPageController } from './useEditorPageController';
import { cx } from 'base/classname';
import { Box } from 'ui/base';
import { ThemeLayoutBuilder } from 'ui/editor/ThemeLayoutBuilder';

export function EditorPageView({
  loading,
  generating,
  generateError,
  templates,
  libraryTemplates,
  initialThemeId,
  handleCanvasesChange,
}: EditorPageController) {
  if (generating) {
    return (
      <Box className={cx(styles.viewport, styles.statusScreen)}>
        <Box className={styles.statusText}>{c.generating}</Box>
      </Box>
    );
  }

  if (generateError) {
    return (
      <Box className={cx(styles.viewport, styles.statusScreen)}>
        <Box className={styles.errorText}>{generateError}</Box>
      </Box>
    );
  }

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
