import { homePageContent as c } from './HomePage.content';
import {
  CardGrid,
  PageSection,
  ScrollReveal,
  SectionHeader,
  SurfaceCard,
} from 'ui/pages';

export function PlatformsSection() {
  return (
    <PageSection tone="dark">
      <ScrollReveal variant="fadeUp">
        <SectionHeader
          eyebrow={c.platforms.eyebrow}
          title={c.platforms.title}
          subtitle={c.platforms.sub}
          inverted
        />
      </ScrollReveal>
      <CardGrid>
        {c.platforms.items.map((p, i) => (
          <ScrollReveal
            key={p.title}
            variant="scaleIn"
            delay={i * 120}
            duration="slow"
          >
            <SurfaceCard
              badge={p.badge}
              color={p.color}
              description={p.desc}
              icon={p.icon}
              inverted
              tags={p.tags}
              title={p.title}
              tone="dark"
            />
          </ScrollReveal>
        ))}
      </CardGrid>
    </PageSection>
  );
}
