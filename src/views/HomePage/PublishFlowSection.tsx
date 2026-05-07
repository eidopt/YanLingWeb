import { homePageContent as c } from './HomePage.content';
import styles from './HomePage.module.css';
import {
  PageSection,
  SectionHeader,
} from 'ui/pages';

export function PublishFlowSection() {
  return (
    <PageSection tone="dark" className={styles.publishFlowSection}>
      <SectionHeader
        eyebrow={c.publishFlow.eyebrow}
        title={c.publishFlow.title}
        subtitle={c.publishFlow.sub}
        inverted
      />
      <div className={styles.publishTimeline}>
        {c.publishFlow.items.map((item, index) => (
          <article key={item.title} className={styles.publishStep}>
            <div className={styles.publishStepIndex}>
              {String(index + 1).padStart(2, '0')}
            </div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </article>
        ))}
      </div>
    </PageSection>
  );
}
