'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './HomePage.module.css';
import {
  CardGrid,
  PageButton,
  PageSection,
  SectionHeader,
  SurfaceCard,
} from 'ui/pages';

interface AIFeaturesSectionProps {
  onCtaClick: () => void;
}

export function AIFeaturesSection({ onCtaClick }: AIFeaturesSectionProps) {
  return (
    <PageSection>
      <div className={styles.aiLayout}>
        <div className={styles.aiLeft}>
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
        </div>
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
      </div>
    </PageSection>
  );
}
