'use client';

import styles from './AIFeaturesSection.module.css';
import { homePageContent as c } from './HomePage.content';
import {
  CardGrid,
  PageButton,
  PageSection,
  SectionHeader,
  SurfaceCard,
} from 'ui/pages';
import { Box } from 'ui/system';

interface AIFeaturesSectionProps {
  onCtaClick: () => void;
}

export function AIFeaturesSection({ onCtaClick }: AIFeaturesSectionProps) {
  return (
    <PageSection>
      <Box className={styles.aiLayout}>
        <Box className={styles.aiLeft}>
          <SectionHeader
            align="start"
            eyebrow={c.aiFeatures.eyebrow}
            className={styles.aiHeader}
            title={c.aiFeatures.title}
            subtitle={c.aiFeatures.sub}
          />
          <PageButton onClick={onCtaClick} showArrow>
            {c.aiFeaturesCta}
          </PageButton>
        </Box>
        <CardGrid className={styles.aiRight} columns={2}>
          {c.aiFeatures.items.map(f => (
            <SurfaceCard
              key={f.title}
              color="var(--c-indigo)"
              description={f.desc}
              icon={f.icon}
              title={f.title}
              tone="soft"
            />
          ))}
        </CardGrid>
      </Box>
    </PageSection>
  );
}
