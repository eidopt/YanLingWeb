import styles from './PageComponents.module.css';
import { cx } from 'base/classname';
import type { CSSProperties, ReactNode } from 'react';

export interface PageRootProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function PageRoot({ children, className, style }: PageRootProps) {
  return (
    <div className={cx(styles.root, className)} style={style}>
      {children}
    </div>
  );
}

export interface PageSectionProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  tone?: 'default' | 'muted' | 'dark';
}

export function PageSection({
  children,
  className,
  innerClassName,
  tone = 'default',
}: PageSectionProps) {
  return (
    <section
      className={cx(
        styles.section,
        tone === 'muted' && styles.sectionMuted,
        tone === 'dark' && styles.sectionDark,
        className,
      )}
    >
      <div className={cx(styles.inner, innerClassName)}>{children}</div>
    </section>
  );
}

export interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: 'center' | 'start';
  inverted?: boolean;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  inverted = false,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cx(
        styles.sectionHeader,
        align === 'start' && styles.sectionHeaderAlignStart,
        className,
      )}
    >
      <div className={cx(styles.eyebrow, inverted && styles.eyebrowInverted)}>
        {eyebrow}
      </div>
      <h2 className={cx(styles.title, inverted && styles.titleInverted)}>
        {title}
      </h2>
      {subtitle && (
        <p className={cx(styles.subtitle, inverted && styles.subtitleInverted)}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
