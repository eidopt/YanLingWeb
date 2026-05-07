import { homePageContent as c } from './HomePage.content';
import styles from './HomePage.module.css';
import {
  CardGrid,
  PageSection,
  SectionHeader,
  SurfaceCard,
} from 'ui/pages';

export function CreationModesSection() {
  return (
    <PageSection tone="muted" className={styles.creationModesSection}>
      <SectionHeader
        eyebrow={c.creationModes.eyebrow}
        title={c.creationModes.title}
        subtitle={c.creationModes.sub}
      />
      <CardGrid columns={3}>
        {c.creationModes.items.map(item => (
          <SurfaceCard
            key={item.title}
            badge={item.meta}
            className={styles.creationModeCard}
            color={item.color}
            description={item.desc}
            icon={item.icon}
            title={item.title}
          />
        ))}
      </CardGrid>
    </PageSection>
  );
}
