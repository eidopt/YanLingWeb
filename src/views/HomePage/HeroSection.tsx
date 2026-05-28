'use client';

import styles from './HeroSection.module.css';
import { homePageContent as c } from './HomePage.content';
import { useCallback } from 'react';
import {
  Box,
  Heading,
  Text,
} from 'ui/base';
import { PageButton } from 'ui/pages';

interface HeroSectionProps {
  onCtaPrimary: () => void;
  onCtaSecondary: () => void;
}

export function HeroSection({
  onCtaPrimary,
  onCtaSecondary,
}: HeroSectionProps) {
  const scrollToNext = useCallback(() => {
    const next = document.querySelector('[data-section="stats"]');
    if (next) {
      next.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  return (
    <Box as="section" className={styles.hero}>
      <Box className={styles.heroMesh} />
      {/* Floating glow particles */}
      <Box className="hero-glow-container" aria-hidden="true">
        <Box className="hero-glow-orb" />
        <Box className="hero-glow-orb" />
        <Box className="hero-glow-orb" />
      </Box>

      <Box className={styles.heroInner}>
        <Box className={styles.heroEyebrow}>
          <Box as="span" className={styles.eyebrowDot} />
          {c.hero.eyebrow}
        </Box>
        <Heading
          as="h1"
          flow="stack"
          size="showcase"
          spacing="hero"
          variant="primary"
          weight="heavy"
        >
          {c.hero.titleWords.map((word, i) => (
            // eslint-disable-next-line react/no-array-index-key -- static content, no stable key available
            <Box key={i} as="span" className={styles.heroTitleLine}>{word}</Box>
          ))}
        </Heading>
        <Box className={styles.heroSub}>
          <Text size="lead" variant="secondary">{c.hero.sub}</Text>
        </Box>
        <Box className={styles.heroBtns}>
          <PageButton onClick={onCtaPrimary} showArrow>
            {c.hero.ctaPrimary}
          </PageButton>
          <PageButton variant="outline" onClick={onCtaSecondary}>
            {c.hero.ctaSecondary}
          </PageButton>
        </Box>
        <Box className={styles.heroHint}>
          <Text size="xs" variant="muted">{c.hero.hint}</Text>
        </Box>
      </Box>

      <Box className={styles.heroMockup}>
        <Box className={styles.heroEditorMock} aria-hidden="true">
          <Box className={styles.heroEditorTopbar}>
            <Box className={styles.heroEditorDots}>
              <Box as="span" />
              <Box as="span" />
              <Box as="span" />
            </Box>
            <Text as="strong" size="sm" weight="bold">{c.heroStudio.canvasTitle}</Text>
            <Box className={styles.heroEditorMode}>
              <Box as="span">编辑</Box>
              <Box as="span">预览</Box>
            </Box>
          </Box>

          <Box className={styles.heroEditorWorkspace}>
            <Box as="aside" className={styles.heroEditorLibrary}>
              <Box className={styles.heroPanelTitle}>
                {c.heroStudio.sidebarTitle}
              </Box>
              {c.heroStudio.sidebarItems.map(item => (
                <Box key={item} className={styles.heroLibraryCard}>
                  <Box as="span" />
                  <Text as="strong" size="xs" weight="bold">{item}</Text>
                </Box>
              ))}
            </Box>

            <Box as="section" className={styles.heroEditorCenter}>
              <Box className={styles.heroEditorToolbar}>
                <Box as="span">清空</Box>
                <Box className={styles.heroPageName}>首页</Box>
                <Box className={styles.heroDeviceSwitch}>
                  <Box as="span" />
                  <Box as="span" />
                </Box>
              </Box>

              <Box className={styles.heroCanvasStage}>
                <Box className={styles.heroCanvasFrame}>
                  <Box className={styles.heroGeneratedPage}>
                    <Box className={styles.heroGeneratedBlock}>
                      <Box as="span" />
                      <Box as="span" />
                    </Box>
                    <Box className={styles.heroGeneratedCards}>
                      <Box as="span" />
                      <Box as="span" />
                      <Box as="span" />
                    </Box>
                    <Box className={styles.heroGeneratedCta}>
                      <Box as="span" />
                      <Text as="strong" />
                    </Box>
                  </Box>
                  <Box className={styles.heroDraggedComponent}>
                    <Box as="span" />
                    <Text as="strong" size="xs" weight="bold">预约表单</Text>
                  </Box>
                  <Box className={styles.heroEditCursor}>AI</Box>
                  <Box className={styles.heroDropIndicator} />
                </Box>
              </Box>

              <Box className={styles.heroCanvasPager}>
                <Box as="span" />
                <Box>
                  <Box as="span" />
                  <Box as="span" />
                  <Box as="span" />
                </Box>
                <Text as="strong" weight="bold">+</Text>
              </Box>
            </Box>

            <Box as="aside" className={styles.heroEditorInspector}>
              <Box className={styles.heroPanelTitle}>
                {c.heroStudio.editorTitle}
              </Box>
              {c.heroStudio.inspectorItems.slice(0, 2).map(item => (
                <Box key={item.label} className={styles.heroInspectorField}>
                  <Box as="span">{item.label}</Box>
                  <Text as="strong" size="xs" weight="bold">{item.value}</Text>
                </Box>
              ))}
              <Box className={styles.heroEditorChat}>
                <Box className={styles.heroChatHeader}>
                  <Box as="span">✦</Box>
                  {c.heroStudio.promptTitle}
                </Box>
                <Box className={styles.heroChatBubble}>
                  <Text>{c.heroStudio.prompt}</Text>
                </Box>
                <Box className={styles.heroChatInput}>
                  <Box as="span" />
                  <Box className={styles.heroTypingDots}>
                    <Box as="span" />
                    <Box as="span" />
                    <Box as="span" />
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
        <Box className={styles.heroStatusDock} aria-hidden="true">
          {c.heroStudio.statusItems.map(item => (
            <Box
              key={item.label}
              className={styles.heroStatusItem}
            >
              <Box as="span" />
              <Box>
                <Text as="strong" size="xs" weight="bold">{item.label}</Text>
                <Text as="small" size="xs" variant="muted">{item.value}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Scroll indicator */}
      <Box
        aria-hidden="true"
        className="scroll-indicator"
        onClick={scrollToNext}
        role="button"
        tabIndex={-1}
      >
        <Box className="scroll-indicator-line" />
        <Box className="scroll-indicator-dot" />
      </Box>
    </Box>
  );
}
