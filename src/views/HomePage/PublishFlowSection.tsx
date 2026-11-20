import { homePageContent as c } from './HomePage.content';
import styles from './PublishFlowSection.module.css';
import { Box, Heading, Text } from 'ui/base';
import { PageSection, ScrollReveal, SectionHeader } from 'ui/pages';

export function PublishFlowSection() {
  return (
    <PageSection tone="muted" className={styles.publishFlowSection}>
      <ScrollReveal variant="fadeUp">
        <SectionHeader
          eyebrow={c.publishFlow.eyebrow}
          title={c.publishFlow.title}
          subtitle={c.publishFlow.sub}
        />
      </ScrollReveal>
      <Box className={styles.publishTimeline}>
        {c.publishFlow.items.map((item, index) => (
          <ScrollReveal key={item.title} variant="fadeUp" delay={index * 70}>
            <Box as="article" className={styles.publishStep}>
              <Box className={styles.publishStepIndex}>{String(index + 1).padStart(2, '0')}</Box>
              <Heading as="h3" size="xs" variant="primary" weight="bold">
                {item.title}
              </Heading>
              <Text size="sm" variant="muted">
                {item.desc}
              </Text>
            </Box>
          </ScrollReveal>
        ))}
      </Box>
    </PageSection>
  );
}
