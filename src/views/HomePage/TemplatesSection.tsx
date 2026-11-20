'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './TemplatesSection.module.css';
import { useTemplates } from 'hooks/useTemplates';
import { Box, Heading, Text } from 'ui/base';
import { CardGrid, PageButton, PageSection, ScrollReveal } from 'ui/pages';
import { ThemeCard } from 'ui/theme_card';

interface TemplatesSectionProps {
  onBrowseTemplates: () => void;
  onTemplateSelect: () => void;
}

export function TemplatesSection({ onBrowseTemplates, onTemplateSelect }: TemplatesSectionProps) {
  const { templates } = useTemplates();

  return (
    <PageSection tone="muted">
      <ScrollReveal variant="fadeUp">
        <Box className={styles.sectionTopBar}>
          <Box className={styles.sectionTitleGroup}>
            <Text as="span" size="xs" tracking="wide" variant="accent" weight="bold">
              {c.templates.eyebrow}
            </Text>
            <Heading size="hero" variant="primary" weight="heavy">
              {c.templates.title}
            </Heading>
            <Text size="base" variant="muted">
              {c.templates.sub}
            </Text>
          </Box>
          <PageButton variant="outline" onClick={onBrowseTemplates}>
            {c.templates.moreBtn}
          </PageButton>
        </Box>
      </ScrollReveal>

      <CardGrid auto className={styles.templateGrid}>
        {templates.map((theme, i) => (
          <ScrollReveal key={theme.id} variant="fadeUp" delay={i * 60}>
            <Box className={styles.templateCardMotion}>
              <ThemeCard theme={theme} onClick={onTemplateSelect} />
            </Box>
          </ScrollReveal>
        ))}
      </CardGrid>

      {templates.length === 0 && (
        <Box className={styles.templateEmpty}>
          <Text align="center" size="sm" variant="muted">
            模板正在加载，稍后会自动显示。
          </Text>
        </Box>
      )}
    </PageSection>
  );
}
