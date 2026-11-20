import styles from './PageComponents.module.css';
import { cx } from 'base/classname';
import type { CSSProperties, ReactNode } from 'react';
import { Box, Container, Heading, Stack, Text } from 'ui/base';

export interface PageRootProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function PageRoot({ children, className, style }: PageRootProps) {
  return (
    <Box className={cx(styles.root, className)} style={style}>
      {children}
    </Box>
  );
}

export interface PageSectionProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  tone?: 'default' | 'muted' | 'dark';
}

export function PageSection({ children, className, innerClassName, tone = 'default' }: PageSectionProps) {
  return (
    <Box
      as="section"
      className={cx(
        styles.section,
        tone === 'muted' && styles.sectionMuted,
        tone === 'dark' && styles.sectionDark,
        className,
      )}
    >
      <Container className={cx(styles.inner, innerClassName)} gutters={false} max="lg">
        {children}
      </Container>
    </Box>
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
    <Stack
      className={cx(styles.sectionHeader, align === 'start' && styles.sectionHeaderAlignStart, className)}
      gap="sm"
    >
      <Text
        as="span"
        size="xs"
        tracking="wide"
        variant={inverted ? 'inverse-faint' : 'accent'}
        weight="bold"
      >
        {eyebrow}
      </Text>
      <Heading size="hero" variant={inverted ? 'inverse' : 'primary'} weight="heavy">
        {title}
      </Heading>
      {subtitle && (
        <Text size="base" variant={inverted ? 'inverse-muted' : 'muted'}>
          {subtitle}
        </Text>
      )}
    </Stack>
  );
}
