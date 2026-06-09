'use client';

import { editorPageContent as c } from './EditorPage.content';
import styles from './EditorPage.module.css';
import type { EditorPageController, PipelineStageEvent } from './useEditorPageController';
import { cx } from 'base/classname';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Box } from 'ui/base';
import {
  PipelineProgress,
  type PipelineProgressStage,
  type PipelineStageName,
  type PipelineStageStatus,
} from 'ui/chat/PipelineProgress';
import { ThemeLayoutBuilder } from 'ui/editor/ThemeLayoutBuilder';

const PIPELINE_STAGE_NAMES: readonly PipelineStageName[] = ['designer', 'critic', 'schema', 'verifier'];

interface PipelineStagePayload {
  phase: 'start' | 'end';
  stage: PipelineStageName;
  attempt: number;
  status?: 'ok' | 'failed';
  durationMs?: number;
  error?: string;
}

function parsePipelineEvent(event: PipelineStageEvent): PipelineStagePayload | null {
  try {
    const data = JSON.parse(event.data) as Record<string, unknown>;
    const stage = data.stage;
    const phase = data.phase;
    if (
      (phase !== 'start' && phase !== 'end') ||
      typeof stage !== 'string' ||
      !PIPELINE_STAGE_NAMES.includes(stage as PipelineStageName)
    ) {
      return null;
    }
    return {
      phase,
      stage: stage as PipelineStageName,
      attempt: typeof data.attempt === 'number' ? data.attempt : 0,
      status: data.status === 'ok' || data.status === 'failed' ? data.status : undefined,
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : undefined,
      error: typeof data.error === 'string' ? data.error : undefined,
    };
  } catch {
    return null;
  }
}

interface PipelineState {
  stages: PipelineProgressStage[];
  currentAttempt: number | undefined;
}

const EMPTY_PIPELINE_STATE: PipelineState = { stages: [], currentAttempt: undefined };

class PipelineStore {
  private state: PipelineState = EMPTY_PIPELINE_STATE;
  private listeners = new Set<() => void>();

  getSnapshot = (): PipelineState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  applyEvent(event: PipelineStageEvent): void {
    const payload = parsePipelineEvent(event);
    if (!payload) {
      return;
    }
    const status: PipelineStageStatus = payload.phase === 'start' ? 'running' : (payload.status ?? 'ok');
    const nextStages = this.state.stages.filter((s) => s.stage !== payload.stage);
    nextStages.push({
      stage: payload.stage,
      status,
      attempt: payload.attempt,
      durationMs: payload.durationMs,
      error: payload.error,
    });
    this.state = { stages: nextStages, currentAttempt: payload.attempt };
    for (const listener of this.listeners) {
      listener();
    }
  }

  reset(): void {
    if (this.state === EMPTY_PIPELINE_STATE) {
      return;
    }
    this.state = EMPTY_PIPELINE_STATE;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

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
