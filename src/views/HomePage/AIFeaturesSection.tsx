'use client';

import styles from './AIFeaturesSection.module.css';
import { homePageContent as c } from './HomePage.content';
import { Box } from 'ui/base';
import {
  CheckEyeIcon,
  ComponentBlockIcon,
  CopyWritingIcon,
  InteractionCursorIcon,
  PaletteIcon,
  ResponsiveIcon,
} from 'ui/icons';
import { CardGrid, PageButton, PageSection, ScrollReveal, SectionHeader, SurfaceCard } from 'ui/pages';

interface AIFeaturesSectionProps {
  onCtaClick: () => void;
}

function renderFeatureIcon(iconKey: string) {
  if (iconKey === 'palette') {
    return <PaletteIcon />;
  }
  if (iconKey === 'responsive') {
    return <ResponsiveIcon />;
  }
  if (iconKey === 'component') {
    return <ComponentBlockIcon />;
  }
  if (iconKey === 'copy') {
    return <CopyWritingIcon />;
  }
  if (iconKey === 'cursor') {
    return <InteractionCursorIcon />;
  }
  return <CheckEyeIcon />;
}

export function AIFeaturesSection({ onCtaClick }: AIFeaturesSectionProps) {
  return (
    <PageSection>
      <Box className={styles.aiLayout}>
        <Box className={styles.aiLeft}>
          <ScrollReveal variant="fadeUp">
            <SectionHeader
              align="start"
              eyebrow={c.aiFeatures.eyebrow}
              className={styles.aiHeader}
              title={c.aiFeatures.title}
              subtitle={c.aiFeatures.sub}
            />
          </ScrollReveal>
          <ScrollReveal variant="fadeUp" delay={80}>
            <PageButton onClick={onCtaClick} showArrow>
              {c.aiFeaturesCta}
            </PageButton>
          </ScrollReveal>
        </Box>
        <CardGrid className={styles.aiRight} columns={2}>
          {c.aiFeatures.items.map((f, i) => (
            <ScrollReveal key={f.title} variant="fadeUp" delay={i * 50}>
              <SurfaceCard
                color={f.color}
                description={f.desc}
                icon={renderFeatureIcon(f.iconKey)}
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
