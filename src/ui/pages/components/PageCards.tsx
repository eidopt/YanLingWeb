import styles from './PageComponents.module.css';
import { cx } from 'base/classname';
import type { CSSProperties, ReactNode } from 'react';

interface WithClassName {
  className?: string;
}

export interface MetricItem {
  label: string;
  value: string;
}

export function MetricStrip({
  items,
  className,
}: { items: readonly MetricItem[] } & WithClassName) {
  return (
    <div className={cx(styles.metricStrip, className)}>
      {items.map((item, index) => (
        <div key={item.label} className={styles.metricItem}>
          {index > 0 && <div className={styles.metricDivider} />}
          <div>
            <strong className={styles.metricValue}>{item.value}</strong>
            <span className={styles.metricLabel}>{item.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface CardGridProps extends WithClassName {
  auto?: boolean;
  children: ReactNode;
  columns?: number;
  minWidth?: string;
}

export function CardGrid({
  auto = false,
  children,
  className,
  columns = 4,
  minWidth = '260px',
}: CardGridProps) {
  return (
    <div
      className={cx(styles.cardGrid, auto && styles.autoGrid, className)}
      style={{
        '--page-grid-columns': columns,
        '--page-grid-min': minWidth,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}

export interface SurfaceCardProps extends WithClassName {
  badge?: string;
  children?: ReactNode;
  color?: string;
  description?: string;
  icon?: ReactNode;
  inverted?: boolean;
  tags?: readonly string[];
  title: string;
  tone?: 'light' | 'soft' | 'dark';
}

export function SurfaceCard({
  badge,
  children,
  className,
  color,
  description,
  icon,
  inverted = false,
  tags,
  title,
  tone = 'light',
}: SurfaceCardProps) {
  return (
    <div
      className={cx(
        styles.surfaceCard,
        tone === 'light' && styles.surfaceCardLight,
        tone === 'soft' && styles.surfaceCardSoft,
        tone === 'dark' && styles.surfaceCardDark,
        className,
      )}
      style={{ '--card-color': color } as CSSProperties}
    >
      {(icon ?? badge) && (
        <div className={styles.cardTop}>
          {icon && <div className={styles.cardIcon}>{icon}</div>}
          {badge && <span className={styles.cardTag}>{badge}</span>}
        </div>
      )}
      <h3 className={cx(styles.cardTitle, inverted && styles.cardTitleInverted)}>
        {title}
      </h3>
      {description && (
        <p className={cx(styles.cardDescription, inverted && styles.cardDescriptionInverted)}>
          {description}
        </p>
      )}
      {tags && tags.length > 0 && (
        <div className={styles.tagList}>
          {tags.map((tag) => (
            <span key={tag} className={styles.pill}>{tag}</span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

export interface ProcessStepCardProps extends WithClassName {
  description: string;
  icon: ReactNode;
  number: string;
  showArrow?: boolean;
  title: string;
}

export function ProcessStepCard({
  className,
  description,
  icon,
  number,
  showArrow = false,
  title,
}: ProcessStepCardProps) {
  return (
    <div
      className={cx(
        styles.surfaceCard,
        styles.surfaceCardLight,
        styles.processCard,
        className,
      )}
    >
      <div className={styles.processNumber}>{number}</div>
      {showArrow && (
        <div className={styles.processArrow} aria-hidden="true">›</div>
      )}
      <div className={styles.cardIcon}>{icon}</div>
      <h3 className={styles.cardTitle}>{title}</h3>
      <p className={styles.cardDescription}>{description}</p>
    </div>
  );
}
