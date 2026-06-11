'use client';

import styles from './PipelineProgress.module.css';
import { Box, Text } from 'ui/base';

export type PipelineStageName = 'designer' | 'critic' | 'schema' | 'verifier';
export type PipelineStageStatus = 'pending' | 'running' | 'ok' | 'failed';

export interface PipelineProgressStage {
  stage: PipelineStageName;
  status: PipelineStageStatus;
  attempt: number;
  durationMs?: number;
  error?: string;
}

export interface PipelineProgressProps {
  stages: readonly PipelineProgressStage[];
  currentAttempt?: number;
}

const STAGE_LABELS: Record<PipelineStageName, string> = {
  designer: 'Designer',
  critic: 'Critic',
  schema: 'Schema',
  verifier: 'Verifier',
};

const STAGE_ORDER: readonly PipelineStageName[] = ['designer', 'critic', 'schema', 'verifier'];

export function PipelineProgress({ stages, currentAttempt }: PipelineProgressProps) {
  const stageMap = new Map(stages.map((s) => [s.stage, s]));
  return (
    <Box className={styles.container} aria-label="Pipeline 进度">
      {STAGE_ORDER.map((name) => {
        const stage = stageMap.get(name) ?? { stage: name, status: 'pending' as const, attempt: 0 };
        return (
          <Box key={name} className={styles.stage} data-status={stage.status}>
            <Box className={styles.dot} />
            <Text as="span" size="sm" weight="bold">
              {STAGE_LABELS[name]}
            </Text>
            {stage.status === 'running' ? (
              <Text as="span" size="xs" variant="muted">
                attempt {stage.attempt}...
              </Text>
            ) : null}
            {stage.status === 'ok' && stage.durationMs != null ? (
              <Text as="span" size="xs" variant="muted">
                {(stage.durationMs / 1000).toFixed(1)}s
              </Text>
            ) : null}
            {stage.status === 'failed' ? (
              <Text as="span" size="xs" variant="danger">
                失败
              </Text>
            ) : null}
          </Box>
        );
      })}
      {currentAttempt != null ? (
        <Box className={styles.attempt}>
          <Text as="span" size="xs" variant="faint">
            全局 attempt {currentAttempt}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
