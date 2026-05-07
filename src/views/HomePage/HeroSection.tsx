'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './HomePage.module.css';
import { PageButton } from 'ui/pages';

interface HeroSectionProps {
  onCtaPrimary: () => void;
  onCtaSecondary: () => void;
}

export function HeroSection({
  onCtaPrimary,
  onCtaSecondary,
}: HeroSectionProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroMesh} />
      <div className={styles.heroOrb1} />
      <div className={styles.heroOrb2} />
      <div className={styles.heroOrb3} />

      <div className={styles.heroInner}>
        <div className={styles.heroEyebrow}>
          <span className={styles.eyebrowDot} />
          {c.hero.eyebrow}
        </div>
        <h1 className={styles.heroTitle}>
          {c.hero.titleWords.map((word, i) => (
            // eslint-disable-next-line react/no-array-index-key -- static content, no stable key available
            <span key={i} className={styles.heroTitleLine}>{word}</span>
          ))}
        </h1>
        <p className={styles.heroSub}>{c.hero.sub}</p>
        <div className={styles.heroBtns}>
          <PageButton onClick={onCtaPrimary} showArrow>
            {c.hero.ctaPrimary}
          </PageButton>
          <PageButton variant="ghost" onClick={onCtaSecondary}>
            {c.hero.ctaSecondary}
          </PageButton>
        </div>
        <p className={styles.heroHint}>{c.hero.hint}</p>
      </div>

      <div className={styles.heroMockup}>
        <div className={styles.heroEditorMock} aria-hidden="true">
          <div className={styles.heroEditorTopbar}>
            <div className={styles.heroEditorDots}>
              <span />
              <span />
              <span />
            </div>
            <strong>{c.heroStudio.canvasTitle}</strong>
            <div className={styles.heroEditorMode}>
              <span>编辑</span>
              <span>预览</span>
            </div>
          </div>

          <div className={styles.heroEditorWorkspace}>
            <aside className={styles.heroEditorLibrary}>
              <div className={styles.heroPanelTitle}>
                {c.heroStudio.sidebarTitle}
              </div>
              {c.heroStudio.sidebarItems.map(item => (
                <div key={item} className={styles.heroLibraryCard}>
                  <span />
                  <strong>{item}</strong>
                </div>
              ))}
            </aside>

            <section className={styles.heroEditorCenter}>
              <div className={styles.heroEditorToolbar}>
                <span>清空</span>
                <div className={styles.heroPageName}>首页</div>
                <div className={styles.heroDeviceSwitch}>
                  <span />
                  <span />
                </div>
              </div>

              <div className={styles.heroCanvasStage}>
                <div className={styles.heroCanvasFrame}>
                  <div className={styles.heroGeneratedPage}>
                    <div className={styles.heroGeneratedBlock}>
                      <span />
                      <span />
                    </div>
                    <div className={styles.heroGeneratedCards}>
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className={styles.heroGeneratedCta}>
                      <span />
                      <strong />
                    </div>
                  </div>
                  <div className={styles.heroDraggedComponent}>
                    <span />
                    <strong>预约表单</strong>
                  </div>
                  <div className={styles.heroEditCursor}>AI</div>
                  <div className={styles.heroDropIndicator} />
                </div>
              </div>

              <div className={styles.heroCanvasPager}>
                <span />
                <div>
                  <span />
                  <span />
                  <span />
                </div>
                <strong>+</strong>
              </div>
            </section>

            <aside className={styles.heroEditorInspector}>
              <div className={styles.heroPanelTitle}>
                {c.heroStudio.editorTitle}
              </div>
              {c.heroStudio.inspectorItems.slice(0, 2).map(item => (
                <div key={item.label} className={styles.heroInspectorField}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
              <div className={styles.heroEditorChat}>
                <div className={styles.heroChatHeader}>
                  <span>✦</span>
                  {c.heroStudio.promptTitle}
                </div>
                <div className={styles.heroChatBubble}>
                  <p>{c.heroStudio.prompt}</p>
                </div>
                <div className={styles.heroChatInput}>
                  <span />
                  <div className={styles.heroTypingDots}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
        <div className={styles.heroStatusDock} aria-hidden="true">
          {c.heroStudio.statusItems.map(item => (
            <div
              key={item.label}
              className={styles.heroStatusItem}
            >
              <span />
              <div>
                <strong>{item.label}</strong>
                <small>{item.value}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
