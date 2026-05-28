'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './TemplatesSection.module.css';
import { useTemplates } from 'hooks/useTemplates';
import {
  CardGrid,
  PageButton,
  PageSection,
  ScrollReveal,
  SectionHeader,
} from 'ui/pages';
import {
  Box,
  Text,
} from 'ui/base';
import { ThemeCard } from 'ui/theme_card';

interface TemplatesSectionProps {
  onBrowseTemplates: () => void;
  onTemplateSelect: () => void;
}

export function TemplatesSection({
  onBrowseTemplates,
  onTemplateSelect,
}: TemplatesSectionProps) {
  const { templates } = useTemplates();

  return (
    <PageSection tone="muted">
      <ScrollReveal variant="fadeUp">
        <SectionHeader
          eyebrow={c.templates.eyebrow}
          title={c.templates.title}
          subtitle={c.templates.sub}
        />
      </ScrollReveal>
      <CardGrid auto className={styles.templateGrid}>
        {templates.map((theme, i) => (
          <ScrollReveal
            key={theme.id}
            variant="fadeUp"
            delay={i * 100}
            duration="slow"
          >
            <Box className={styles.templateCardMotion}>
              <ThemeCard
                theme={theme}
                onClick={onTemplateSelect}
              />
            </Box>
          </ScrollReveal>
        ))}
      </CardGrid>
      {templates.length === 0 && (
        <ScrollReveal variant="fadeIn" delay={200}>
          <Box className={styles.templateEmpty}>
            <Text align="center" size="sm" variant="muted">
              模板正在加载，稍后会自动显示。
            </Text>
          </Box>
        </ScrollReveal>
      )}
      <ScrollReveal variant="fadeUp" delay={300}>
        <Box className={styles.moreRow}>
          <PageButton variant="outline" onClick={onBrowseTemplates}>
            {c.templates.moreBtn}
          </PageButton>
        </Box>
      </ScrollReveal>
    </PageSection>
  );
}
