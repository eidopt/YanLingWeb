'use client';

import { homePageContent as c } from './HomePage.content';
import styles from './HomePage.module.css';
import { cx } from 'base/classname';
import { PageButton } from 'ui/pages';

interface CtaBannerProps {
  onPrimaryClick: () => void;
  onSecondaryClick: () => void;
}

export function CtaBanner({
  onPrimaryClick,
  onSecondaryClick,
}: CtaBannerProps) {
  return (
    <section className={styles.ctaBanner}>
      <div className={styles.ctaOrb1} />
      <div className={styles.ctaOrb2} />
      <div className={styles.ctaInner}>
        <div className={cx(styles.eyebrow, styles.eyebrowLight)}>
          {c.cta.eyebrow}
        </div>
        <h2 className={styles.ctaTitle}>{c.cta.title}</h2>
        <p className={styles.ctaSub}>{c.cta.sub}</p>
        <div className={styles.ctaBtns}>
          <PageButton onClick={onPrimaryClick} showArrow>
            {c.cta.primary}
          </PageButton>
          <PageButton variant="ghostLight" onClick={onSecondaryClick}>
            {c.cta.secondary}
          </PageButton>
        </div>
      </div>
    </section>
  );
}
