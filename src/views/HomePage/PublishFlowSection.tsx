import { homePageContent as c } from './HomePage.content';
import styles from './PublishFlowSection.module.css';
import {
  PageSection,
  ScrollReveal,
  SectionHeader,
} from 'ui/pages';
import {
  Box,
  Heading,
  Text,
} from 'ui/base';

export function PublishFlowSection() {
  return (
    <PageSection tone="dark" className={styles.publishFlowSection}>
      <ScrollReveal variant="fadeUp">
        <SectionHeader
          eyebrow={c.publishFlow.eyebrow}
          title={c.publishFlow.title}
          subtitle={c.publishFlow.sub}
          inverted
        />
      </ScrollReveal>
      <Box className={styles.publishTimeline}>
        {c.publishFlow.items.map((item, index) => (
          <ScrollReveal
            key={item.title}
            variant="fadeUp"
            delay={index * 150}
            duration="slow"
          >
            <Box as="article" className={styles.publishStep}>
              <Box className={styles.publishStepIndex}>
                {String(index + 1).padStart(2, '0')}
              </Box>
              <Heading as="h3" size="xs" variant="inverse" weight="bold">
                {item.title}
              </Heading>
              <Text size="sm" variant="inverse-muted">{item.desc}</Text>
            </Box>
          </ScrollReveal>
        ))}
      </Box>
    </PageSection>
  );
}
