'use client';

import styles from './HeroSection.module.css';
import { homePageContent as c } from './HomePage.content';
import { useEffect, useState } from 'react';
import { Box, Heading, Text } from 'ui/base';
import { PageButton } from 'ui/pages';

interface HeroSectionProps {
  onCtaPrimary: () => void;
  onCtaSecondary: () => void;
}

export function HeroSection({ onCtaPrimary, onCtaSecondary }: HeroSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    if (!autoPlay) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % c.heroScenarios.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [autoPlay]);

  const scenario = c.heroScenarios[activeIndex] ?? c.heroScenarios[0];

  const handleSelectScenario = (index: number) => {
    setAutoPlay(false);
    setActiveIndex(index);
  };

  return (
    <Box as="section" className={styles.hero}>
      <Box className={styles.heroBackdrop} aria-hidden="true" />
      <Box className={styles.heroContainer}>
        <Box className={styles.heroInner}>
          <Box className={styles.heroEyebrow}>
            <Box as="span" className={styles.eyebrowPulse} aria-hidden="true" />
            {c.hero.eyebrow}
          </Box>
          <Heading as="h1" flow="stack" size="showcase" spacing="hero" variant="primary" weight="heavy">
            <Box as="span" className={styles.heroTitleLine}>
              {c.hero.titleLine1}
            </Box>
            <Box as="span" className={styles.heroTitleHighlight}>
              {c.hero.titleHighlight}
            </Box>
          </Heading>
          <Box className={styles.heroSub}>
            <Text size="lead" variant="secondary">
              {c.hero.sub}
            </Text>
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
            <Text size="xs" variant="muted">
              {c.hero.hint}
            </Text>
          </Box>
        </Box>

        <Box className={styles.heroMockup}>
          <Box
            className={styles.heroEditorMock}
            style={{ '--scenario-accent': scenario.accent } as React.CSSProperties}
          >
            <Box className={styles.heroEditorTopbar}>
              <Box className={styles.heroEditorDots} aria-hidden="true">
                <Box as="span" />
                <Box as="span" />
                <Box as="span" />
              </Box>
              <Box className={styles.scenarioTabs} role="tablist" aria-label="场景预览切换">
                {c.heroScenarios.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeIndex}
                    className={idx === activeIndex ? styles.scenarioTabActive : styles.scenarioTab}
                    onClick={() => handleSelectScenario(idx)}
                  >
                    {item.tabLabel}
                  </button>
                ))}
              </Box>
              <Box className={styles.heroLivePill} aria-hidden="true">
                <Box as="span" className={styles.heroLiveDot} />
                实时生成
              </Box>
            </Box>

            <Box className={styles.heroEditorWorkspace}>
              <Box as="aside" className={styles.heroEditorLibrary} aria-hidden="true">
                <Box className={styles.heroPanelTitle}>组件库</Box>
                <Box className={styles.heroLibraryList}>
                  {['导航栏', '头图横幅', '课程卡片', '预约表单', '底栏导航'].map((item, idx) => (
                    <Box key={item} className={styles.heroLibraryItem} data-active={idx === 1 ? 'true' : undefined}>
                      <Box as="span" className={styles.heroLibraryDot} />
                      <Text as="span" size="xs" variant="secondary">
                        {item}
                      </Text>
                    </Box>
                  ))}
                </Box>
                <Box className={styles.heroStatusChip}>{scenario.statusBadge}</Box>
              </Box>

              <Box as="section" className={styles.heroEditorCenter} aria-hidden="true">
                <Box key={scenario.id} className={styles.heroPhoneFrame}>
                  <Box className={styles.heroPhoneTopbar}>
                    <Box as="span">9:41</Box>
                    <Box as="span" className={styles.heroPhonePill} />
                  </Box>
                  <Box className={styles.heroPhoneBanner} style={{ background: scenario.bannerBg }}>
                    <Box className={styles.heroPhoneTag}>{scenario.tag}</Box>
                    <Box className={styles.heroPhoneHeadline}>{scenario.headline}</Box>
                    <Box className={styles.heroPhoneSub}>{scenario.sub}</Box>
                    <Box className={styles.heroPhoneBtn}>{scenario.cta}</Box>
                  </Box>
                  <Box className={styles.heroPhoneSectionLabel}>{scenario.canvasTitle}</Box>
                  <Box className={styles.heroPhoneCards}>
                    {scenario.cards.map((card, cardIdx) => (
                      <Box
                        key={card}
                        className={styles.heroPhoneCard}
                        style={{ animationDelay: `${cardIdx * 70}ms` }}
                      >
                        <Box
                          className={styles.heroPhoneThumb}
                          style={{
                            background: [
                              `color-mix(in srgb, ${scenario.accent}`,
                              `${14 + cardIdx * 8}%, var(--app-surface-2))`,
                            ].join(' '),
                          }}
                        />
                        <Box className={styles.heroPhoneCardTitle}>{card}</Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>

              <Box as="aside" className={styles.heroEditorInspector} aria-hidden="true">
                <Box className={styles.heroPanelTitle}>属性面板</Box>
                <Box className={styles.heroInspectorField}>
                  <Box as="span">主题色</Box>
                  <Box className={styles.colorTag}>
                    <Box as="i" style={{ background: scenario.accent }} />
                    {scenario.inspectorColor}
                  </Box>
                </Box>
                <Box className={styles.heroInspectorField}>
                  <Box as="span">圆角</Box>
                  <Text as="strong" size="xs" variant="primary" weight="bold">
                    {scenario.inspectorRadius}
                  </Text>
                </Box>
                <Box key={scenario.id} className={styles.heroEditorChat}>
                  <Box className={styles.heroChatHeader}>AI 指令</Box>
                  <Box className={styles.heroChatBubble}>
                    <Text size="xs" variant="primary">
                      {scenario.prompt}
                    </Text>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
