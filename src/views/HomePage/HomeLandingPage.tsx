'use client';

import { AIFeaturesSection } from './AIFeaturesSection';
import { CreationModesSection } from './CreationModesSection';
import { HeroSection } from './HeroSection';
import styles from './HomePage.module.css';
import { PlatformsSection } from './PlatformsSection';
import { ProductStudioSection } from './ProductStudioSection';
import { PublishFlowSection } from './PublishFlowSection';
import { StatsBar } from './StatsBar';
import { TemplatesSection } from './TemplatesSection';
import { homePageThemeVars } from './theme';
import { PageRoot } from 'ui/pages';

export interface HomeLandingPageProps {
  onAuthIntent: (tab?: 'login' | 'register') => void;
  onBrowseTemplates: () => void;
  onTemplateSelect: () => void;
}

export function HomeLandingPage({
  onAuthIntent,
  onBrowseTemplates,
  onTemplateSelect,
}: HomeLandingPageProps) {
  return (
    <PageRoot className={styles.page} style={homePageThemeVars}>
      <HeroSection
        onCtaPrimary={() => onAuthIntent('register')}
        onCtaSecondary={onBrowseTemplates}
      />
      <StatsBar />
      <CreationModesSection />
      <ProductStudioSection onCtaClick={() => onAuthIntent('register')} />
      <PublishFlowSection />
      <PlatformsSection />
      <AIFeaturesSection onCtaClick={() => onAuthIntent('register')} />
      <TemplatesSection
        onBrowseTemplates={onBrowseTemplates}
        onTemplateSelect={onTemplateSelect}
      />
    </PageRoot>
  );
}
