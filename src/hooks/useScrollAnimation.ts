'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export type AnimationVariant =
  | 'fadeUp'
  | 'fadeDown'
  | 'fadeLeft'
  | 'fadeRight'
  | 'fadeIn'
  | 'scaleIn'
  | 'scaleUp'
  | 'none';

export interface UseScrollAnimationOptions {
  /** Animation variant */
  variant?: AnimationVariant;
  /** Threshold for intersection (0-1) */
  threshold?: number;
  /** Root margin for earlier/later triggering */
  rootMargin?: string;
  /** Whether to only trigger once */
  once?: boolean;
  /** Delay in ms before animation starts */
  delay?: number;
  /** Whether to enable */
  enabled?: boolean;
  /** Animation duration class (matches app motion tokens) */
  duration?: 'fast' | 'base' | 'slow';
}

export interface ScrollAnimationResult {
  /** Ref to attach to the target element */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Whether the element is currently visible */
  isVisible: boolean;
  /** Whether the animation has been triggered at least once */
  hasAnimated: boolean;
  /** CSS className to apply */
  className: string;
  /** Inline style object */
  style: React.CSSProperties;
}

const variantClassMap: Record<AnimationVariant, string> = {
  fadeUp: 'sa-fade-up',
  fadeDown: 'sa-fade-down',
  fadeLeft: 'sa-fade-left',
  fadeRight: 'sa-fade-right',
  fadeIn: 'sa-fade-in',
  scaleIn: 'sa-scale-in',
  scaleUp: 'sa-scale-up',
  none: '',
};

const variantTransformMap: Record<AnimationVariant, string> = {
  fadeUp: 'translateY(40px)',
  fadeDown: 'translateY(-40px)',
  fadeLeft: 'translateX(40px)',
  fadeRight: 'translateX(-40px)',
  fadeIn: 'translateY(0)',
  scaleIn: 'scale(0.92)',
  scaleUp: 'scale(0.85)',
  none: 'none',
};

export function useScrollAnimation(
  options: UseScrollAnimationOptions = {},
): ScrollAnimationResult {
  const {
    variant = 'fadeUp',
    threshold = 0.12,
    rootMargin = '0px 0px -40px 0px',
    once = true,
    delay = 0,
    enabled = true,
    duration = 'base',
  } = options;

  const ref = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') {return;}

    const element = ref.current;
    if (!element) {return;}

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasAnimated(true);
          if (once) {
            observerRef.current?.unobserve(element);
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin },
    );

    observerRef.current.observe(element);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [enabled, threshold, rootMargin, once]);

  const durationClass = variant !== 'none'
    ? `sa-duration-${duration}`
    : '';

  const animateClass = isVisible
    ? `${variantClassMap[variant]} ${durationClass} sa-visible`
    : variantClassMap[variant] && durationClass;

  const style: React.CSSProperties = {
    '--sa-delay': `${delay}ms`,
    '--sa-initial-transform': variantTransformMap[variant],
  } as React.CSSProperties;

  return {
    ref,
    isVisible,
    hasAnimated,
    className: animateClass,
    style,
  };
}

/**
 * Hook that returns a child stagger delay based on index.
 * Use with useScrollAnimation for staggered children.
 */
export function getStaggerDelay(
  index: number,
  baseDelay = 60,
  maxDelay = 600,
): number {
  return Math.min(index * baseDelay, maxDelay);
}

/**
 * Hook for parallax scroll effect.
 * Returns a ref and style to create a parallax scrolling element.
 */
export function useParallax(speed = 0.15, enabled = true) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {return;}

    let rafId: number;
    const handleScroll = () => {
      if (!ref.current) {return;}
      rafId = requestAnimationFrame(() => {
        if (!ref.current) {return;}
        const rect = ref.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        // Only apply parallax when element is within viewport
        if (rect.bottom > 0 && rect.top < windowHeight) {
          const center = rect.top + rect.height / 2;
          const offset = (center - windowHeight / 2) * speed;
          ref.current.style.transform = `translateY(${offset}px)`;
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) {cancelAnimationFrame(rafId);}
    };
  }, [speed, enabled]);

  // Trigger initial force update to ensure ref is captured
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      forceUpdate((n) => n + 1);
    },
    [],
  );

  return { ref: setRef };
}
