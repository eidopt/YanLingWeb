import styles from './PageComponents.module.css';
import { cx } from 'base/classname';
import type { CSSProperties, ReactNode } from 'react';
import {
  Box,
  Heading,
  Inline,
  Stack,
  Text,
} from 'ui/system';

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
    <Inline
      as="section"
      className={cx(styles.metricStrip, className)}
      gap="0"
      justify="center"
    >
      {items.map((item, index) => (
        <Inline key={item.label} className={styles.metricItem} gap="0">
          {index > 0 && <Box className={styles.metricDivider} />}
          <Stack gap="xs">
            <Text
              as="strong"
              size="2xl"
              tracking="normal"
              variant="brand-gradient"
              weight="heavy"
            >
              {item.value}
            </Text>
            <Text as="span" size="xs" variant="faint" weight="medium">
              {item.label}
            </Text>
          </Stack>
        </Inline>
      ))}
    </Inline>
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
  minWidth = 'var(--app-unit-32)',
}: CardGridProps) {
  return (
    <Box
      className={cx(styles.cardGrid, auto && styles.autoGrid, className)}
      style={{
        '--page-grid-columns': columns,
        '--page-grid-min': minWidth,
      } as CSSProperties}
    >
      {children}
    </Box>
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
    <Stack
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
        <Inline className={styles.cardTop} justify="space-between">
          {icon && <Box className={styles.cardIcon}>{icon}</Box>}
          {badge && (
            <Box as="span" className={styles.cardTag}>
              <Text
                as="span"
                size="xs"
                variant={inverted ? 'inverse' : 'accent'}
                weight="bold"
              >
                {badge}
              </Text>
            </Box>
          )}
        </Inline>
      )}
      <Heading
        as="h3"
        size="xs"
        variant={inverted ? 'inverse' : 'primary'}
        weight="bold"
      >
        {title}
      </Heading>
      {description && (
        <Text
          size="sm"
          variant={inverted ? 'inverse-muted' : 'muted'}
        >
          {description}
        </Text>
      )}
      {tags && tags.length > 0 && (
        <Inline className={styles.tagList} gap="u0-7">
          {tags.map((tag) => (
            <Box key={tag} as="span" className={styles.pill}>
              <Text
                as="span"
                size="xs"
                variant={inverted ? 'inverse-faint' : 'muted'}
              >
                {tag}
              </Text>
            </Box>
          ))}
        </Inline>
      )}
      {children}
    </Stack>
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
    <Stack
      className={cx(
        styles.surfaceCard,
        styles.surfaceCardLight,
        styles.processCard,
        className,
      )}
    >
      <Text as="span" size="3xl" variant="accent-faint" weight="heavy">{number}</Text>
      {showArrow && (
        <Box className={styles.processArrow} aria-hidden="true">›</Box>
      )}
      <Box className={styles.cardIcon}>{icon}</Box>
      <Heading as="h3" size="xs" variant="primary" weight="bold">{title}</Heading>
      <Text size="sm" variant="muted">{description}</Text>
    </Stack>
  );
}
