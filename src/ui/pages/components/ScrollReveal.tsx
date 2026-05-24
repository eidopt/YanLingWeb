'use client';

import {
  type AnimationVariant,
  getStaggerDelay,
  useScrollAnimation,
} from 'hooks/useScrollAnimation';
import {
  Children,
  isValidElement,
  type ReactNode,
} from 'react';
import { Box } from 'ui/system';

export interface ScrollRevealProps {
  children: ReactNode;
  /** Animation variant */
  variant?: AnimationVariant;
  /** Delay in ms */
  delay?: number;
  /** Animation duration */
  duration?: 'fast' | 'base' | 'slow';
  /** Whether to wrap in a Box - set false if children already provides the refable element */
  wrap?: boolean;
  className?: string;
}

/**
 * Wraps children in a scroll-triggered reveal animation.
 * Children become visible with animation when they enter the viewport.
 */
export function ScrollReveal({
  children,
  variant = 'fadeUp',
  delay = 0,
  duration = 'base',
  wrap = true,
  className,
}: ScrollRevealProps) {
  const { ref, className: animClass, style } = useScrollAnimation({
    variant,
    delay,
    duration,
  });

  if (!wrap) {
    return <>{children}</>;
  }

  return (
    <Box ref={ref} className={`${animClass}${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </Box>
  );
}

export interface StaggerChildrenProps {
  children: ReactNode;
  /** Animation variant for each child */
  variant?: AnimationVariant;
  /** Base delay between children in ms */
  staggerDelay?: number;
  /** Maximum delay cap */
  maxDelay?: number;
  /** Animation duration */
  duration?: 'fast' | 'base' | 'slow';
  className?: string;
}

/**
 * Wraps children and applies staggered scroll-reveal animations.
 * Render prop pattern — pass a function as child to get animated wrappers.
 *
 * Usage:
 * <StaggerChildren>
 *   {items.map((item, i) => (
 *     <div key={i}>{item}</div>
 *   ))}
 * </StaggerChildren>
 */
export function StaggerChildren({
  children,
  variant = 'fadeUp',
  staggerDelay = 80,
  maxDelay = 600,
  duration = 'base',
  className,
}: StaggerChildrenProps) {
  const childArray = Children.toArray(children);

  if (childArray.length <= 1) {
    return (
      <ScrollReveal variant={variant} duration={duration} className={className}>
        {children}
      </ScrollReveal>
    );
  }

  return (
    <>
      {childArray.map((child, index) => {
        const delay = getStaggerDelay(index, staggerDelay, maxDelay);
        const key = isValidElement(child) && child.key !== null
          ? child.key
          : typeof child === 'string' || typeof child === 'number'
            ? `text-${String(child)}`
            : 'stagger-child';
        return (
          <ScrollReveal
            key={key}
            variant={variant}
            delay={delay}
            duration={duration}
          >
            {child}
          </ScrollReveal>
        );
      })}
    </>
  );
}

export type { AnimationVariant };
