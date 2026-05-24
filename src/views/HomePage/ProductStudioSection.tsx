'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './ProductStudioSection.module.css';
import {
  PageButton,
  PageSection,
  ScrollReveal,
  SectionHeader,
} from 'ui/pages';
import {
  Box,
  Text,
} from 'ui/system';

interface ProductStudioSectionProps {
  onCtaClick: () => void;
}

export function ProductStudioSection({
  onCtaClick,
}: ProductStudioSectionProps) {
  return (
    <PageSection className={styles.productStudioSection}>
      <Box className={styles.productStudioLayout}>
        <Box className={styles.productStudioCopy}>
          <ScrollReveal variant="fadeRight" duration="slow">
            <SectionHeader
              align="start"
              eyebrow={c.studio.eyebrow}
              title={c.studio.title}
              subtitle={c.studio.sub}
              className={styles.productStudioHeader}
            />
          </ScrollReveal>
          <ScrollReveal variant="fadeRight" delay={120} duration="slow">
            <Box className={styles.studioChecklist}>
              {c.studio.bullets.map((item) => (
                <Box key={item} className={styles.studioCheckItem}>
                  <Box as="span" className={styles.studioCheckIcon}>✓</Box>
                  <Text as="span" size="sm" variant="secondary">{item}</Text>
                </Box>
              ))}
            </Box>
          </ScrollReveal>
          <ScrollReveal variant="fadeRight" delay={240} duration="slow">
            <PageButton onClick={onCtaClick} showArrow>
              {c.studio.cta}
            </PageButton>
          </ScrollReveal>
        </Box>

        <ScrollReveal variant="fadeLeft" delay={100} duration="slow">
          <Box className={styles.studioVisual} aria-hidden="true">
          <Box className={styles.studioWindow}>
            <Box className={styles.studioWindowBar}>
              <Box as="span" />
              <Box as="span" />
              <Box as="span" />
            </Box>
            <Box className={styles.studioWorkspace}>
              <Box className={styles.promptComposer}>
                <Box className={styles.panelLabel}>{c.heroStudio.promptTitle}</Box>
                <Text>{c.heroStudio.prompt}</Text>
                <Box className={styles.promptChipRow}>
                  {c.heroStudio.chips.map(chip => (
                    <Box key={chip} as="span">{chip}</Box>
                  ))}
                </Box>
              </Box>

              <Box className={styles.liveCanvas}>
                <Box className={styles.canvasToolbar}>
                  <Text as="strong" size="sm" weight="bold">{c.heroStudio.canvasTitle}</Text>
                  <Box>
                    {c.heroStudio.canvasPages.map(page => (
                      <Box key={page} as="span">{page}</Box>
                    ))}
                  </Box>
                </Box>
                <Box className={styles.canvasPreview}>
                  <Box className={styles.canvasHeroBlock} />
                  <Box className={styles.canvasCardRow}>
                    <Box as="span" />
                    <Box as="span" />
                    <Box as="span" />
                  </Box>
                  <Box className={styles.canvasTextLines}>
                    <Box as="span" />
                    <Box as="span" />
                    <Box as="span" />
                  </Box>
                </Box>
              </Box>

              <Box className={styles.editorRail}>
                <Box className={styles.panelLabel}>{c.heroStudio.editorTitle}</Box>
                {c.heroStudio.layers.map(layer => (
                  <Box key={layer} className={styles.layerRow}>
                    <Box as="span" />
                    {layer}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
          </Box>
        </ScrollReveal>
      </Box>
    </PageSection>
  );
}
