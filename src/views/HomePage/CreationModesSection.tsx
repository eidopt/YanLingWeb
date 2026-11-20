import styles from './CreationModesSection.module.css';
import { homePageContent as c } from './HomePage.content';
import { LayersEditIcon, LayoutGridIcon, PromptCommandIcon } from 'ui/icons';
import { CardGrid, PageSection, ScrollReveal, SectionHeader, SurfaceCard } from 'ui/pages';

function renderCreationIcon(iconKey: string) {
  if (iconKey === 'templates') {
    return <LayoutGridIcon />;
  }
  if (iconKey === 'prompt') {
    return <PromptCommandIcon />;
  }
  return <LayersEditIcon />;
}

export function CreationModesSection() {
  return (
    <PageSection tone="muted" className={styles.creationModesSection}>
      <ScrollReveal variant="fadeUp">
        <SectionHeader
          eyebrow={c.creationModes.eyebrow}
          title={c.creationModes.title}
          subtitle={c.creationModes.sub}
        />
      </ScrollReveal>
      <CardGrid columns={3}>
        {c.creationModes.items.map((item, i) => (
          <ScrollReveal key={item.title} variant="fadeUp" delay={i * 70}>
            <SurfaceCard
              badge={item.meta}
              color={item.color}
              className={styles.creationModeCard}
              description={item.desc}
              icon={renderCreationIcon(item.iconKey)}
              title={item.title}
            />
          </ScrollReveal>
        ))}
      </CardGrid>
    </PageSection>
  );
}
