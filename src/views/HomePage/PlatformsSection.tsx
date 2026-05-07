import { homePageContent as c } from './HomePage.content';
import {
  CardGrid,
  PageSection,
  SectionHeader,
  SurfaceCard,
} from 'ui/pages';

export function PlatformsSection() {
  return (
    <PageSection tone="dark">
      <SectionHeader
        eyebrow={c.platforms.eyebrow}
        title={c.platforms.title}
        subtitle={c.platforms.sub}
        inverted
      />
      <CardGrid>
        {c.platforms.items.map(p => (
          <SurfaceCard
            key={p.title}
            badge={p.badge}
            color={p.color}
            description={p.desc}
            icon={p.icon}
            inverted
            tags={p.tags}
            title={p.title}
            tone="dark"
          />
        ))}
      </CardGrid>
    </PageSection>
  );
}
