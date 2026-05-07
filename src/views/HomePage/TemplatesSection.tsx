'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './HomePage.module.css';
import { useTemplates } from 'hooks/useTemplates';
import {
  CardGrid,
  PageButton,
  PageSection,
  SectionHeader,
} from 'ui/pages';
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
      <SectionHeader
        eyebrow={c.templates.eyebrow}
        title={c.templates.title}
        subtitle={c.templates.sub}
      />
      <CardGrid auto className={styles.templateGrid}>
        {templates.map(theme => (
          <div key={theme.id} className={styles.templateCardMotion}>
            <ThemeCard
              theme={theme}
              onClick={onTemplateSelect}
            />
          </div>
        ))}
      </CardGrid>
      {templates.length === 0 && (
        <div className={styles.templateEmpty}>
          模板正在加载，稍后会自动显示。
        </div>
      )}
      <div className={styles.moreRow}>
        <PageButton variant="outline" onClick={onBrowseTemplates}>
          {c.templates.moreBtn}
        </PageButton>
      </div>
    </PageSection>
  );
}
