'use client';

import styles from './WorkspaceSkeleton.module.css';
import { Box } from 'ui/base';

function CardSkeleton() {
  return (
    <Box className={styles.card}>
      <Box className={styles.cardPreview} />
      <Box className={styles.cardBody}>
        <Box className={styles.cardLine} style={{ width: '72%' }} />
        <Box className={styles.cardLine} style={{ width: '48%' }} />
        <Box className={styles.cardLine} style={{ width: '60%' }} />
      </Box>
    </Box>
  );
}

export function WorkspaceSkeleton() {
  return (
    <Box className={styles.skeletonGrid}>
      {Array.from({ length: 6 }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </Box>
  );
}
