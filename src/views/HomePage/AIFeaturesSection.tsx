'use client';

import styles from './AIFeaturesSection.module.css';
import { homePageContent as c } from './HomePage.content';
import {
  CardGrid,
  PageButton,
  PageSection,
  ScrollReveal,
  SectionHeader,
  SurfaceCard,
} from 'ui/pages';
import { Box } from 'ui/base';

interface AIFeaturesSectionProps {
  onCtaClick: () => void;
}

export function AIFeaturesSection({ onCtaClick }: AIFeaturesSectionProps) {
  return (
    <PageSection>
      <Box className={styles.aiLayout}>
        <Box className={styles.aiLeft}>
          <ScrollReveal variant="fadeRight" duration="slow">
            <SectionHeader
              align="start"
              eyebrow={c.aiFeatures.eyebrow}
              className={styles.aiHeader}
              title={c.aiFeatures.title}
              subtitle={c.aiFeatures.sub}
            />
          </ScrollReveal>
          <ScrollReveal variant="fadeRight" delay={150} duration="slow">
            <PageButton onClick={onCtaClick} showArrow>
              {c.aiFeaturesCta}
            </PageButton>
          </ScrollReveal>
        </Box>
        <CardGrid className={styles.aiRight} columns={2}>
          {c.aiFeatures.items.map((f, i) => (
            <ScrollReveal
              key={f.title}
              variant="fadeUp"
              delay={i * 100}
              duration="slow"
            >
              <SurfaceCard
                color="var(--c-indigo)"
                description={f.desc}
                icon={f.icon}
                title={f.title}
                tone="soft"
              />
            </ScrollReveal>
          ))}
        </CardGrid>
      </Box>
    </PageSection>
  );
}
