import styles from './CreationModesSection.module.css';
import { homePageContent as c } from './HomePage.content';
import {
  CardGrid,
  PageSection,
  ScrollReveal,
  SectionHeader,
  SurfaceCard,
} from 'ui/pages';

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
          <ScrollReveal
            key={item.title}
            variant="fadeUp"
            delay={i * 100}
            duration="slow"
          >
            <SurfaceCard
              badge={item.meta}
              className={styles.creationModeCard}
              color={item.color}
              description={item.desc}
              icon={item.icon}
              title={item.title}
            />
          </ScrollReveal>
        ))}
      </CardGrid>
    </PageSection>
  );
}
