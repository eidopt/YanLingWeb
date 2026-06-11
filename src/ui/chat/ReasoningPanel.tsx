'use client';

import styles from './ReasoningPanel.module.css';
import { useState } from 'react';
import { Box, Text } from 'ui/base';

export interface ReasoningPanelProps {
  content: string;
  defaultExpanded?: boolean;
  label?: string;
}

export function ReasoningPanel({ content, defaultExpanded = false, label = 'AI 推理过程' }: ReasoningPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!content) {
    return null;
  }
  return (
    <Box className={styles.container}>
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className={styles.toggle}>
        {expanded ? '▾' : '▸'} {label} ({content.length} 字)
      </button>
      {expanded ? (
        <Box className={styles.body}>
          <pre className={styles.pre}>
            <Text as="span" size="xs" variant="muted">
              {content}
            </Text>
          </pre>
        </Box>
      ) : null}
    </Box>
  );
}
