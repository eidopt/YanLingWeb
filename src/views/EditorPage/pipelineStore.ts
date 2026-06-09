import type { PipelineStageEvent } from './useEditorPageController';
import type { PipelineProgressStage, PipelineStageName, PipelineStageStatus } from 'ui/chat/PipelineProgress';

const PIPELINE_STAGE_NAMES: readonly PipelineStageName[] = ['designer', 'critic', 'schema', 'verifier'];

export interface PipelineStagePayload {
  phase: 'start' | 'end';
  stage: PipelineStageName;
  attempt: number;
  status?: 'ok' | 'failed';
  durationMs?: number;
  error?: string;
}

export function parsePipelineEvent(event: PipelineStageEvent): PipelineStagePayload | null {
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

export interface PipelineState {
  stages: PipelineProgressStage[];
  currentAttempt: number | undefined;
}

export const EMPTY_PIPELINE_STATE: PipelineState = { stages: [], currentAttempt: undefined };

export class PipelineStore {
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
