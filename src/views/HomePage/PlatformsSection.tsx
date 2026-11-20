import { homePageContent as c } from './HomePage.content';
import { DesktopFrameIcon, MiniProgramIcon, MobileIcon, WebIcon } from 'ui/icons';
import { CardGrid, PageSection, ScrollReveal, SectionHeader, SurfaceCard } from 'ui/pages';

function renderPlatformIcon(iconKey: string) {
  if (iconKey === 'web') {
    return <WebIcon />;
  }
  if (iconKey === 'wechat') {
    return <MiniProgramIcon />;
  }
  if (iconKey === 'mobile') {
    return <MobileIcon />;
  }
  return <DesktopFrameIcon />;
}

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
          <ScrollReveal key={p.title} variant="fadeUp" delay={i * 70}>
            <SurfaceCard
              badge={p.badge}
              color={p.color}
              description={p.desc}
              icon={renderPlatformIcon(p.iconKey)}
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
