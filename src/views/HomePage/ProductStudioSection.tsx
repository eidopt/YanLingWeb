'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './ProductStudioSection.module.css';
import { useState } from 'react';
import { Box, Heading, Text } from 'ui/base';
import { PageButton, PageSection, ScrollReveal, SectionHeader } from 'ui/pages';

interface ProductStudioSectionProps {
  onCtaClick: () => void;
}

export function ProductStudioSection({ onCtaClick }: ProductStudioSectionProps) {
  const [activeTabId, setActiveTabId] = useState<'prompt' | 'style' | 'responsive'>('prompt');
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [selectedSwatch, setSelectedSwatch] = useState('#3b5bff');
  const [selectedRadius, setSelectedRadius] = useState('14px');
  const [selectedDevice, setSelectedDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  const promptTab = c.studio.tabs[0];
  const styleTab = c.studio.tabs[1];
  const responsiveTab = c.studio.tabs[2];
  const activePrompt = promptTab.prompts[selectedPromptIndex] ?? promptTab.prompts[0];
  const activeDevice = responsiveTab.devices.find((d) => d.id === selectedDevice) ?? responsiveTab.devices[2];

  return (
    <PageSection className={styles.productStudioSection}>
      <ScrollReveal variant="fadeUp">
        <SectionHeader eyebrow={c.studio.eyebrow} title={c.studio.title} subtitle={c.studio.sub} />
      </ScrollReveal>

      <Box className={styles.showcaseShell}>
        <Box className={styles.tabBar} role="tablist" aria-label="核心功能演示">
          {c.studio.tabs.map((tab, idx) => {
            const active = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? styles.tabBtnActive : styles.tabBtn}
                onClick={() => setActiveTabId(tab.id)}
              >
                <Box as="span" className={styles.tabNum}>
                  0{idx + 1}
                </Box>
                <Box className={styles.tabCopy}>
                  <Text as="strong" size="sm" variant={active ? 'primary' : 'secondary'} weight="bold">
                    {tab.label}
                  </Text>
                </Box>
              </button>
            );
          })}
        </Box>

        <Box className={styles.showcaseGrid}>
          {/* Left Interactive Controls */}
          <Box className={styles.controlsCol}>
            {activeTabId === 'prompt' && (
              <Box className={styles.controlCard}>
                <Heading as="h3" size="sm" variant="primary" weight="bold">
                  {promptTab.title}
                </Heading>
                <Text size="sm" variant="muted">
                  {promptTab.desc}
                </Text>
                <Box className={styles.promptChoiceList}>
                  {promptTab.prompts.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      className={idx === selectedPromptIndex ? styles.choiceBtnActive : styles.choiceBtn}
                      onClick={() => setSelectedPromptIndex(idx)}
                    >
                      <Box as="span" className={styles.choiceDot} style={{ background: item.color }} />
                      <span>{item.label}</span>
                      <Box as="small">{item.badge}</Box>
                    </button>
                  ))}
                </Box>
              </Box>
            )}

            {activeTabId === 'style' && (
              <Box className={styles.controlCard}>
                <Heading as="h3" size="sm" variant="primary" weight="bold">
                  {styleTab.title}
                </Heading>
                <Text size="sm" variant="muted">
                  {styleTab.desc}
                </Text>

                <Box className={styles.controlGroup}>
                  <Text as="span" size="xs" variant="muted" weight="bold">
                    品牌主色调
                  </Text>
                  <Box className={styles.swatchRow}>
                    {styleTab.swatches.map((swatch) => (
                      <button
                        key={swatch.value}
                        type="button"
                        className={selectedSwatch === swatch.value ? styles.swatchBtnActive : styles.swatchBtn}
                        onClick={() => setSelectedSwatch(swatch.value)}
                      >
                        <Box as="i" style={{ background: swatch.value }} />
                        {swatch.label}
                      </button>
                    ))}
                  </Box>
                </Box>

                <Box className={styles.controlGroup}>
                  <Text as="span" size="xs" variant="muted" weight="bold">
                    组件圆角风格
                  </Text>
                  <Box className={styles.radiusRow}>
                    {styleTab.radii.map((radius) => (
                      <button
                        key={radius.value}
                        type="button"
                        className={selectedRadius === radius.value ? styles.radiusBtnActive : styles.radiusBtn}
                        onClick={() => setSelectedRadius(radius.value)}
                      >
                        {radius.label}
                      </button>
                    ))}
                  </Box>
                </Box>
              </Box>
            )}

            {activeTabId === 'responsive' && (
              <Box className={styles.controlCard}>
                <Heading as="h3" size="sm" variant="primary" weight="bold">
                  {responsiveTab.title}
                </Heading>
                <Text size="sm" variant="muted">
                  {responsiveTab.desc}
                </Text>

                <Box className={styles.deviceList}>
                  {responsiveTab.devices.map((device) => (
                    <button
                      key={device.id}
                      type="button"
                      className={selectedDevice === device.id ? styles.choiceBtnActive : styles.choiceBtn}
                      onClick={() => setSelectedDevice(device.id)}
                    >
                      <Box as="span" className={styles.choiceDot} style={{ background: 'var(--app-color-primary)' }} />
                      <span>{device.label}</span>
                      <Box as="small">{device.cols} 列网格</Box>
                    </button>
                  ))}
                </Box>
              </Box>
            )}

            <Box className={styles.showcaseCta}>
              <PageButton onClick={onCtaClick} showArrow>
                {c.studio.cta}
              </PageButton>
            </Box>
          </Box>

          {/* Right Live Interactive Preview Stage */}
          <Box className={styles.stageCol}>
            {activeTabId === 'prompt' && (
              <Box
                key={activePrompt.id}
                className={styles.liveCardDemo}
                style={{ '--demo-color': activePrompt.color } as React.CSSProperties}
              >
                <Box className={styles.demoHeroBand}>
                  <Box className={styles.demoTag}>{activePrompt.badge}</Box>
                  <Box className={styles.demoTitle}>{activePrompt.title}</Box>
                  <Box className={styles.demoDesc}>{activePrompt.desc}</Box>
                  <Box className={styles.demoActionBtn}>{activePrompt.cta}</Box>
                </Box>
                <Box className={styles.demoSubCards}>
                  {activePrompt.items.map((item) => (
                    <Box key={item} className={styles.demoSubCard}>
                      <Box className={styles.demoSubThumb} />
                      <Text as="strong" size="xs" variant="primary" weight="bold">
                        {item}
                      </Text>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {activeTabId === 'style' && (
              <Box
                className={styles.styleDemoCard}
                style={
                  {
                    '--style-color': selectedSwatch,
                    '--style-radius': selectedRadius,
                  } as React.CSSProperties
                }
              >
                <Box className={styles.styleDemoTop}>
                  <Box>
                    <Box className={styles.styleDemoBadge}>会员专享活动</Box>
                    <Box className={styles.styleDemoHeadline}>周末线下快闪体验日</Box>
                    <Box className={styles.styleDemoSub}>支持实时预览主题色与圆角变化效果</Box>
                  </Box>
                </Box>
                <Box className={styles.styleDemoChips}>
                  <Box as="span">即时生效</Box>
                  <Box as="span">对比度自适应</Box>
                  <Box as="span">一键同步全站</Box>
                </Box>
                <Box className={styles.styleDemoCta}>立即报名参加</Box>
              </Box>
            )}

            {activeTabId === 'responsive' && (
              <Box className={styles.responsiveStage}>
                <Box className={styles.responsiveFrame} data-device={selectedDevice}>
                  <Box className={styles.responsiveHeader}>
                    <Box as="span" className={styles.responsiveTitle}>
                      多端布局同步 · {activeDevice.label}
                    </Box>
                    <Box as="span" className={styles.responsiveBadge}>
                      {activeDevice.cols} 列
                    </Box>
                  </Box>
                  <Box
                    className={styles.responsiveGrid}
                    style={{ gridTemplateColumns: `repeat(${activeDevice.cols}, minmax(0, 1fr))` }}
                  >
                    {['核心看板', '订单趋势', '用户画像'].map((card) => (
                      <Box key={card} className={styles.responsiveCard}>
                        <Box className={styles.responsiveCardBar} />
                        <Text as="span" size="xs" variant="primary" weight="bold">
                          {card}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </PageSection>
  );
}
