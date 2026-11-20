'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './StatsBar.module.css';
import { Box, Text } from 'ui/base';
import { MetricStrip } from 'ui/pages';

export function StatsBar() {
  const passes = ['a', 'b'] as const;

  return (
    <Box data-section="stats">
      <MetricStrip
        items={c.stats.map((stat) => ({
          value: stat.value,
          label: stat.label,
        }))}
      />
      <Box className={styles.marqueeWrap} aria-label="适用场景">
        <Box className={styles.marqueeTrack}>
          {passes.flatMap((pass) =>
            c.marqueeTags.map((tag) => (
              <Box key={`${pass}:${tag}`} className={styles.marqueeItem}>
                <Box as="span" className={styles.marqueeDot} aria-hidden="true" />
                <Text as="span" size="xs" variant="secondary" weight="bold">
                  {tag}
                </Text>
              </Box>
            )),
          )}
        </Box>
      </Box>
    </Box>
  );
}
