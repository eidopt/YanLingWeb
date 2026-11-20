'use client';

import { AIFeaturesSection } from './AIFeaturesSection';
import { CreationModesSection } from './CreationModesSection';
import { HeroSection } from './HeroSection';
import { homePageContent as c } from './HomePage.content';
import styles from './HomePage.module.css';
import { PlatformsSection } from './PlatformsSection';
import { ProductStudioSection } from './ProductStudioSection';
import { PublishFlowSection } from './PublishFlowSection';
import { StatsBar } from './StatsBar';
import { TemplatesSection } from './TemplatesSection';
import { homePageThemeVars } from './theme';
import Link from 'next/link';
import { Box, Text } from 'ui/base';
import { BrandMarkIcon } from 'ui/icons';
import { PageRoot } from 'ui/pages';

export interface HomeLandingPageProps {
  onAuthIntent: (tab?: 'login' | 'register') => void;
  onBrowseTemplates: () => void;
  onTemplateSelect: () => void;
}

export function HomeLandingPage({ onAuthIntent, onBrowseTemplates, onTemplateSelect }: HomeLandingPageProps) {
  return (
    <PageRoot className={styles.page} style={homePageThemeVars}>
      <HeroSection onCtaPrimary={() => onAuthIntent('register')} onCtaSecondary={onBrowseTemplates} />
      <StatsBar />
      <CreationModesSection />
      <ProductStudioSection onCtaClick={() => onAuthIntent('register')} />
      <PublishFlowSection />
      <PlatformsSection />
      <AIFeaturesSection onCtaClick={() => onAuthIntent('register')} />
      <TemplatesSection onBrowseTemplates={onBrowseTemplates} onTemplateSelect={onTemplateSelect} />

      <Box as="footer" className={styles.footer}>
        <Box className={styles.footerInner}>
          <Box className={styles.footerBrand}>
            <Box as="span" className={styles.footerMark}>
              <BrandMarkIcon width={14} height={14} />
            </Box>
            <Text as="span" size="sm" variant="primary" weight="bold">
              言灵 AI
            </Text>
            <Text as="span" size="xs" variant="muted">
              · {c.footer.tagline}
            </Text>
          </Box>

          <Box as="nav" className={styles.footerLinks}>
            {c.footer.links.map((item) => (
              <Link key={item.href} href={item.href} className={styles.footerLink}>
                {item.label}
              </Link>
            ))}
          </Box>

          <Text as="span" size="xs" variant="faint">
            {c.footer.copyright}
          </Text>
        </Box>
      </Box>
    </PageRoot>
  );
}
