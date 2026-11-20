'use client';

import styles from './WelcomeBanner.module.css';
import { Box, Heading, Text } from 'ui/base';

interface WelcomeBannerProps {
  userName: string;
  totalTemplates: number;
  myTemplatesCount: number;
  marketTemplatesCount: number;
}

function StatBadge({ value, label }: { value: number; label: string }) {
  return (
    <Box className={styles.statBadge}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </Box>
  );
}

export function WelcomeBanner({
  userName,
  totalTemplates,
  myTemplatesCount,
  marketTemplatesCount,
}: WelcomeBannerProps) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 9) {
      return '早上好';
    }
    if (hour < 12) {
      return '上午好';
    }
    if (hour < 14) {
      return '中午好';
    }
    if (hour < 18) {
      return '下午好';
    }
    return '晚上好';
  };

  return (
    <Box className={styles.banner}>
      <Box className={styles.bannerContent}>
        <Box className={styles.greetingText}>
          <Heading as="h2" size="display" variant="primary" weight="heavy">
            {getGreeting()}，{userName}
          </Heading>
          <Text size="base" variant="muted">
            欢迎回到 AI 设计工作台，今天想创建什么应用？
          </Text>
        </Box>

        <Box className={styles.statsRow}>
          <StatBadge value={totalTemplates} label="总模板" />
          <StatBadge value={myTemplatesCount} label="我的项目" />
          <StatBadge value={marketTemplatesCount} label="市场模板" />
        </Box>
      </Box>
    </Box>
  );
}
