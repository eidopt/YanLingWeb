'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './HomePage.module.css';
import {
  PageButton,
  PageSection,
  SectionHeader,
} from 'ui/pages';

interface ProductStudioSectionProps {
  onCtaClick: () => void;
}

export function ProductStudioSection({
  onCtaClick,
}: ProductStudioSectionProps) {
  return (
    <PageSection className={styles.productStudioSection}>
      <div className={styles.productStudioLayout}>
        <div className={styles.productStudioCopy}>
          <SectionHeader
            align="start"
            eyebrow={c.studio.eyebrow}
            title={c.studio.title}
            subtitle={c.studio.sub}
            className={styles.productStudioHeader}
          />
          <div className={styles.studioChecklist}>
            {c.studio.bullets.map(item => (
              <div key={item} className={styles.studioCheckItem}>
                <span className={styles.studioCheckIcon}>✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <PageButton onClick={onCtaClick} showArrow>
            {c.studio.cta}
          </PageButton>
        </div>

        <div className={styles.studioVisual} aria-hidden="true">
          <div className={styles.studioWindow}>
            <div className={styles.studioWindowBar}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.studioWorkspace}>
              <div className={styles.promptComposer}>
                <div className={styles.panelLabel}>{c.heroStudio.promptTitle}</div>
                <p>{c.heroStudio.prompt}</p>
                <div className={styles.promptChipRow}>
                  {c.heroStudio.chips.map(chip => (
                    <span key={chip}>{chip}</span>
                  ))}
                </div>
              </div>

              <div className={styles.liveCanvas}>
                <div className={styles.canvasToolbar}>
                  <strong>{c.heroStudio.canvasTitle}</strong>
                  <div>
                    {c.heroStudio.canvasPages.map(page => (
                      <span key={page}>{page}</span>
                    ))}
                  </div>
                </div>
                <div className={styles.canvasPreview}>
                  <div className={styles.canvasHeroBlock} />
                  <div className={styles.canvasCardRow}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className={styles.canvasTextLines}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>

              <div className={styles.editorRail}>
                <div className={styles.panelLabel}>{c.heroStudio.editorTitle}</div>
                {c.heroStudio.layers.map(layer => (
                  <div key={layer} className={styles.layerRow}>
                    <span />
                    {layer}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageSection>
  );
}
