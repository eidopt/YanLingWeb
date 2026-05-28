'use client';

import styles from './WelcomeBanner.module.css';
import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Heading,
  Text,
} from 'ui/base';

interface WelcomeBannerProps {
  userName: string;
  totalTemplates: number;
  myTemplatesCount: number;
  marketTemplatesCount: number;
}

function CountUpBadge({
  value,
  label,
  color,
  delay = 0,
}: {
  value: number;
  label: string;
  color: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [displayValue, setDisplayValue] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {return;}
    const el = ref.current;
    if (!el) {return;}

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          hasAnimated.current = true;
          observer.unobserve(el);
          const target = value;
          const duration = 1000 + delay;
          const start = performance.now();

          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setDisplayValue(Math.round(target * eased));
            if (progress < 1) {requestAnimationFrame(animate);}
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [value, delay]);

  return (
    <Box
      className={styles.statBadge}
      style={{ '--stat-color': color } as React.CSSProperties}
    >
      <span ref={ref} className={styles.statValue}>
        {displayValue}
      </span>
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
    if (hour < 9) {return '早上好';}
    if (hour < 12) {return '上午好';}
    if (hour < 14) {return '中午好';}
    if (hour < 18) {return '下午好';}
    return '晚上好';
  };

  return (
    <Box className={styles.banner}>
      <Box className={styles.bannerBg} aria-hidden="true">
        <Box className={styles.bannerGlow} />
        <Box className={styles.bannerGlow} />
      </Box>

      <Box className={styles.bannerContent}>
        <Box className={styles.greeting}>
          <Box
            as="span"
            className={styles.greetingWave}
            aria-hidden="true"
          >
            👋
          </Box>
          <Box className={styles.greetingText}>
            <Heading as="h2" size="display" variant="primary" weight="heavy">
              {getGreeting()}，{userName}
            </Heading>
            <Text size="base" variant="muted">
              欢迎回到 AI 生产工作台，今天想创建什么应用？
            </Text>
          </Box>
        </Box>

        <Box className={styles.statsRow}>
          <CountUpBadge
            value={totalTemplates}
            label="总模板"
            color="var(--app-color-primary)"
          />
          <CountUpBadge
            value={myTemplatesCount}
            label="我的项目"
            color="var(--app-color-accent)"
            delay={200}
          />
          <CountUpBadge
            value={marketTemplatesCount}
            label="市场模板"
            color="var(--app-color-warning)"
            delay={400}
          />
        </Box>
      </Box>
    </Box>
  );
}
