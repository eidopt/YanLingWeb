'use client';

import { editorPageContent as c } from './EditorPage.content';
import styles from './EditorPage.module.css';
import { PipelineStore } from './pipelineStore';
import type { EditorPageController } from './useEditorPageController';
import { cx } from 'base/classname';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Box } from 'ui/base';
import { PipelineProgress } from 'ui/chat/PipelineProgress';
import { ThemeLayoutBuilder } from 'ui/editor/ThemeLayoutBuilder';

export function EditorPageView({
  loading,
  generating,
  generateError,
  templates,
  libraryTemplates,
  initialThemeId,
  handleCanvasesChange,
  onPipelineEvent,
}: EditorPageController) {
  const [store] = useState(() => new PipelineStore());
  const pipelineState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    if (generating) {
      store.reset();
      return onPipelineEvent((event) => {
        store.applyEvent(event);
      });
    }
    return undefined;
  }, [generating, onPipelineEvent, store]);

  if (generating) {
    return (
      <Box className={cx(styles.viewport, styles.statusScreen)}>
        <Box className={styles.statusBlock}>
          <Box className={styles.statusText}>{c.generating}</Box>
          {pipelineState.stages.length > 0 ? (
            <Box className={styles.pipelineWrapper}>
              <PipelineProgress stages={pipelineState.stages} currentAttempt={pipelineState.currentAttempt} />
            </Box>
          ) : null}
        </Box>
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
