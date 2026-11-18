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
  designer: '方案设计',
  critic: '差异审查',
  schema: '页面生成',
  verifier: '质量校验',
};

const STAGE_ORDER: readonly PipelineStageName[] = ['designer', 'critic', 'schema', 'verifier'];

export function PipelineProgress({ stages, currentAttempt }: PipelineProgressProps) {
  const stageMap = new Map(stages.map((s) => [s.stage, s]));
  return (
    <Box className={styles.container} aria-label="生成流水线进度">
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
                第 {stage.attempt} 轮...
              </Text>
            ) : null}
            {stage.status === 'ok' && stage.durationMs != null ? (
              <Text as="span" size="xs" variant="muted">
                {(stage.durationMs / 1000).toFixed(1)} 秒
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
            第 {currentAttempt} 轮生成
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
